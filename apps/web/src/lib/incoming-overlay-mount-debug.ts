'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

let lastPayloadReadyBanId: string | null = null;
let lastPayloadReadyAt = 0;
let banLostBugLoggedFor: string | null = null;

export function markIncomingNextPayloadReadyBan(
  banId: string,
  ready: boolean,
): void {
  if (!ready || !banId.trim()) return;
  lastPayloadReadyBanId = banId.trim();
  lastPayloadReadyAt = performance.now();
  banLostBugLoggedFor = null;
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
  }
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
  if (displayBanId === readyBanId) return;
  if (banLostBugLoggedFor === readyBanId) return;
  banLostBugLoggedFor = readyBanId;
  emit('[INCOMING READY BUT BAN LOST BUG]', {
    readyBanId,
    readyAgeMs: Math.round(performance.now() - lastPayloadReadyAt),
    ...data,
  });
}
