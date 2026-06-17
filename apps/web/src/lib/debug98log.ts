'use client';

export type Debug98Event = {
  t: number;
  event: string;
  data?: unknown;
};

const MAX_EVENTS = 30;

/** Bump when allowlist / install behavior changes. */
export const DEBUG98_LOGGER_VERSION = 5;

/** When this bundle chunk was first evaluated in the browser session. */
const DEBUG98_BUNDLE_LOADED_AT =
  typeof window !== 'undefined' ? Date.now() : 0;

const ALLOWED_EVENTS = new Set([
  '[send-start]',
  '[send-response]',
  '[send-success-open]',
  '[success-exit-start]',
  '[success-exit-base-lobby]',
  '[success-exit-drain-attempt]',
  '[success-exit-drain-success]',
  '[success-exit-open-lobby]',
  '[success-exit-no-notifications]',
  '[success-exit-deferred-sync-start]',
  '[success-exit-deferred-sync-finished]',
  '[success-exit-deferred-sync-timeout]',
  '[notification-next-selected]',
  '[chain-drain-continue-blocked]',
  '[result-poll-start]',
  '[result-poll-hit]',
  '[go-to-bans-click]',
  '[go-to-bans-target-tab]',
  '[98+ ShellErrorBoundary]',
  '[debug98-overlay-mounted]',
  '[debug98-logger-installed]',
  '[LATCH ON]',
  '[LATCH OFF]',
  '[QUEUE SYNC SKIPPED]',
  '[DISMISS RESULT SKIPPED]',
  '[RESULT ACK SENT]',
  '[SUCCESS CTA CLICK]',
  '[SUCCESS EXIT COMPLETE CALLED]',
  '[SUCCESS ON_EXIT_COMPLETE PROP]',
  '[SUCCESS CARD BLOCKS RESULT]',
  '[RESULT POLL SKIPPED SUCCESS]',
  '[SUCCESS HIDE]',
  '[SUCCESS SNAPSHOT CLEARED]',
  '[SUCCESS STATE RESET]',
  '[SUCCESS CARD UNMOUNTED]',
  '[SUCCESS PAYOFF CTA CLICK]',
  '[SUCCESS EXIT HANDLER CALLED]',
  '[CARD CLOSE CLICK]',
  '[DISMISS START]',
  '[DISMISS COMMIT DONE]',
  '[SHOW NEXT START]',
  '[SHOW NEXT SELECTED]',
  '[OVERLAY STATE SET]',
  '[CARD MOUNTED]',
  '[TRANSITION DELAY USED]',
  '[SUCCESS EXIT CLICK]',
  '[SUCCESS EXIT START]',
  '[SUCCESS EXIT LOBBY OPEN ATTEMPT]',
  '[SUCCESS EXIT DRAIN START]',
  '[SUCCESS EXIT DRAIN RESULT]',
  '[FIRST NOTIFICATION SELECTED]',
  '[FIRST NOTIFICATION MOUNTED]',
  '[success-post-send-prime-start]',
  '[pending-chain-prefetch-success]',
  '[pending-chain-enqueue-ready]',
]);

export type Debug98LatchSnapshot = {
  bansReturnToLobbyLatchRef: boolean;
  queueLen: number;
};

let latchSnapshotReader: (() => Debug98LatchSnapshot) | null = null;

export function registerDebug98LatchSnapshot(
  reader: (() => Debug98LatchSnapshot) | null,
): void {
  latchSnapshotReader = reader;
}

export function readDebug98LatchSnapshot(): Debug98LatchSnapshot {
  return (
    latchSnapshotReader?.() ?? {
      bansReturnToLobbyLatchRef: false,
      queueLen: 0,
    }
  );
}

declare global {
  interface Window {
    __debug98events?: Debug98Event[];
    __debug98log?: (event: string, data?: unknown) => void;
    __debug98LoggerVersion?: number;
  }
}

function dispatchDebugEvent(ev: Debug98Event) {
  window.dispatchEvent(new CustomEvent('__debug98log', { detail: ev }));
}

function appendDebug98Event(event: string, data?: unknown) {
  const ev: Debug98Event = { t: Date.now(), event, data };
  window.__debug98events = [...(window.__debug98events ?? []), ev].slice(
    -MAX_EVENTS,
  );
  dispatchDebugEvent(ev);
}

export function installDebug98log() {
  if (typeof window === 'undefined') return;

  const hadPreviousHandler = typeof window.__debug98log === 'function';
  const previousBufferLen = window.__debug98events?.length ?? 0;
  const previousVersion = window.__debug98LoggerVersion ?? null;

  window.__debug98events = [];
  window.__debug98LoggerVersion = DEBUG98_LOGGER_VERSION;
  window.__debug98log = (event: string, data?: unknown) => {
    if (!ALLOWED_EVENTS.has(event)) return;
    appendDebug98Event(event, data);
  };

  appendDebug98Event('[debug98-logger-installed]', {
    version: DEBUG98_LOGGER_VERSION,
    installedAt: Date.now(),
    bundleLoadedAt: DEBUG98_BUNDLE_LOADED_AT,
    replacedPreviousHandler: hadPreviousHandler,
    previousVersion,
    previousBufferLen,
    bufferReset: true,
  });
}

export function getDebug98Events(): Debug98Event[] {
  return window.__debug98events ?? [];
}

// Install eagerly in browser so `window.__debug98log` is always available.
if (typeof window !== 'undefined') {
  installDebug98log();
}
