'use client';

import type { OwnerMetaMirrorPatch } from '@/lib/notification-overlay-owner';
import {
  getDeeplinkSingleCardMode,
  isDeeplinkSingleCardModeActive,
} from '@/lib/deeplink-single-card-mode';
import { getFreshDeepLinkEntrySnapshot } from '@/lib/fresh-deeplink-entry';

/** Step 3 Phase 7 — deeplink module state mirror patch (shadow only). */
export type OwnerDeeplinkMetaMirrorPatch = Pick<
  OwnerMetaMirrorPatch,
  'deeplinkSingleCard' | 'deeplinkSingleCardContext' | 'freshDeeplinkEntry'
>;

type OwnerDeeplinkMetaMirrorFn = (
  source: string,
  patch: OwnerDeeplinkMetaMirrorPatch,
) => void;

let ownerDeeplinkMetaMirror: OwnerDeeplinkMetaMirrorFn | null = null;

export function registerOwnerDeeplinkMetaMirror(
  fn: OwnerDeeplinkMetaMirrorFn | null,
): void {
  ownerDeeplinkMetaMirror = fn;
}

export function buildOwnerDeeplinkMetaMirrorPatch(): OwnerDeeplinkMetaMirrorPatch {
  const cardMode = getDeeplinkSingleCardMode();
  return {
    deeplinkSingleCard: isDeeplinkSingleCardModeActive(),
    deeplinkSingleCardContext: cardMode
      ? { kind: cardMode.kind, banId: cardMode.banId }
      : null,
    freshDeeplinkEntry: getFreshDeepLinkEntrySnapshot(),
  };
}

/** Mirror-write after deeplink module state mutations (production read path unchanged). */
export function mirrorOwnerDeeplinkMetaWrite(source: string): void {
  ownerDeeplinkMetaMirror?.(source, buildOwnerDeeplinkMetaMirrorPatch());
}
