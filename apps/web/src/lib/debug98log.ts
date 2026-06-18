'use client';

export type Debug98Event = {
  t: number;
  event: string;
  data?: unknown;
};

const MAX_EVENTS = 30;

/** Bump when allowlist / install behavior changes. */
export const DEBUG98_LOGGER_VERSION = 14;

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
  '[CHAIN LOOKAHEAD START]',
  '[CHAIN LOOKAHEAD READY]',
  '[GO TO BANS CLICK]',
  '[GO TO BANS NEXT READY]',
  '[GO TO BANS NEXT WAITING]',
  '[GO TO BANS NEXT MOUNTED]',
  '[REPLY DEEPLINK START]',
  '[REPLY CARD SELECTED]',
  '[STARTUP BLOCKERS CLEAR]',
  '[REPLY CARD OVERLAY SET]',
  '[REPLY CARD MOUNTED]',
  '[REPLY CARD TOP LAYER OK]',
  '[ACTIVE BLOCKERS]',
  '[CHECK ANSWER CLICK]',
  '[OVERLAY MARK DISMISSING]',
  '[OVERLAY ACTIVE CLEARED]',
  '[CHAIN DRAIN USER ANSWER ALLOWED]',
  '[CHAIN DRAIN CONTINUE]',
  '[CHAIN EMPTY FALLBACK LOBBY]',
  '[CHECK ANSWER SUBMIT OK]',
  '[CHECK ANSWER FINAL RESULT FOUND]',
  '[CHECK ANSWER FINAL RESULT FETCH START]',
  '[CHECK ANSWER FINAL RESULT FETCH OK]',
  '[CHECK ANSWER FINAL RESULT ENQUEUED]',
  '[CHECK ANSWER FINAL RESULT SHOW]',
  '[CHECK ANSWER FINAL RESULT MISSING]',
  '[CHECK ANSWER RESULT SKIPPED BUG]',
  '[CHECK DISMISS START]',
  '[CHECK DISMISS CURRENT CONSUMED]',
  '[CHECK DISMISS REMAINING QUEUE]',
  '[CHECK DISMISS SHOW NEXT]',
  '[CHECK DISMISS EMPTY OPEN LOBBY]',
  '[CHECK DISMISS BOOT RELEASED]',
  '[CHECK DISMISS STUCK ON BOOT BUG]',
  '[LOBBY OPEN AFTER CHECK EMPTY]',
  '[ACTIVE USER CARD HOLD]',
  '[CHAIN ADVANCE BLOCKED ACTIVE USER CARD]',
  '[CHAIN LOOKAHEAD ONLY ACTIVE USER CARD]',
  '[INCOMING REPLACED BUG]',
  '[ACTIVE USER CARD PRESERVE CURRENT]',
  '[ACTIVE USER CARD BLOCKED NEXT BUT KEPT CURRENT]',
  '[ACTIVE USER CARD LOST BUG]',
  '[ACTIVE USER CARD PREVENT LOBBY FALLBACK]',
  '[ACTIVE USER CARD PREVENT OVERLAY CLEAR]',
  '[TRANSITION DELAY SKIPPED ACTIVE USER CARD]',
  '[RESULT POLL HIT]',
  '[RESULT POLL ITEM BUILT]',
  '[RESULT POLL DROP STALE CHECK]',
  '[RESULT POLL PRIORITY SET]',
  '[RESULT POLL SHOW RESULT CARD]',
  '[CHECK PRIME SKIP STALE BECAUSE RESULT EXISTS]',
  '[RESULT CARD MOUNTED]',
  '[CHECK CARD MOUNTED BUG]',
  '[CHECK DEEPLINK START]',
  '[CHECK DEEPLINK PAYLOAD PARSED]',
  '[CHECK DEEPLINK AUTH WAIT]',
  '[CHECK DEEPLINK FETCH START]',
  '[CHECK DEEPLINK FETCH OK]',
  '[CHECK DEEPLINK FETCH ERROR]',
  '[CHECK CARD SELECTED]',
  '[CHECK STARTUP BLOCKERS CLEAR]',
  '[CHECK CARD OVERLAY SET]',
  '[CHECK CARD MOUNTED]',
  '[CHECK CARD TOP LAYER OK]',
  '[CHECK ACTIVE BLOCKERS]',
  '[CHECK DEEPLINK CARD SELECTED]',
  '[CHECK DEEPLINK OVERLAY SET]',
  '[CHECK DEEPLINK CARD MOUNTED]',
  '[CHECK DEEPLINK FALLBACK LOBBY]',
  '[CHECK DEEPLINK AUTH READY RESUME]',
  '[CHECK DEEPLINK RESUME SKIP]',
  '[CHECK DEEPLINK LOBBY SUPPRESSED]',
  '[CHECK FULL LOBBY FLASH BUG]',
  '[CHECK WRONG BOOT PLACEHOLDER BUG]',
  '[CHECK DIRECT BACKDROP RENDERED]',
  '[CHECK DIRECT BACKDROP UNDER CARD OK]',
  '[CHECK DIRECT BACKDROP MISSING BUG]',
  '[CHECK DIRECT BACKDROP ABOVE CARD BUG]',
  '[CHECK BACKDROP BELOW CARD]',
  '[CHECK CARD NOT BLURRED]',
  '[CHECK BACKDROP ABOVE CARD BUG]',
  '[CHECK CARD INSIDE BLUR BUG]',
  '[CHECK CARD PARENT FILTER BUG]',
  '[CHECK CARD VISUAL ROOT CLEAN]',
  '[OVERLAY INPUT LOCK SET]',
  '[OVERLAY INPUT LOCK SET AFTER ACTION]',
  '[OVERLAY INPUT CURRENT ACTION ALLOWED]',
  '[OVERLAY INPUT BLOCKED]',
  '[OVERLAY INPUT BLOCKED CARRYOVER]',
  '[OVERLAY INPUT LOCK EXPIRED]',
  '[OVERLAY INPUT LOCK CLEARED]',
  '[OVERLAY BUTTON POINTER DOWN]',
  '[OVERLAY BUTTON CLICK]',
  '[OVERLAY CARD HIT OK]',
  '[BACKDROP HIT BUG]',
  '[CARD POINTER EVENTS BUG]',
  '[OVERLAY HIT TEST TARGET]',
  '[OVERLAY HIT TEST PATH]',
  '[OVERLAY HIT BLOCKER FOUND]',
  '[OVERLAY CARD LAYOUT OK]',
  '[OVERLAY CARD CLIPPED BUG]',
  '[EMPTY OVERLAY HOST BLOCKED]',
  '[SUCCESS EXIT EMPTY QUEUE CLEAR OVERLAY]',
  '[SUCCESS EXIT TIMER CARD TOP OK]',
  '[EMPTY BACKDROP BUG]',
  '[DEEPLINK SINGLE CARD MODE ON]',
  '[DEEPLINK SINGLE CARD COMPLETE]',
  '[DEEPLINK AUTO DRAIN BLOCKED]',
  '[DEEPLINK RETURN LOBBY]',
  '[DEEPLINK AUTO DRAIN BUG]',
  '[DEEPLINK EXPLICIT DRAIN ALLOWED]',
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
