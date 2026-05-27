import type { SessionState } from '@98plus/shared';

/** Stable session content key — ignores serverNow so duplicate applies are skipped. */
export function buildSessionFingerprint(
  s: SessionState,
  viewerId: string,
): string {
  const activeIds = [...(s.active ?? [])]
    .map((b) => b.id)
    .sort()
    .join(',');
  return [
    viewerId,
    s.incoming?.id ?? '',
    s.incoming?.status ?? '',
    s.incoming?.incomingAcknowledged ? '1' : '0',
    s.check?.id ?? '',
    s.check?.status ?? '',
    s.checkWaiting ? '1' : '0',
    s.pendingResultId ?? '',
    activeIds,
  ].join('|');
}
