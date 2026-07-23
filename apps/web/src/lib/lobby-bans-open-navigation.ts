/**
 * Lobby «Твои запреты» — sync navigation decision (no network gate).
 * Prefetch/drain must not block opening the section.
 */

export type LobbyBansOpenBlockReason =
  | 'phase-not-idle'
  | 'ban-sent-success'
  | 'runtime-draining'
  | 'already-open'
  | 'open-in-flight';

export type LobbyBansOpenPlan = {
  openImmediately: boolean;
  runBackgroundPrefetch: boolean;
  blockReason: LobbyBansOpenBlockReason | null;
};

export function planLobbyBansOpenNavigation(input: {
  phaseIsIdle: boolean;
  banSentSuccess: boolean;
  runtimeDraining: boolean;
  alreadyOpen: boolean;
  openInFlight: boolean;
}): LobbyBansOpenPlan {
  if (!input.phaseIsIdle) {
    return {
      openImmediately: false,
      runBackgroundPrefetch: false,
      blockReason: 'phase-not-idle',
    };
  }
  if (input.banSentSuccess) {
    return {
      openImmediately: false,
      runBackgroundPrefetch: false,
      blockReason: 'ban-sent-success',
    };
  }
  if (input.runtimeDraining) {
    return {
      openImmediately: false,
      runBackgroundPrefetch: false,
      blockReason: 'runtime-draining',
    };
  }
  if (input.alreadyOpen) {
    return {
      openImmediately: false,
      runBackgroundPrefetch: false,
      blockReason: 'already-open',
    };
  }
  if (input.openInFlight) {
    return {
      openImmediately: false,
      runBackgroundPrefetch: false,
      blockReason: 'open-in-flight',
    };
  }
  return {
    openImmediately: true,
    runBackgroundPrefetch: true,
    blockReason: null,
  };
}
