/** Monotonic ms for overlay handoff diagnostics. */
export function overlayTs(): number {
  return Math.round(performance.now());
}

export function overlayDelayMs(sinceTs: number | null | undefined): number | null {
  if (sinceTs == null) return null;
  return Math.round(performance.now() - sinceTs);
}

export function overlayDelayCause(
  delayMs: number | null,
  ctx?: { handoffMs?: number | null },
): string {
  if (delayMs == null) return 'no-action-ts';
  if (delayMs <= 150) return 'ok';
  const handoffMs = ctx?.handoffMs;
  if (handoffMs != null && handoffMs > 80) return 'slow-dismiss-commit';
  if (handoffMs != null && handoffMs <= 80 && delayMs > 150) {
    return 'slow-render-or-gate';
  }
  if (delayMs <= 400) return 'slow-react-render';
  return 'slow-exit-or-verify';
}
