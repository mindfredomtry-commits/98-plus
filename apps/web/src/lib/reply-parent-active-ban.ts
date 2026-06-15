import type { BanInteraction } from '@98plus/shared';

export function hasActiveParentTimerFields(
  ban: BanInteraction | null | undefined,
): boolean {
  if (!ban || ban.status !== 'active') return false;
  if (ban.expiresAt || ban.checkDueAt) return true;
  return ban.remainingMs != null && ban.remainingMs > 0;
}

/** Build active parent ban for post-reply-success overlay (optimistic or from accept API). */
export function buildActiveParentBanForSuccess(
  incoming: BanInteraction,
  opts?: {
    acceptedAtMs?: number;
    serverBan?: BanInteraction | null;
  },
): BanInteraction {
  const acceptedAtMs = opts?.acceptedAtMs ?? Date.now();
  const serverBan = opts?.serverBan ?? null;
  const durationMinutes =
    serverBan?.durationMinutes ?? incoming.durationMinutes;
  const durationMs = durationMinutes * 60 * 1000;

  const expiresAt =
    serverBan?.expiresAt ??
    serverBan?.checkDueAt ??
    incoming.expiresAt ??
    new Date(acceptedAtMs + durationMs).toISOString();

  const checkDueAt =
    serverBan?.checkDueAt ?? serverBan?.expiresAt ?? expiresAt;

  const expiresMs = new Date(expiresAt).getTime();
  const remainingMs =
    serverBan?.remainingMs ??
    (Number.isFinite(expiresMs)
      ? Math.max(0, expiresMs - Date.now())
      : durationMs);

  return {
    ...incoming,
    ...(serverBan ?? {}),
    id: incoming.id,
    text: serverBan?.text ?? incoming.text,
    status: 'active',
    durationMinutes,
    sender: serverBan?.sender ?? incoming.sender,
    receiver: serverBan?.receiver ?? incoming.receiver,
    isIncoming: true,
    incomingAcknowledged: true,
    expiresAt,
    checkDueAt,
    remainingMs,
    serverNow: serverBan?.serverNow ?? new Date().toISOString(),
  };
}
