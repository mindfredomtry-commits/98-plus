import type { SessionState } from '@98plus/shared';
import { getCheckViewerRole } from '@98plus/shared';
import {
  getActiveInteractions,
  getPendingIncoming,
  getPendingCheck,
  getWaitingCheck,
  getLatestPendingResultId,
  backfillStaleIncomingForUser,
} from './ban.service';
import { claimInvitesForUser } from './invite.service';

export type SessionStateDiagStep = (
  stage: string,
  extra?: Record<string, unknown>,
) => void;

export function buildMinimalSessionState(userId: string): SessionState {
  return {
    serverNow: new Date().toISOString(),
    userId,
    incoming: null,
    check: null,
    checkWaiting: false,
    waiting: null,
    active: [],
    pendingResultId: null,
    needsOnboardingRecovery: false,
  };
}

export async function getSessionState(
  userId: string,
  username?: string | null,
  diag?: SessionStateDiagStep,
): Promise<SessionState> {
  const log = (stage: string, extra?: Record<string, unknown>) => {
    if (diag) diag(stage, extra);
  };

  // Stale-by-age / reply-child / handled only — no client ids on plain session fetch.
  log('backfill start');
  await backfillStaleIncomingForUser(userId, []);
  log('backfill done');

  log('getPendingIncoming start');
  let incoming = await getPendingIncoming(userId);
  log('getPendingIncoming done', { incomingId: incoming?.id ?? null });

  if (!incoming && username) {
    log('claimInvites start');
    incoming = await claimInvitesForUser(userId, username);
    log('claimInvites done', { incomingId: incoming?.id ?? null });
  }

  console.log('[incoming-session]', {
    userId,
    incomingId: incoming?.id ?? null,
    reason: incoming ? 'pending-offered' : 'none',
  });

  log('parallel queries start');
  const [pending, waiting, active, pendingResultId] = await Promise.all([
    getPendingCheck(userId),
    getWaitingCheck(userId),
    getActiveInteractions(userId, 15),
    getLatestPendingResultId(userId),
  ]);
  log('parallel queries done', {
    checkBanId: pending?.id ?? null,
    waitingBanId: waiting?.ban?.id ?? null,
    activeCount: active.length,
    pendingResultId,
  });

  if (pending) {
    console.log('[check-session]', {
      userId,
      checkBanId: pending.id,
      role: getCheckViewerRole(userId, pending.sender.id, pending.receiver.id),
      banId: pending.id,
      status: pending.status,
    });
  }

  return {
    serverNow: new Date().toISOString(),
    userId,
    incoming,
    check: pending,
    checkWaiting: !!waiting && !pending,
    waiting,
    active,
    pendingResultId,
    needsOnboardingRecovery: !!incoming && incoming.status === 'pending',
  };
}
