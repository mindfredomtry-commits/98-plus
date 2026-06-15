/** Dev-friendly challenge lifecycle logs (always on in Mini App WebView). */
import { safeStringify } from './normalize-json';

export function challengeLog(
  event: string,
  detail?: Record<string, unknown> | string | number | null,
): void {
  if (typeof console === 'undefined') return;
  if (detail === undefined) {
    console.log(`[98+ challenge] ${event}`);
    return;
  }
  if (typeof detail === 'object' && detail !== null) {
    console.log(`[98+ challenge] ${event}`, safeStringify(detail));
    return;
  }
  console.log(`[98+ challenge] ${event}`, detail);
}
