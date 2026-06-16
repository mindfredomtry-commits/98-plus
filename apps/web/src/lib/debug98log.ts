'use client';

export type Debug98Event = {
  t: number;
  event: string;
  data?: unknown;
};

const MAX_EVENTS = 30;

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
]);

declare global {
  interface Window {
    __debug98events?: Debug98Event[];
    __debug98log?: (event: string, data?: unknown) => void;
  }
}

function dispatchDebugEvent(ev: Debug98Event) {
  window.dispatchEvent(new CustomEvent('__debug98log', { detail: ev }));
}

export function installDebug98log() {
  if (typeof window === 'undefined') return;
  if (window.__debug98log) return;

  window.__debug98events = [];
  window.__debug98log = (event: string, data?: unknown) => {
    if (!ALLOWED_EVENTS.has(event)) return;
    const ev: Debug98Event = { t: Date.now(), event, data };
    const prev = window.__debug98events ?? [];
    window.__debug98events = [...prev, ev].slice(-MAX_EVENTS);
    dispatchDebugEvent(ev);
  };
}

export function getDebug98Events(): Debug98Event[] {
  return window.__debug98events ?? [];
}

// Install eagerly in browser so `window.__debug98log` is always available.
if (typeof window !== 'undefined') {
  installDebug98log();
}

