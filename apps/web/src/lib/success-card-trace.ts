'use client';

export type SuccessTraceExtra = Record<string, unknown>;

export function traceSuccessHide(source: string, extra?: SuccessTraceExtra) {
  window.__debug98log?.('[SUCCESS HIDE]', { source, ...extra });
}

export function traceSuccessSnapshotCleared(
  source: string,
  extra?: SuccessTraceExtra,
) {
  window.__debug98log?.('[SUCCESS SNAPSHOT CLEARED]', { source, ...extra });
}

export function traceSuccessStateReset(
  source: string,
  extra?: SuccessTraceExtra,
) {
  window.__debug98log?.('[SUCCESS STATE RESET]', { source, ...extra });
}

export function traceSuccessCardUnmounted(extra?: SuccessTraceExtra) {
  window.__debug98log?.('[SUCCESS CARD UNMOUNTED]', extra);
}

export function traceSuccessPayoffCtaClick(extra?: SuccessTraceExtra) {
  window.__debug98log?.('[SUCCESS PAYOFF CTA CLICK]', extra);
}

export function traceSuccessExitHandler(source: string, extra?: SuccessTraceExtra) {
  window.__debug98log?.('[SUCCESS EXIT HANDLER CALLED]', { source, ...extra });
}
