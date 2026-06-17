'use client';

import {
  logCheckDeeplinkBootHoldActive,
  logCheckDeeplinkBootHoldRelease,
  logCheckDeeplinkBootHoldStart,
} from '@/lib/check-deeplink-startup-debug';

type CheckDeeplinkBootHoldReleaseReason = 'overlay-set' | 'fallback-lobby';

type CheckDeeplinkBootHoldState = {
  active: boolean;
  banId: string | null;
};

let hold: CheckDeeplinkBootHoldState = { active: false, banId: null };
const listeners = new Set<() => void>();

function notifyCheckDeeplinkBootHold(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeCheckDeeplinkBootHold(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isCheckDeeplinkBootHoldActive(): boolean {
  return hold.active;
}

export function readCheckDeeplinkBootHoldBanId(): string | null {
  return hold.banId;
}

export function startCheckDeeplinkBootHold(banId: string): void {
  const normalized = banId.trim();
  if (!normalized) return;
  if (hold.active && hold.banId === normalized) {
    logCheckDeeplinkBootHoldActive({ banId: normalized });
    return;
  }
  hold = { active: true, banId: normalized };
  logCheckDeeplinkBootHoldStart({ banId: normalized });
  logCheckDeeplinkBootHoldActive({ banId: normalized });
  notifyCheckDeeplinkBootHold();
}

export function releaseCheckDeeplinkBootHold(
  reason: CheckDeeplinkBootHoldReleaseReason,
  banId?: string | null,
): void {
  if (!hold.active) return;
  const releasedBanId = banId?.trim() || hold.banId;
  hold = { active: false, banId: null };
  logCheckDeeplinkBootHoldRelease({
    banId: releasedBanId,
    reason,
  });
  notifyCheckDeeplinkBootHold();
}
