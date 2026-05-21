/** CTA / send pipeline logs for Telegram WebView debugging */
export function ctaLog(
  event: string,
  detail?: Record<string, unknown> | string | null,
): void {
  if (typeof console === 'undefined') return;
  if (detail === undefined) {
    console.log(`[98+ cta] ${event}`);
    return;
  }
  console.log(`[98+ cta] ${event}`, detail);
}
