'use client';

import { normalizeId } from './normalize-json';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

let lastPayloadReadyBanId: string | null = null;
let lastPayloadReadyAt = 0;
let banLostBugLoggedFor: string | null = null;
let stableBanLostBugLoggedFor: string | null = null;

export function markIncomingNextPayloadReadyBan(
  banId: string,
  ready: boolean,
): void {
  if (!ready || !banId.trim()) return;
  lastPayloadReadyBanId = banId.trim();
  lastPayloadReadyAt = performance.now();
  banLostBugLoggedFor = null;
  stableBanLostBugLoggedFor = null;
}

export function peekLastIncomingPayloadReadyBanId(): string | null {
  return lastPayloadReadyBanId;
}

export function clearIncomingPayloadReadyTrack(banId?: string | null): void {
  const norm = banId?.trim() ?? '';
  if (!norm || lastPayloadReadyBanId === norm) {
    lastPayloadReadyBanId = null;
    lastPayloadReadyAt = 0;
    banLostBugLoggedFor = null;
    stableBanLostBugLoggedFor = null;
  }
}

export function logIncomingStableBanSet(data: Record<string, unknown>): void {
  emit('[INCOMING STABLE BAN SET]', data);
  const banId = String(data.banId ?? '').trim();
  if (banId) {
    lastPayloadReadyBanId = banId;
    lastPayloadReadyAt = performance.now();
    banLostBugLoggedFor = null;
    stableBanLostBugLoggedFor = null;
  }
}

export function logIncomingStableBanUsed(data: Record<string, unknown>): void {
  emit('[INCOMING STABLE BAN USED]', data);
}

export function logIncomingStableBanCleared(data: Record<string, unknown>): void {
  emit('[INCOMING STABLE BAN CLEARED]', data);
}

export function logIncomingStableBanClearBlocked(
  data: Record<string, unknown>,
): void {
  emit('[INCOMING STABLE BAN CLEAR BLOCKED]', data);
}

export function logIncomingOverlayStateSet(
  data: Record<string, unknown>,
): void {
  emit('[INCOMING OVERLAY STATE SET]', data);
}

export function logIncomingOverlayRenderEnter(
  data: Record<string, unknown>,
): void {
  emit('[INCOMING OVERLAY RENDER ENTER]', data);
}

export function logIncomingOverlayHasBan(data: Record<string, unknown>): void {
  emit('[INCOMING OVERLAY HAS BAN]', data);
}

export function logIncomingOverlayReturnNull(
  data: Record<string, unknown>,
): void {
  emit('[INCOMING OVERLAY RETURN NULL]', data);
}

export function logIncomingBranchSkippedForNonIncomingKind(data: {
  activeOverlayKind: string | null;
  queueHeadKind: string | null;
  effectiveKind: string | null;
  selectedBanId: string | null;
  decisionReason: string;
}): void {
  emit('INCOMING_BRANCH_SKIPPED_FOR_NON_INCOMING_KIND', data);
}

export function shouldRunIncomingJsxBranch(input: {
  activeOverlayKind: string | null;
  queueHeadKind: string | null;
  effectiveKind: string | null;
  notificationQueueShellKind: string | null;
  replyIncomingPathActive: boolean;
}): { allowed: boolean; decisionReason: string } {
  if (input.replyIncomingPathActive) {
    return { allowed: true, decisionReason: 'reply-incoming-path-active' };
  }

  const kinds = [
    input.activeOverlayKind,
    input.queueHeadKind,
    input.effectiveKind,
    input.notificationQueueShellKind,
  ];
  const nonIncoming = kinds.find((kind) => kind === 'check' || kind === 'result');
  if (nonIncoming) {
    return {
      allowed: false,
      decisionReason: `non-incoming-kind-${nonIncoming}`,
    };
  }

  const hasIncoming = kinds.some((kind) => kind === 'incoming');
  if (hasIncoming) {
    return { allowed: true, decisionReason: 'incoming-kind-active' };
  }

  return { allowed: false, decisionReason: 'no-incoming-kind' };
}

export function logIncomingOverlayBlocked(data: Record<string, unknown>): void {
  emit('[INCOMING OVERLAY BLOCKED]', data);
}

export function logIncomingOverlayJsxReturn(
  data: Record<string, unknown>,
): void {
  emit('[INCOMING OVERLAY JSX RETURN]', data);
}

export function logIncomingCardMounted(data: Record<string, unknown>): void {
  emit('[INCOMING CARD MOUNTED]', data);
  const banId = String(data.banId ?? '').trim();
  if (banId) clearIncomingPayloadReadyTrack(banId);
}

export function logIncomingReadyButBanLostBug(
  data: Record<string, unknown>,
): void {
  const readyBanId =
    String(data.readyBanId ?? lastPayloadReadyBanId ?? '').trim() || null;
  if (!readyBanId) return;
  const displayBanId = String(data.incomingCardDisplayBanId ?? '').trim();
  const stableBanId = String(data.activeIncomingOverlayBanId ?? '').trim();
  if (
    normalizeId(displayBanId) === normalizeId(readyBanId) ||
    normalizeId(stableBanId) === normalizeId(readyBanId)
  ) {
    return;
  }
  if (banLostBugLoggedFor === readyBanId) return;
  banLostBugLoggedFor = readyBanId;
  emit('[INCOMING READY BUT BAN LOST BUG]', {
    readyBanId,
    readyAgeMs: Math.round(performance.now() - lastPayloadReadyAt),
    ...data,
  });
}

export function logIncomingReadyButStableBanLostBug(
  data: Record<string, unknown>,
): void {
  const readyBanId =
    String(data.readyBanId ?? lastPayloadReadyBanId ?? '').trim() || null;
  if (!readyBanId) return;
  const stableBanId = String(data.activeIncomingOverlayBanId ?? '').trim();
  if (normalizeId(stableBanId) === normalizeId(readyBanId)) return;
  if (stableBanLostBugLoggedFor === readyBanId) return;
  stableBanLostBugLoggedFor = readyBanId;
  emit('[INCOMING READY BUT STABLE BAN LOST BUG]', {
    readyBanId,
    readyAgeMs: Math.round(performance.now() - lastPayloadReadyAt),
    ...data,
  });
}
