'use client';

export type LobbyBootIntroDebug = {
  ringIntroState: string;
  energyKnown: boolean;
  targetProgress: number;
  ringClass: string;
  strokeDashoffset: string;
  ringBox: string;
  scaleLayerTransform: string;
  ringTransform: string;
  wrapperTransform: string;
  scaleLayerClass: string;
  ringRootClass: string;
  firstRenderIntro: boolean;
  initialState: string;
  hasPaintedOnce: boolean;
  bootIntroInitial: boolean;
  introPrimed: boolean;
  appHydrated: boolean;
  circumference: string;
  targetRatio: string;
  initialDashoffset: string;
  targetDashoffset: string;
  currentDashoffset: string;
  progressStrokeVisible: boolean;
};

let current: LobbyBootIntroDebug = {
  ringIntroState: '—',
  energyKnown: false,
  targetProgress: 0,
  ringClass: '',
  strokeDashoffset: '—',
  ringBox: '—',
  scaleLayerTransform: '—',
  ringTransform: '—',
  wrapperTransform: '—',
  scaleLayerClass: '—',
  ringRootClass: '—',
  firstRenderIntro: false,
  initialState: '—',
  hasPaintedOnce: false,
  bootIntroInitial: false,
  introPrimed: false,
  appHydrated: false,
  circumference: '—',
  targetRatio: '—',
  initialDashoffset: '—',
  targetDashoffset: '—',
  currentDashoffset: '—',
  progressStrokeVisible: false,
};

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function isSame(a: LobbyBootIntroDebug, b: LobbyBootIntroDebug): boolean {
  return (
    a.ringIntroState === b.ringIntroState &&
    a.energyKnown === b.energyKnown &&
    a.targetProgress === b.targetProgress &&
    a.ringClass === b.ringClass &&
    a.strokeDashoffset === b.strokeDashoffset &&
    a.ringBox === b.ringBox &&
    a.scaleLayerTransform === b.scaleLayerTransform &&
    a.ringTransform === b.ringTransform &&
    a.wrapperTransform === b.wrapperTransform &&
    a.scaleLayerClass === b.scaleLayerClass &&
    a.ringRootClass === b.ringRootClass &&
    a.firstRenderIntro === b.firstRenderIntro &&
    a.initialState === b.initialState &&
    a.hasPaintedOnce === b.hasPaintedOnce &&
    a.bootIntroInitial === b.bootIntroInitial &&
    a.introPrimed === b.introPrimed &&
    a.appHydrated === b.appHydrated &&
    a.circumference === b.circumference &&
    a.targetRatio === b.targetRatio &&
    a.initialDashoffset === b.initialDashoffset &&
    a.targetDashoffset === b.targetDashoffset &&
    a.currentDashoffset === b.currentDashoffset &&
    a.progressStrokeVisible === b.progressStrokeVisible
  );
}

export function reportLobbyBootIntroDebug(
  next: Partial<
    Pick<
      LobbyBootIntroDebug,
      | 'ringIntroState'
      | 'energyKnown'
      | 'targetProgress'
      | 'ringClass'
      | 'strokeDashoffset'
      | 'firstRenderIntro'
      | 'initialState'
      | 'hasPaintedOnce'
      | 'bootIntroInitial'
      | 'introPrimed'
      | 'appHydrated'
      | 'circumference'
      | 'targetRatio'
      | 'initialDashoffset'
      | 'targetDashoffset'
      | 'currentDashoffset'
      | 'progressStrokeVisible'
    >
  >,
): void {
  const merged = { ...current, ...next };
  if (isSame(current, merged)) return;
  current = merged;
  notify();
}

export function patchLobbyBootIntroDebugGeometry(
  next: Partial<
    Pick<
      LobbyBootIntroDebug,
      | 'ringBox'
      | 'scaleLayerTransform'
      | 'ringTransform'
      | 'wrapperTransform'
      | 'scaleLayerClass'
      | 'ringRootClass'
      | 'currentDashoffset'
      | 'progressStrokeVisible'
    >
  >,
): void {
  const merged = { ...current, ...next };
  if (isSame(current, merged)) return;
  current = merged;
  notify();
}

export function subscribeLobbyBootIntroDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLobbyBootIntroDebug(): LobbyBootIntroDebug {
  return current;
}
