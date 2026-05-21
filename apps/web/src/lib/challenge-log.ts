/** Dev-friendly challenge lifecycle logs (always on in Mini App WebView). */
export function challengeLog(
  event: string,
  detail?: Record<string, unknown> | string | number | null,
): void {
  if (typeof console === 'undefined') return;
  if (detail === undefined) {
    console.log(`[98+ challenge] ${event}`);
    return;
  }
  console.log(`[98+ challenge] ${event}`, detail);
}
