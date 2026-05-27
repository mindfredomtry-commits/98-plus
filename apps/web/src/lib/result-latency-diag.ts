/** Result latency diagnostics only — no business logic. */

export type ResultLatencyRole = 'sender' | 'receiver' | 'unknown';

export function resultParticipantRole(
  authUserId: string | null | undefined,
  payload?: {
    sender?: { id?: string };
    receiver?: { id?: string };
    viewerId?: string | null;
  } | null,
): ResultLatencyRole {
  if (!authUserId || !payload) return 'unknown';
  if (payload.sender?.id === authUserId) return 'sender';
  if (payload.receiver?.id === authUserId) return 'receiver';
  if (payload.viewerId === authUserId) {
    if (payload.sender?.id && payload.sender.id !== authUserId) return 'receiver';
    if (payload.receiver?.id && payload.receiver.id !== authUserId) return 'sender';
  }
  return 'unknown';
}

export function resultElapsedSinceSubmit(
  banId: string,
  submitAtByBan: ReadonlyMap<string, number>,
): number | undefined {
  const t0 = submitAtByBan.get(banId);
  if (t0 == null) return undefined;
  return Math.round(performance.now() - t0);
}

export function logResultLatency(
  event: string,
  fields: {
    banId?: string | null;
    authUserId?: string | null;
    role?: ResultLatencyRole;
    source?: string;
    elapsedMs?: number;
    [key: string]: unknown;
  },
): void {
  console.log(event, fields);
}
