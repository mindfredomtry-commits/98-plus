'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logLobbyBansCtaClick(data: Record<string, unknown>): void {
  emit('[LOBBY BANS CTA CLICK]', data);
}

export function logLobbyBansCtaHasNotifications(
  data: Record<string, unknown>,
): void {
  emit('[LOBBY BANS CTA HAS NOTIFICATIONS]', data);
}

export function logLobbyBansCtaStartDrain(data: Record<string, unknown>): void {
  emit('[LOBBY BANS CTA START DRAIN]', data);
}

export function logLobbyBansCtaPendingSnapshot(
  data: Record<string, unknown>,
): void {
  emit('[LOBBY BANS CTA PENDING SNAPSHOT]', data);
}

export function logLobbyBansCtaPendingMerged(
  data: Record<string, unknown>,
): void {
  emit('[LOBBY BANS CTA PENDING MERGED]', data);
}

export function logLobbyBansCtaPendingLostBug(
  data: Record<string, unknown>,
): void {
  emit('[LOBBY BANS CTA PENDING LOST BUG]', data);
}

export function logLobbyBansCtaShowNext(data: Record<string, unknown>): void {
  emit('[LOBBY BANS CTA SHOW NEXT]', data);
}

export function logLobbyBansCtaEmptyOpenSection(
  data: Record<string, unknown>,
): void {
  emit('[LOBBY BANS CTA EMPTY OPEN SECTION]', data);
}

export function logLobbyBansCtaDrainBug(data: Record<string, unknown>): void {
  emit('[LOBBY BANS CTA DRAIN BUG]', data);
}

/** v33 — lobby-bans-cta routing: drain vs direct section open. */
export function logLobbyBansCtaRouteDiag(
  data: Record<string, unknown>,
): void {
  emit('[LOBBY BANS CTA ROUTE DIAG]', data);
}

/** v33 — delay before empty bans section open (prefetch / chain / placeholder). */
export function logLobbyBansCtaEmptyDelayDiag(
  data: Record<string, unknown>,
): void {
  emit('[LOBBY BANS CTA EMPTY DELAY DIAG]', data);
}

/** v34 — instant bans section open without prefetch/drain. */
export function logLobbyBansDirectOpen(data: Record<string, unknown>): void {
  emit('[LOBBY BANS DIRECT OPEN]', data);
}

export type LobbyBansNotificationDrainOutcome =
  | 'drained'
  | 'empty'
  | 'drain-failed';
