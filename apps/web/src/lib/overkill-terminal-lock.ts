import type { BanResult } from '@98plus/shared';

export function resolveBanResultOutcome(
  result: Pick<BanResult, 'outcome' | 'status'> | null | undefined,
): string {
  return (result?.outcome ?? result?.status ?? '').trim().toLowerCase();
}

export function isOverkillTerminalOutcome(
  outcome: string | null | undefined,
): boolean {
  return outcome === 'overboard';
}

export function shouldAllowTerminalResultForBan(
  banId: string,
  requestedOutcome: string | null | undefined,
  lockedBanIds: ReadonlySet<string>,
): { allowed: boolean; reason: string | null } {
  const norm = banId.trim();
  if (!norm || !lockedBanIds.has(norm)) {
    return { allowed: true, reason: null };
  }
  if (isOverkillTerminalOutcome(requestedOutcome)) {
    return { allowed: true, reason: 'overkill-terminal-match' };
  }
  return { allowed: false, reason: 'overkill-terminal-locked' };
}

/** Keep terminal overkill fields when API sync merges a conflicting outcome. */
export function preserveOverkillTerminalFields(
  prev: BanResult,
  merged: BanResult,
): BanResult {
  if (!isOverkillTerminalOutcome(resolveBanResultOutcome(prev))) {
    return merged;
  }
  return {
    ...merged,
    outcome: prev.outcome,
    status: prev.status,
    headline: prev.headline,
  };
}
