let lastClickTs: number | null = null;

export function getOverboardClickTs(): number | null {
  return lastClickTs;
}

export function markOverboardClickStart(): number {
  lastClickTs = performance.now();
  console.log('[OVERBOARD TIMING] click t=', Math.round(lastClickTs));
  logOverboardPaint('click', lastClickTs);
  return lastClickTs;
}

export function logOverboardTiming(
  stage:
    | 'optimistic-built'
    | 'flushSync-start'
    | 'result-state-set'
    | 'api-start',
  clickTs?: number | null,
): void {
  const base = clickTs ?? lastClickTs;
  if (base == null) {
    console.log(`[OVERBOARD TIMING] ${stage} dt= —`);
    return;
  }
  const dt = Math.round(performance.now() - base);
  console.log(`[OVERBOARD TIMING] ${stage} dt=`, dt);
}

export function logOverboardPaint(
  stage:
    | 'click'
    | 'result-state-set'
    | 'ResultOverlay useLayoutEffect'
    | 'requestAnimationFrame after mount'
    | 'closeSendFlow deferred',
  clickTs?: number | null,
): void {
  const base = clickTs ?? lastClickTs;
  if (base == null) {
    console.log(`[OVERBOARD PAINT] ${stage} dt= —`);
    return;
  }
  const dt = Math.round(performance.now() - base);
  console.log(`[OVERBOARD PAINT] ${stage} dt=`, dt);
}
