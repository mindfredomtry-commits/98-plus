import type { BanInteraction } from '@98plus/shared';
import { replyPreviewFromBan } from '@98plus/shared';
import { redis } from '../lib/redis';
import { mapBanToInteraction } from './ban.service';

const REPLY_PREVIEW_TTL_SEC = 86_400;

function previewKey(receiverUserId: string, banId: string): string {
  return `reply-preview:${receiverUserId}:${banId}`;
}

export async function storeReplyDeeplinkPreview(
  receiverUserId: string,
  ban: BanInteraction,
): Promise<void> {
  if (!ban.id || ban.receiver?.id !== receiverUserId) return;
  await redis.set(
    previewKey(receiverUserId, ban.id),
    JSON.stringify(ban),
    'EX',
    REPLY_PREVIEW_TTL_SEC,
  );
  console.log('[BOT REPLY PREVIEW CREATED]', {
    banId: ban.id,
    receiverUserId,
    hasText: !!ban.text?.trim(),
    hasSender: !!ban.sender?.id,
  });
}

export async function getReplyDeeplinkPreview(
  receiverUserId: string,
  banId: string,
): Promise<BanInteraction | null> {
  const raw = await redis.get(previewKey(receiverUserId, banId));
  if (!raw) return null;
  try {
    const ban = JSON.parse(raw) as BanInteraction;
    if (ban.id !== banId) return null;
    if (ban.receiver?.id && ban.receiver.id !== receiverUserId) return null;
    if (!ban.text?.trim()) return null;
    return ban;
  } catch {
    return null;
  }
}

export async function storeReplyPreviewForReceiver(
  banId: string,
  receiverUserId: string,
): Promise<BanInteraction | null> {
  const ban = await mapBanToInteraction(banId, receiverUserId);
  if (!ban?.text?.trim()) return null;
  await storeReplyDeeplinkPreview(receiverUserId, ban);
  return ban;
}

export function startParamPreviewFromBan(
  ban: BanInteraction,
): ReturnType<typeof replyPreviewFromBan> {
  return replyPreviewFromBan(ban);
}
