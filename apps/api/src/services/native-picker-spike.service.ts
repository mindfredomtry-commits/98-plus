import { randomInt } from 'crypto';
import { prisma } from '../lib/prisma';
import { broadcastToUser } from '../websocket/hub';
import {
  normalizeUsersSharedPayload,
} from './native-picker-spike-parse';

export {
  normalizeUsersSharedPayload,
  type SpikeSharedUserDiag,
  type SpikeUsersSharedDiag,
} from './native-picker-spike-parse';

const SPIKE_TTL_MS = 15 * 60 * 1000;

export type NativePickerSpikeView = {
  id: string;
  status: string;
  telegramRequestId: number;
  preparedButtonId: string | null;
  selectedTelegramUserId: string | null;
  selectedFirstName: string | null;
  selectedLastName: string | null;
  selectedUsername: string | null;
  hasPhotoMeta: boolean;
  messageFromId: string | null;
  registeredInApp: boolean | null;
  requestChatCallback: boolean | null;
  errorMessage: string | null;
  expiresAt: string;
  resolvedAt: string | null;
  /** Diagnostic label for Mini App UI */
  resultLabel: 'PENDING' | 'SELECTED' | 'EXPIRED' | 'ERROR' | 'CANCELLED';
};

function toView(row: {
  id: string;
  status: string;
  telegramRequestId: number;
  preparedButtonId: string | null;
  selectedUserId: bigint | null;
  selectedFirstName: string | null;
  selectedLastName: string | null;
  selectedUsername: string | null;
  hasPhotoMeta: boolean;
  messageFromId: bigint | null;
  registeredInApp: boolean | null;
  requestChatCallback: boolean | null;
  errorMessage: string | null;
  expiresAt: Date;
  resolvedAt: Date | null;
}): NativePickerSpikeView {
  const expired =
    row.status === 'pending' && row.expiresAt.getTime() < Date.now();
  const status = expired ? 'expired' : row.status;
  let resultLabel: NativePickerSpikeView['resultLabel'] = 'PENDING';
  if (status === 'selected') resultLabel = 'SELECTED';
  else if (status === 'expired') resultLabel = 'EXPIRED';
  else if (status === 'error') resultLabel = 'ERROR';
  else if (status === 'cancelled') resultLabel = 'CANCELLED';

  return {
    id: row.id,
    status,
    telegramRequestId: row.telegramRequestId,
    preparedButtonId: row.preparedButtonId,
    selectedTelegramUserId:
      row.selectedUserId != null ? row.selectedUserId.toString() : null,
    selectedFirstName: row.selectedFirstName,
    selectedLastName: row.selectedLastName,
    selectedUsername: row.selectedUsername,
    hasPhotoMeta: row.hasPhotoMeta,
    messageFromId:
      row.messageFromId != null ? row.messageFromId.toString() : null,
    registeredInApp: row.registeredInApp,
    requestChatCallback: row.requestChatCallback,
    errorMessage: row.errorMessage,
    expiresAt: row.expiresAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resultLabel,
  };
}

/**
 * Bot API: savePreparedKeyboardButton with request_users.
 * Uses HTTPS Bot API directly (does not require Telegraf polling to be healthy).
 */
export async function savePreparedRequestUsersButton(params: {
  viewerTelegramId: number;
  telegramRequestId: number;
}): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN not set');
  }

  const res = await fetch(
    `https://api.telegram.org/bot${token}/savePreparedKeyboardButton`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: params.viewerTelegramId,
        button: {
          text: 'Select contact (spike)',
          request_users: {
            request_id: params.telegramRequestId,
            user_is_bot: false,
            max_quantity: 1,
            request_name: true,
            request_username: true,
            request_photo: true,
          },
        },
      }),
    },
  );
  const data = (await res.json()) as {
    ok?: boolean;
    description?: string;
    result?: { id?: string };
  };
  if (!data.ok || !data.result?.id) {
    throw new Error(
      data.description ?? 'savePreparedKeyboardButton_failed',
    );
  }
  return data.result.id;
}

export async function beginNativePickerSpike(params: {
  ownerUserId: string;
  ownerTelegramId: string;
}): Promise<{ preparedId: string; request: NativePickerSpikeView }> {
  const ownerTelegramId = BigInt(params.ownerTelegramId);
  const telegramRequestId = randomInt(1, 2_147_483_647);
  const expiresAt = new Date(Date.now() + SPIKE_TTL_MS);

  // Supersede prior pending spikes for this viewer
  await prisma.nativePickerSpikeRequest.updateMany({
    where: { ownerUserId: params.ownerUserId, status: 'pending' },
    data: { status: 'cancelled', resolvedAt: new Date() },
  });

  let preparedButtonId: string;
  try {
    preparedButtonId = await savePreparedRequestUsersButton({
      viewerTelegramId: Number(ownerTelegramId),
      telegramRequestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[spike-native-picker] savePreparedKeyboardButton failed', {
      ownerUserId: params.ownerUserId,
      error: message,
    });
    const failed = await prisma.nativePickerSpikeRequest.create({
      data: {
        ownerUserId: params.ownerUserId,
        ownerTelegramId,
        telegramRequestId,
        status: 'error',
        errorMessage: message,
        expiresAt,
        resolvedAt: new Date(),
      },
    });
    return {
      preparedId: '',
      request: toView(failed),
    };
  }

  const row = await prisma.nativePickerSpikeRequest.create({
    data: {
      ownerUserId: params.ownerUserId,
      ownerTelegramId,
      telegramRequestId,
      preparedButtonId,
      status: 'pending',
      expiresAt,
    },
  });

  console.log('[spike-native-picker] begin', {
    id: row.id,
    ownerUserId: params.ownerUserId,
    ownerTelegramId: ownerTelegramId.toString(),
    telegramRequestId,
    preparedButtonId,
  });

  return {
    preparedId: preparedButtonId,
    request: toView(row),
  };
}

export async function getNativePickerSpikeForOwner(
  ownerUserId: string,
  requestId: string,
): Promise<NativePickerSpikeView | null> {
  const row = await prisma.nativePickerSpikeRequest.findFirst({
    where: { id: requestId, ownerUserId },
  });
  if (!row) return null;
  if (row.status === 'pending' && row.expiresAt.getTime() < Date.now()) {
    const updated = await prisma.nativePickerSpikeRequest.update({
      where: { id: row.id },
      data: { status: 'expired', resolvedAt: new Date() },
    });
    return toView(updated);
  }
  return toView(row);
}

export async function recordSpikeRequestChatCallback(
  ownerUserId: string,
  requestId: string,
  ok: boolean,
): Promise<NativePickerSpikeView | null> {
  const row = await prisma.nativePickerSpikeRequest.findFirst({
    where: { id: requestId, ownerUserId },
  });
  if (!row) return null;
  const updated = await prisma.nativePickerSpikeRequest.update({
    where: { id: row.id },
    data: {
      requestChatCallback: ok,
      ...(ok
        ? {}
        : row.status === 'pending'
          ? { status: 'cancelled', resolvedAt: new Date() }
          : {}),
    },
  });
  console.log('[spike-native-picker] requestChat callback', {
    id: requestId,
    ok,
    status: updated.status,
  });
  return toView(updated);
}

export async function handleUsersSharedSpike(params: {
  messageFromId: number;
  usersShared: unknown;
}): Promise<void> {
  const normalized = normalizeUsersSharedPayload(params.usersShared);
  if (!normalized) {
    console.warn('[spike-native-picker] users_shared unparseable', {
      messageFromId: params.messageFromId,
      usersShared: params.usersShared,
    });
    return;
  }

  const selected = normalized.users[0];
  if (!selected) {
    console.warn('[spike-native-picker] users_shared empty users[]', {
      messageFromId: params.messageFromId,
      request_id: normalized.request_id,
    });
    return;
  }

  const selectedUserId = BigInt(String(selected.user_id));
  const hasPhotoMeta = Array.isArray(selected.photo)
    ? selected.photo.length > 0
    : selected.photo != null;

  console.log('[spike-native-picker] users_shared received', {
    messageFromId: params.messageFromId,
    request_id: normalized.request_id,
    selected_user_id: selectedUserId.toString(),
    first_name: selected.first_name,
    last_name: selected.last_name,
    username: selected.username,
    hasPhotoMeta,
    raw: normalized,
  });

  const pending = await prisma.nativePickerSpikeRequest.findFirst({
    where: {
      ownerTelegramId: BigInt(params.messageFromId),
      telegramRequestId: normalized.request_id,
      status: 'pending',
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!pending) {
    console.warn('[spike-native-picker] no pending request for correlation', {
      messageFromId: params.messageFromId,
      request_id: normalized.request_id,
    });
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { telegramId: selectedUserId },
    select: { id: true },
  });

  const updated = await prisma.nativePickerSpikeRequest.update({
    where: { id: pending.id },
    data: {
      status: 'selected',
      selectedUserId,
      selectedFirstName: selected.first_name ?? null,
      selectedLastName: selected.last_name ?? null,
      selectedUsername: selected.username ?? null,
      hasPhotoMeta,
      messageFromId: BigInt(params.messageFromId),
      registeredInApp: !!existing,
      rawUsersShared: normalized as object,
      resolvedAt: new Date(),
    },
  });

  const view = toView(updated);
  broadcastToUser(pending.ownerUserId, {
    type: 'spike:native-picker',
    payload: view,
  });

  console.log('[spike-native-picker] resolved', {
    id: updated.id,
    registeredInApp: !!existing,
    selectedTelegramUserId: selectedUserId.toString(),
  });
}
