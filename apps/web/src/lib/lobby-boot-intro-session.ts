const SCALE_START = 0.15;

type HandoffSnapshot = {
  scale: number;
  ringPercent: number;
};

type PrimedSnapshot = {
  scale: number;
  ringPercent: number;
};

let scaleIntroDone = false;
let introFullyPrimed = false;
let primedSnapshot: PrimedSnapshot = { scale: 1, ringPercent: 0 };
let handoffSnapshot: HandoffSnapshot | null = null;

const sessionListeners = new Set<() => void>();

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function notifyLobbyBootIntroSession(): void {
  sessionListeners.forEach((listener) => listener());
}

export function subscribeLobbyBootIntroSession(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

export function isLobbyBootIntroPrimed(): boolean {
  return introFullyPrimed;
}

/** One cold start = at most one scale intro. Survives remount / StrictMode. */
export function hasPlayedLobbyBootIntroThisSession(): boolean {
  return introFullyPrimed;
}

export function isLobbyBootScaleIntroDone(): boolean {
  return scaleIntroDone || introFullyPrimed;
}

export function getLobbyBootIntroPrimedSnapshot(): PrimedSnapshot {
  return primedSnapshot;
}

export function markLobbyBootScaleIntroDone(ringPercent: number): void {
  scaleIntroDone = true;
  primedSnapshot = {
    scale: 1,
    ringPercent: clampPercent(ringPercent),
  };
}

export function markLobbyBootIntroPrimed(ringPercent: number, scale = 1): void {
  scaleIntroDone = true;
  introFullyPrimed = true;
  primedSnapshot = {
    scale: Math.min(1, Math.max(SCALE_START, scale)),
    ringPercent: clampPercent(ringPercent),
  };
  handoffSnapshot = null;
  notifyLobbyBootIntroSession();
}

export function snapshotLobbyBootIntroHandoff(
  scale: number,
  ringPercent: number,
): void {
  if (introFullyPrimed) return;
  handoffSnapshot = {
    scale: Math.min(1, Math.max(SCALE_START, scale)),
    ringPercent: clampPercent(ringPercent),
  };
}

export function takeLobbyBootIntroHandoff(): HandoffSnapshot | null {
  const snap = handoffSnapshot;
  handoffSnapshot = null;
  return snap;
}

export function peekLobbyBootIntroHandoff(): HandoffSnapshot | null {
  return handoffSnapshot;
}

/** Sync — intro visual mode until session primed. */
export function shouldRunLobbyBootIntroVisualSync(): boolean {
  return !introFullyPrimed;
}

/** Sync check for first-paint scale(0.15) before React effects run. */
export function shouldLobbyBootIntroScalePending(): boolean {
  if (introFullyPrimed) return false;
  if (scaleIntroDone) return false;
  const handoff = handoffSnapshot;
  if (handoff && handoff.scale >= 0.999) return false;
  return true;
}

export const LOBBY_BOOT_INTRO_SCALE_START = SCALE_START;
