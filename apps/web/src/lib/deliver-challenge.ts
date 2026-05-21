import {
  ANALYTICS_EVENTS,
  type BanInteraction,
  type FriendCard,
  type SendBanResponse,
} from '@98plus/shared';
import { safeResolveReceiverTarget } from '@/lib/resolve-receiver';
import { api, ApiError, NetworkError } from '@/lib/api';

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
  if (!username) {
    throw new ChallengeDeliveryError('Не указан получатель', 'target');
  }

  const resolved = safeResolveReceiverTarget(username, params.friends, {
    receiverUserId: params.receiverUserId,
    receiverTelegramId: params.receiverTelegramId,
  });

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
    receiverUsername: username,
  };
  if (resolved.receiverUserId) {
    body.receiverUserId = resolved.receiverUserId;
  }
  if (resolved.receiverTelegramId) {
    body.receiverTelegramId = resolved.receiverTelegramId;
  }

  let res: SendBanResponse;
  try {
    res = await api<SendBanResponse>('/bans/send', {
      method: 'POST',
      token: params.token,
      body: JSON.stringify(body),
      retries: 2,
    });
  } catch (e) {
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
      throw new ChallengeDeliveryError(
        'Этот человек ещё не в 98+ — ответный вызов невозможен',
        'target',
      );
    }
    return res;
  }

  if (!res.ban && !res.pending) {
    throw new ChallengeDeliveryError('Сервер не вернул вызов', 'api');
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
