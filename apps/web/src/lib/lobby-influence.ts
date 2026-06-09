import {
  LOBBY_MIN_INFLUENCE_PERCENT,
  type UserPublic,
} from '@98plus/shared';

export { LOBBY_MIN_INFLUENCE_PERCENT };

/** Same gate as ArenaLobbyIdle low-energy CTA. */
export function isLobbyLowEnergy(
  energyLoaded: boolean,
  influencePercent: number,
): boolean {
  const influence = Math.min(100, Math.max(0, influencePercent));
  return energyLoaded && influence < LOBBY_MIN_INFLUENCE_PERCENT;
}

export function canLobbySendBan(
  energyLoaded: boolean,
  influencePercent: number,
): boolean {
  return !isLobbyLowEnergy(energyLoaded, influencePercent);
}

export type LobbyInfluenceResolved = {
  influencePercent: number;
  rawEnergyPercent: number | undefined;
  fromFallback: boolean;
};

/**
 * Maps authenticated user to lobby ring / CTA threshold.
 * Source: UserPublic.energyPercent from mapUser (energy / ENERGY_MAX_DISPLAY * 100).
 */
export function resolveLobbyInfluencePercent(
  user: UserPublic | null | undefined,
): LobbyInfluenceResolved {
  const raw = user?.energyPercent;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return {
      influencePercent: Math.min(100, Math.max(0, Math.round(raw))),
      rawEnergyPercent: raw,
      fromFallback: false,
    };
  }

  // TODO: replace fallback with real user energy from session once exposed by API
  return {
    influencePercent: 100,
    rawEnergyPercent: undefined,
    fromFallback: true,
  };
}

export function logLobbyInfluenceDebug(
  user: UserPublic | null | undefined,
  resolved: LobbyInfluenceResolved,
): void {
  if (process.env.NODE_ENV === 'production') return;
  console.debug('[98+] lobby influence percent', {
    userId: user?.id ?? null,
    rawEnergyPercent: resolved.rawEnergyPercent,
    influencePercent: resolved.influencePercent,
    fromFallback: resolved.fromFallback,
    canBan: resolved.influencePercent >= LOBBY_MIN_INFLUENCE_PERCENT,
  });
}
