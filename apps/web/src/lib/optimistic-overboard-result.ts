import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  calcOverboardPenalty,
  ensureDirectOverboardOptimisticResult,
  isIncomingPairFunMode,
  RESULT_COPY,
} from '@98plus/shared';
import {
  type OptimisticOverboardBuildContext,
  type OptimisticOverboardBuildDiagnostics,
  diagnoseOptimisticOverboardParticipants,
  prepareOptimisticOverboardParticipants,
} from './optimistic-overboard-avatar';

function resolveOptimisticOverboardEconomy(ban: BanInteraction): {
  funMode: boolean;
  economyMode: 'normal' | 'fun';
  pairBanCount24h: number | null;
  energy: { sender: number; receiver: number };
} {
  const incomingFunMode = isIncomingPairFunMode(ban);
  const pairBanCount24h = ban.pairBanCount24h ?? null;

  if (incomingFunMode) {
    return {
      funMode: true,
      economyMode: 'fun',
      pairBanCount24h,
      energy: { sender: 0, receiver: 0 },
    };
  }

  const penalty = calcOverboardPenalty();
  return {
    funMode: false,
    economyMode: 'normal',
    pairBanCount24h,
    energy: { sender: penalty.sender, receiver: penalty.receiver },
  };
}

function logOptimisticOverboard(
  banId: string,
  ban: BanInteraction,
  economy: ReturnType<typeof resolveOptimisticOverboardEconomy>,
  viewerId: string,
): void {
  const incomingFunMode = isIncomingPairFunMode(ban);
  const viewerDelta =
    viewerId === ban.sender?.id
      ? economy.energy.sender
      : viewerId === ban.receiver?.id
        ? economy.energy.receiver
        : null;
  console.log('[OPTIMISTIC OVERBOARD]');
  console.log('[OPTIMISTIC OVERBOARD] banId=', banId);
  console.log('[OPTIMISTIC OVERBOARD] pairBanCount24h=', ban.pairBanCount24h ?? '—');
  console.log('[OPTIMISTIC OVERBOARD] incomingFunMode=', incomingFunMode);
  console.log('[OPTIMISTIC OVERBOARD] optimisticFunMode=', economy.funMode);
  console.log('[OPTIMISTIC OVERBOARD] optimisticEnergy=', viewerDelta ?? '—');
}

export type { OptimisticAvatarContext, OptimisticOverboardBuildContext } from './optimistic-overboard-avatar';
export {
  mergeOverboardResultUsers,
  diagnoseOptimisticOverboardParticipants,
} from './optimistic-overboard-avatar';

export function getOptimisticOverboardBuildDiagnostics(
  ban: BanInteraction,
  viewerId: string,
  avatarCtx?: OptimisticOverboardBuildContext,
): OptimisticOverboardBuildDiagnostics {
  const ctx: OptimisticOverboardBuildContext = {
    ...(avatarCtx ?? {}),
    viewerId,
  };
  return diagnoseOptimisticOverboardParticipants(ban, ctx);
}

/** Local overboard result card — shown before /overboard API resolves. */
export function buildOptimisticOverboardResult(
  ban: BanInteraction,
  viewerId: string,
  avatarCtx?: OptimisticOverboardBuildContext,
): BanResult | null {
  const ctx: OptimisticOverboardBuildContext = {
    ...(avatarCtx ?? {}),
    viewerId,
  };
  const diagnostics = diagnoseOptimisticOverboardParticipants(ban, ctx);
  if (diagnostics.missingBanId || diagnostics.missingText || diagnostics.missingParticipants) {
    return null;
  }

  const { sender, receiver, mergedBan } = prepareOptimisticOverboardParticipants(
    ban,
    ctx,
  );
  const text = mergedBan.text?.trim();
  if (!text || !sender.id?.trim() || !receiver.id?.trim()) {
    return null;
  }

  let resolvedSender = sender;
  let resolvedReceiver = receiver;
  if (mergedBan.isIncoming !== false) {
    resolvedReceiver = { ...receiver, id: viewerId };
  }

  const enriched: BanInteraction = {
    ...mergedBan,
    text,
    sender: resolvedSender,
    receiver: resolvedReceiver,
  };

  const economy = resolveOptimisticOverboardEconomy(enriched);
  logOptimisticOverboard(enriched.id, enriched, economy, viewerId);

  const copy = RESULT_COPY.overboard;
  const opponent =
    viewerId === resolvedSender.id
      ? resolvedReceiver
      : viewerId === resolvedReceiver.id
        ? resolvedSender
        : resolvedSender;

  return ensureDirectOverboardOptimisticResult(
    {
      id: enriched.id,
      text,
      outcome: 'overboard',
      headline: copy.headline,
      subline: copy.subline,
      sender: resolvedSender,
      receiver: resolvedReceiver,
      viewerId,
      opponent,
      confirmations: null,
      energy: economy.energy,
      farmSkipped: economy.funMode,
      funMode: economy.funMode,
      isFunMode: economy.funMode,
      economyMode: economy.economyMode,
      pairBanCount24h: economy.pairBanCount24h,
      completedAt: new Date().toISOString(),
      deepLink: '',
      shareLink: '',
      inviteOpponentLink: '',
    },
    viewerId,
  );
}
