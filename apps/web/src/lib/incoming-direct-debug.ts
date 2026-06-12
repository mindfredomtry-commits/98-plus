'use client';

export type IncomingDirectDebugState = {
  routeReply: boolean;
  displayBan: boolean;
  ready: boolean;
  overlayMounted: boolean;
  reason: string;
};

const DEFAULT: IncomingDirectDebugState = {
  routeReply: false,
  displayBan: false,
  ready: false,
  overlayMounted: false,
  reason: 'init',
};

let state: IncomingDirectDebugState = { ...DEFAULT };
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function updateIncomingDirectDebug(
  patch: Partial<IncomingDirectDebugState>,
): void {
  state = { ...state, ...patch };
  notify();
}

export function reportIncomingDirectOverlayMounted(mounted: boolean): void {
  updateIncomingDirectDebug({ overlayMounted: mounted });
}

export function subscribeIncomingDirectDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getIncomingDirectDebug(): IncomingDirectDebugState {
  return state;
}

export function resetIncomingDirectOverlayMounted(): void {
  if (!state.overlayMounted) return;
  updateIncomingDirectDebug({ overlayMounted: false });
}
