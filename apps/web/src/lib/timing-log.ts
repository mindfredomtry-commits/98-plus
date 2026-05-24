/** Lightweight timing logs for Mini App debugging */

export function timingLog(
  message: string,
  durationMs: number,
  extra?: string | number,
): void {
  const suffix =
    extra !== undefined ? ` ${typeof extra === 'number' ? `(${extra})` : extra}` : '';
  console.log(`[98+] ${message} in ${Math.round(durationMs)}ms${suffix}`);
}

export function timingStart(label: string): () => void {
  const t0 = performance.now();
  return () => timingLog(label, performance.now() - t0);
}
