const SCALE_START = 0.15;

const LOBBY_BOOT_STORE_MODULE_ID = `lobby-boot-store-${Math.random()
  .toString(36)
  .slice(2, 8)}`;

type HandoffSnapshot = {
  scale: number;
  ringPercent: number;
};

type PrimedSnapshot = {
  scale: number;
  ringPercent: number;
};

let scaleIntroDone = false;
let logoIntroDone = false;
let introFullyPrimed = false;
let primedSnapshot: PrimedSnapshot = { scale: 1, ringPercent: 0 };
let handoffSnapshot: HandoffSnapshot | null = null;
let lastKnownRingPercent = 0;
let hasCachedRingPercent = false;

const sessionListeners = new Set<() => void>();

function emitLobbyBootStoreTrace(event: string, reason: string): void {
  const timestamp = performance.now();
  const payload = {
    event,
    introFullyPrimed,
    listenerCount: sessionListeners.size,
    reason,
    timestamp,
    moduleInstanceId: LOBBY_BOOT_STORE_MODULE_ID,
  };
  console.log('LOBBY_BOOT_STORE_TRACE', payload);
  if (typeof window !== 'undefined') {
    window.__debug98log?.('LOBBY_BOOT_STORE_TRACE', payload);
  }
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function notifyLobbyBootIntroSession(): void {
  emitLobbyBootStoreTrace('notify', 'notifyLobbyBootIntroSession');
  sessionListeners.forEach((listener) => listener());
}

export function subscribeLobbyBootIntroSession(listener: () => void): () => void {
  sessionListeners.add(listener);
  emitLobbyBootStoreTrace('subscribe', 'subscribeLobbyBootIntroSession');
  return () => {
    sessionListeners.delete(listener);
    emitLobbyBootStoreTrace('unsubscribe', 'subscribeLobbyBootIntroSession:cleanup');
  };
}

export function isLobbyBootIntroPrimed(): boolean {
  emitLobbyBootStoreTrace('getSnapshot', 'isLobbyBootIntroPrimed');
  return introFullyPrimed;
}

/** One cold start = at most one scale intro. Survives remount / StrictMode. */
export function hasPlayedLobbyBootIntroThisSession(): boolean {
  return introFullyPrimed;
}

export function isLobbyBootScaleIntroDone(): boolean {
  return scaleIntroDone || introFullyPrimed;
}

export function isLobbyBootLogoIntroDone(): boolean {
  return logoIntroDone || introFullyPrimed;
}

export function markLobbyBootLogoIntroDone(): void {
  logoIntroDone = true;
}

export function getLobbyBootIntroPrimedSnapshot(): PrimedSnapshot {
  return primedSnapshot;
}

export function getLastKnownLobbyRingPercent(): number {
  return lastKnownRingPercent;
}

export function rememberLobbyRingPercent(ringPercent: number): void {
  lastKnownRingPercent = clampPercent(ringPercent);
  hasCachedRingPercent = true;
}

/** Boot fill target — real API value, cached session value, or null (empty ring). */
export function resolveBootFillTarget(
  energyKnown: boolean,
  apiTarget: number,
): number | null {
  if (energyKnown) return clampPercent(apiTarget);
  if (hasCachedRingPercent) return lastKnownRingPercent;
  const handoff = handoffSnapshot;
  if (handoff) return clampPercent(handoff.ringPercent);
  return null;
}

export function markLobbyBootScaleIntroDone(ringPercent: number): void {
  scaleIntroDone = true;
  primedSnapshot = {
    scale: 1,
    ringPercent: clampPercent(ringPercent),
  };
}

export function markLobbyBootIntroPrimed(ringPercent: number, scale = 1): void {
  if (introFullyPrimed) {
    emitLobbyBootStoreTrace(
      'markLobbyBootIntroPrimed',
      'markLobbyBootIntroPrimed:already-primed-no-op',
    );
    return;
  }
  emitLobbyBootStoreTrace(
    'markLobbyBootIntroPrimed',
    'markLobbyBootIntroPrimed:before-assign',
  );
  logoIntroDone = true;
  scaleIntroDone = true;
  introFullyPrimed = true;
  primedSnapshot = {
    scale: Math.min(1, Math.max(SCALE_START, scale)),
    ringPercent: clampPercent(ringPercent),
  };
  rememberLobbyRingPercent(ringPercent);
  handoffSnapshot = null;
  emitLobbyBootStoreTrace(
    'markLobbyBootIntroPrimed',
    'markLobbyBootIntroPrimed:after-assign-before-notify',
  );
  notifyLobbyBootIntroSession();
  emitLobbyBootStoreTrace(
    'markLobbyBootIntroPrimed',
    'markLobbyBootIntroPrimed:after-notify',
  );
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
