import {
  hasEnoughInfluenceToSendBan,
  INSUFFICIENT_ENERGY_ERROR,
  type UserPublic,
} from '@98plus/shared';
import { api, ApiError } from '@/lib/api';
import {
  canLobbySendBan,
  resolveLobbyInfluencePercent,
} from '@/lib/lobby-influence';
import { enrichUserPublic } from '@/lib/user-public-avatar';

export type EnergyGateLogStage =
  | 'confirm-hold'
  | 'enough-energy'
  | 'low-energy-block-submit'
  | 'return-to-lobby'
  | 'low-energy-hint-visible'
  | 'insufficientEnergyRedirect';

export type SendFlowSource = 'normal' | 'reply_from_bot';

export function resolveSendFlowSource(opts: {
  incomingReplyBanId: string | null;
  deepLinkReplyBanId: string | null;
  replyDeepLinkBanId: string | null;
}): SendFlowSource {
  if (
    opts.incomingReplyBanId ||
    opts.deepLinkReplyBanId ||
    opts.replyDeepLinkBanId
  ) {
    return 'reply_from_bot';
  }
  return 'normal';
}

export function logEnergyGate(
  stage: EnergyGateLogStage,
  data: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV !== 'development') return;
  console.log('[ENERGY GATE]', stage, data);
}

export type ConfirmSubmitEnergyDecision = {
  allowed: boolean;
  influencePercent: number;
  energyLoaded: boolean;
  energyBefore: number | null;
};

function decisionFromUser(user: UserPublic): ConfirmSubmitEnergyDecision {
  const enriched = enrichUserPublic(user);
  const resolved = resolveLobbyInfluencePercent(enriched);
  const energyLoaded = !resolved.fromFallback;
  const influencePercent = resolved.influencePercent;
  const allowed =
    energyLoaded &&
    hasEnoughInfluenceToSendBan(influencePercent) &&
    canLobbySendBan(energyLoaded, influencePercent);

  return {
    allowed,
    influencePercent,
    energyLoaded,
    energyBefore: resolved.rawEnergyPercent ?? influencePercent,
  };
}

/**
 * Fresh /users/me read before confirm submit — same threshold as backend canSendBan.
 * Fails closed when energy is unknown.
 */
export async function evaluateConfirmSubmitEnergy(
  token: string | null,
  fallback: { energyLoaded: boolean; influencePercent: number },
): Promise<ConfirmSubmitEnergyDecision> {
  if (!token) {
    return {
      allowed: false,
      influencePercent: fallback.influencePercent,
      energyLoaded: false,
      energyBefore: null,
    };
  }

  try {
    const { user } = await api<{ user: UserPublic }>('/users/me', {
      token,
      retries: 0,
      timeoutMs: 5_000,
    });
    return decisionFromUser(user);
  } catch {
    if (!fallback.energyLoaded) {
      return {
        allowed: false,
        influencePercent: fallback.influencePercent,
        energyLoaded: false,
        energyBefore: null,
      };
    }
    const allowed = canLobbySendBan(
      fallback.energyLoaded,
      fallback.influencePercent,
    );
    return {
      allowed,
      influencePercent: fallback.influencePercent,
      energyLoaded: fallback.energyLoaded,
      energyBefore: fallback.influencePercent,
    };
  }
}

const LOW_ENERGY_HINT_FRAGMENT = 'Выполни пару запретов';

export function isLowEnergyHintMessage(message: string): boolean {
  return (
    message === INSUFFICIENT_ENERGY_ERROR ||
    message.includes(LOW_ENERGY_HINT_FRAGMENT)
  );
}

export function isInsufficientEnergyApiError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return (
      err.code === INSUFFICIENT_ENERGY_ERROR ||
      err.message === INSUFFICIENT_ENERGY_ERROR ||
      err.status === 402 ||
      err.redirectToLobby === true ||
      isLowEnergyHintMessage(err.message)
    );
  }
  if (err instanceof Error) {
    return isLowEnergyHintMessage(err.message);
  }
  if (typeof err === 'string') {
    return isLowEnergyHintMessage(err);
  }
  return false;
}

/** Client-side gate / API / hook failures that must redirect to lobby, not confirm error. */
export function isLowEnergySendFailure(err: unknown): boolean {
  return isInsufficientEnergyApiError(err);
}
