'use client';

export type PillSourceName =
  | 'ArenaLobbyIdle'
  | 'NotificationQueueShell'
  | 'BigButton';

let currentSource: PillSourceName | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function reportPillSource(source: PillSourceName): void {
  if (currentSource === source) return;
  currentSource = source;
  notify();
}

export function clearPillSourceIf(source: PillSourceName): void {
  if (currentSource !== source) return;
  currentSource = null;
  notify();
}

export function subscribePillSource(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPillSource(): PillSourceName | null {
  return currentSource;
}
