import type { BanInteraction } from '@98plus/shared';
import { parseStartParam } from '@98plus/shared';
import { readStartParamRawFromLocation } from '@/lib/deep-link-boot-debug';
import { enrichBanInteraction } from '@/lib/user-public-avatar';

let earlyAuthReplyPreview: BanInteraction | null = null;
const listeners = new Set<(preview: BanInteraction) => void>();

export function isReplyDeepLinkStartParamPending(): boolean {
  const raw = readStartParamRawFromLocation();
  return parseStartParam(raw ?? undefined)?.type === 'reply';
}

/** Synchronous stash — available before React state / openReplyDeepLinkFast. */
export function stashAuthReplyPreviewEarly(
  preview: BanInteraction | null | undefined,
): BanInteraction | null {
  if (!preview?.id || !preview.text?.trim()) return null;
  const enriched = enrichBanInteraction(preview);
  earlyAuthReplyPreview = enriched;
  console.log('[AUTH REPLY PREVIEW STASHED EARLY]', {
    banId: enriched.id,
    hasText: true,
    hasSender: !!enriched.sender?.id,
  });
  for (const listener of listeners) {
    listener(enriched);
  }
  return enriched;
}

export function getAuthReplyPreviewStash(): BanInteraction | null {
  return earlyAuthReplyPreview;
}

export function subscribeAuthReplyPreviewEarly(
  listener: (preview: BanInteraction) => void,
): () => void {
  listeners.add(listener);
  if (earlyAuthReplyPreview) {
    listener(earlyAuthReplyPreview);
  }
  return () => {
    listeners.delete(listener);
  };
}

export function clearAuthReplyPreviewStash(): void {
  earlyAuthReplyPreview = null;
}
