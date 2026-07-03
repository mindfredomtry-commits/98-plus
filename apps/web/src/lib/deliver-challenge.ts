import {
  ANALYTICS_EVENTS,
  type BanInteraction,
  type FriendCard,
  type SendBanResponse,
} from '@98plus/shared';
import { safeResolveReceiverTarget } from '@/lib/resolve-receiver';
import { api, ApiError, NetworkError } from '@/lib/api';
import {
  DEFAULT_SEND_TIMEOUT_MS,
  RequestTimeoutError,
} from '@/lib/request-timeout';
import { timingLog } from '@/lib/timing-log';
import { isClientDevAuthEnabled } from '@/lib/config';
import {
  logSendBanResponseTrace,
  readCreatedBanIdFromSendResponse,
  readIncomingNotificationSentFromSendResponse,
  snapshotSendBanResponseJson,
} from '@/lib/send-ban-response-trace';

export type DeliveryErrorCode =
  | 'network'
  | 'auth'
  | 'invalid'
  | 'target'
  | 'api';

export class ChallengeDeliveryError extends Error {
  code: DeliveryErrorCode;

  constructor(message: string, code: DeliveryErrorCode) {
    super(message);
    this.name = 'ChallengeDeliveryError';
    this.code = code;
  }
}

export function formatDeliveryError(err: unknown): string {
  if (err instanceof ChallengeDeliveryError) return err.message;
  if (err instanceof RequestTimeoutError) return err.message;
  if (err instanceof NetworkError) {
    return 'Нет связи с сервером. Проверь интернет или настрой API URL.';
  }
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return 'Сессия устарела. Закрой и снова открой Mini App из Telegram.';
    }
    if (err.status === 404) {
      return 'Вызов не найден или уже закрыт.';
    }
    return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Не удалось отправить вызов';
}

export function validateReplyTarget(
  ban: BanInteraction | null | undefined,
): { receiverUserId: string; receiverUsername: string } {
  if (!ban?.id) {
    throw new ChallengeDeliveryError('Вызов ещё не загружен', 'invalid');
  }
  const receiverUserId = ban.sender?.id?.trim();
  const receiverUsername = (
    ban.sender?.username ??
    ban.sender?.firstName ??
    ''
  )
    .replace(/^@/, '')
    .trim();

  if (!receiverUserId) {
    throw new ChallengeDeliveryError(
      'Не найден отправитель — перезапусти Mini App',
      'target',
    );
  }
  if (!receiverUsername) {
    throw new ChallengeDeliveryError('У отправителя нет username', 'target');
  }

  return { receiverUserId, receiverUsername };
}

export async function verifyIncomingChallenge(
  token: string,
  banId: string,
): Promise<BanInteraction> {
  try {
    const { ban } = await api<{ ban: BanInteraction | null }>(
      `/bans/${banId}/open`,
      { token, retries: 1 },
    );
    if (!ban?.id || !ban.sender?.id) {
      throw new ChallengeDeliveryError(
        'Вызов не найден на сервере',
        'invalid',
      );
    }
    return ban;
  } catch (e) {
    if (e instanceof ChallengeDeliveryError) throw e;
    if (e instanceof ApiError && e.status === 404) {
      throw new ChallengeDeliveryError('Вызов не найден', 'invalid');
    }
    throw e;
  }
}

export interface DeliverChallengeParams {
  token: string;
  text: string;
  durationMinutes: number;
  receiverUsername: string;
  receiverUserId?: string | null;
  receiverTelegramId?: string | null;
  friends?: FriendCard[] | null;
  /** When true, never open Telegram share (reply / registered duel) */
  directOnly?: boolean;
}

export async function deliverDirectChallenge(
  params: DeliverChallengeParams,
): Promise<SendBanResponse> {
  const text = params.text.trim();
  const username = params.receiverUsername.replace(/^@/, '').trim();

  if (!params.token) {
    throw new ChallengeDeliveryError('Нет авторизации', 'auth');
  }
  if (!text || text.length < 3) {
    throw new ChallengeDeliveryError('Напиши текст запрета', 'invalid');
  }

  const resolved = safeResolveReceiverTarget(username, params.friends, {
    receiverUserId: params.receiverUserId,
    receiverTelegramId: params.receiverTelegramId,
  });

  if (
    !username &&
    !resolved.receiverUserId &&
    !resolved.receiverTelegramId
  ) {
    throw new ChallengeDeliveryError('Не указан получатель', 'target');
  }

  if (
    params.directOnly &&
    !resolved.receiverUserId &&
    !resolved.receiverTelegramId
  ) {
    throw new ChallengeDeliveryError(
      'Получатель не зарегистрирован — нужен прямой id',
      'target',
    );
  }

  const body: Record<string, unknown> = {
    text,
    durationMinutes: params.durationMinutes,
  };
  if (username) {
    body.receiverUsername = username;
  }
  const userId = resolved.receiverUserId?.trim();
  if (
    userId &&
    !userId.startsWith('contact:') &&
    !userId.startsWith('optimistic')
  ) {
    body.receiverUserId = userId;
  }
  if (resolved.receiverTelegramId) {
    body.receiverTelegramId = resolved.receiverTelegramId;
  }

  console.info('[98+] sendBan payload', body);

  const traceSendBanResponse = (
    source: string,
    extra: {
      ok: boolean;
      httpStatus: number | null;
      responseJson?: unknown;
      createdBanId?: string | null;
      incomingNotificationSent?: boolean | null;
      error?: unknown;
      thrownAfterCreate?: boolean;
      successCardWillOpen?: boolean | null;
      failureReason?: string | null;
    },
  ) => {
    const err = extra.error;
    logSendBanResponseTrace({
      source,
      banText: text,
      targetUserId:
        userId ??
        resolved.receiverUserId?.trim() ??
        resolved.receiverTelegramId?.toString() ??
        null,
      durationMinutes: params.durationMinutes,
      httpStatus: extra.httpStatus,
      ok: extra.ok,
      responseJson:
        extra.responseJson != null
          ? snapshotSendBanResponseJson(extra.responseJson)
          : null,
      createdBanId:
        extra.createdBanId ??
        (extra.responseJson != null
          ? readCreatedBanIdFromSendResponse(extra.responseJson)
          : null),
      incomingNotificationSent:
        extra.incomingNotificationSent ??
        (extra.responseJson != null
          ? readIncomingNotificationSentFromSendResponse(extra.responseJson)
          : null),
      errorName:
        err instanceof Error ? err.name : err != null ? typeof err : null,
      errorMessage:
        err instanceof Error
          ? err.message
          : err != null
            ? String(err)
            : null,
      thrownAfterCreate: extra.thrownAfterCreate ?? false,
      successCardWillOpen: extra.successCardWillOpen ?? null,
      failureReason: extra.failureReason ?? null,
    });
  };

  let res: SendBanResponse;
  const started = performance.now();
  try {
    res = await api<SendBanResponse>('/bans/send', {
      method: 'POST',
      token: params.token,
      body: JSON.stringify(body),
      retries: 0,
      timeoutMs: DEFAULT_SEND_TIMEOUT_MS,
    });
    timingLog('sendBan request', performance.now() - started);
    traceSendBanResponse('deliverDirectChallenge:api-ok', {
      ok: true,
      httpStatus: 200,
      responseJson: res,
      failureReason: null,
    });
    console.info('[98+] sendBan response', {
      hasBan: !!res.ban,
      banId: res.ban?.id,
      pending: res.pending,
      requiresShare: res.requiresShare,
      notificationDebug: (res as { notificationDebug?: unknown })
        .notificationDebug,
    });
  } catch (e) {
    const createdBanIdBeforeError = readCreatedBanIdFromSendResponse(
      (e as { responseBody?: unknown }).responseBody,
    );
    const failed = {
      error: e instanceof Error ? e.name : typeof e,
      status: e instanceof ApiError ? e.status : undefined,
      message: e instanceof Error ? e.message : String(e),
    };
    traceSendBanResponse('deliverDirectChallenge:api-error', {
      ok: false,
      httpStatus:
        e instanceof ApiError
          ? e.status
          : e instanceof RequestTimeoutError
            ? 408
            : e instanceof NetworkError
              ? 0
              : null,
      error: e,
      thrownAfterCreate: Boolean(createdBanIdBeforeError),
      createdBanId: createdBanIdBeforeError,
      failureReason:
        e instanceof RequestTimeoutError
          ? 'request-timeout'
          : e instanceof ApiError
            ? `api-error:${e.status}`
            : e instanceof NetworkError
              ? 'network-error'
              : 'api-throw',
    });
    console.error('[98+] sendBan failed', failed);
    if (e instanceof ApiError && e.status === 401) {
      throw new ChallengeDeliveryError(
        'Сессия устарела. Перезапусти Mini App.',
        'auth',
      );
    }
    throw e;
  }

  if (params.directOnly) {
    if (res.requiresShare || res.pending || !res.ban) {
      traceSendBanResponse('deliverDirectChallenge:direct-only-rejected', {
        ok: true,
        httpStatus: 200,
        responseJson: res,
        failureReason: 'direct-only-requires-registered-ban',
      });
      throw new ChallengeDeliveryError(
        'Этот человек ещё не в 98+ — ответный вызов невозможен',
        'target',
      );
    }
    return res;
  }

  if (!res.ban && !res.pending) {
    traceSendBanResponse('deliverDirectChallenge:no-ban-no-pending', {
      ok: true,
      httpStatus: 200,
      responseJson: res,
      failureReason: 'response-missing-ban-and-pending',
    });
    throw new ChallengeDeliveryError('Сервер не вернул вызов', 'api');
  }

  /** Registered direct send — ban exists, ignore stale share flags. */
  if (res.ban && resolved.receiverUserId && (res.requiresShare || res.pending)) {
    return {
      ...res,
      requiresShare: false,
      pending: false,
    };
  }

  if (isClientDevAuthEnabled() && (res.requiresShare || res.pending)) {
    throw new ChallengeDeliveryError(
      'Dev: выбери Dev Peer — этот получатель не зарегистрирован на сервере',
      'target',
    );
  }

  return res;
}

export async function clearPendingIncomingAfterReply(
  token: string,
  parentBan: BanInteraction,
): Promise<void> {
  if (parentBan.status !== 'pending') return;
  try {
    await api(`/bans/${parentBan.id}/reject`, {
      method: 'POST',
      token,
      retries: 1,
    });
  } catch {
    /* non-fatal */
  }
}
