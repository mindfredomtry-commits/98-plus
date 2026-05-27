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

export async function getSessionState(
  userId: string,
  username?: string | null,
): Promise<SessionState> {
  // Stale-by-age / reply-child / handled only — no client ids on plain session fetch.
  await backfillStaleIncomingForUser(userId, []);

  let incoming = await getPendingIncoming(userId);

  if (!incoming && username) {
    incoming = await claimInvitesForUser(userId, username);
  }

  const [pending, waiting, active, pendingResultId] = await Promise.all([
    getPendingCheck(userId),
    getWaitingCheck(userId),
    getActiveInteractions(userId, 15),
    getLatestPendingResultId(userId),
  ]);

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
