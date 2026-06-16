import {
  hasEnoughInfluenceToSendBan,
  INSUFFICIENT_ENERGY_ERROR,
  DAILY_BAN_LIMIT_ERROR_CODE,
  isDailyBanLimitMessage,
  isInsufficientEnergyMessage,
  isLowEnergySendRejectionMessage,
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
  | 'daily-limit-block-submit'
  | 'return-to-lobby'
  | 'daily-limit-hint-visible'
  | 'low-energy-hint-visible'
  | 'insufficientEnergyRedirect'
  | 'dailyLimitRedirect';

export type SendFlowSource = 'normal' | 'reply_from_bot';

export function resolveSendFlowSource(opts: {
  incomingReplyBanId: string | null;
  deepLinkReplyBanId: string | null;
  replyDeepLinkBanId: string | null;
  replyToBanId?: string | null;
}): SendFlowSource {
  if (
    opts.replyToBanId ||
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

export function isLowEnergyHintMessage(message: string): boolean {
  return isLowEnergySendRejectionMessage(message);
}

export function isInsufficientEnergyApiError(err: unknown): boolean {
  if (err instanceof ApiError) {
    if (err.code === DAILY_BAN_LIMIT_ERROR_CODE) return false;
    const matched = isInsufficientEnergyMessage(err.message);
    if (matched && process.env.NODE_ENV === 'development') {
      console.log('[ENERGY GATE] insufficient-energy-api-error', {
        status: err.status,
        message: err.message,
        code: err.code ?? null,
        redirectToLobby: err.redirectToLobby ?? null,
      });
    }
    return (
      err.code === INSUFFICIENT_ENERGY_ERROR ||
      err.message === INSUFFICIENT_ENERGY_ERROR ||
      err.status === 402 ||
      (err.redirectToLobby === true && matched)
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

export function isDailyBanLimitApiError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return (
      err.code === DAILY_BAN_LIMIT_ERROR_CODE ||
      isDailyBanLimitMessage(err.message)
    );
  }
  if (err instanceof Error) {
    return isDailyBanLimitMessage(err.message);
  }
  if (typeof err === 'string') {
    return isDailyBanLimitMessage(err);
  }
  return false;
}

/** Client-side gate / API / hook failures that must redirect to lobby, not confirm error. */
export function isLowEnergySendFailure(err: unknown): boolean {
  return isInsufficientEnergyApiError(err);
}

/** Daily ban quota — lobby daily-limit hint, not low-energy hint. */
export function isDailyBanLimitSendFailure(err: unknown): boolean {
  return isDailyBanLimitApiError(err);
}
