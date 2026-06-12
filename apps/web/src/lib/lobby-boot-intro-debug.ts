'use client';

export type LobbyBootIntroDebug = {
  ringIntroState: string;
  energyKnown: boolean;
  targetProgress: number;
  ringClass: string;
  strokeDashoffset: string;
};

let current: LobbyBootIntroDebug = {
  ringIntroState: '—',
  energyKnown: false,
  targetProgress: 0,
  ringClass: '',
  strokeDashoffset: '—',
};

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function reportLobbyBootIntroDebug(next: LobbyBootIntroDebug): void {
  const same =
    current.ringIntroState === next.ringIntroState &&
    current.energyKnown === next.energyKnown &&
    current.targetProgress === next.targetProgress &&
    current.ringClass === next.ringClass &&
    current.strokeDashoffset === next.strokeDashoffset;
  if (same) return;
  current = next;
  notify();
}

export function subscribeLobbyBootIntroDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLobbyBootIntroDebug(): LobbyBootIntroDebug {
  return current;
}
