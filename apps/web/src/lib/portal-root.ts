/** Best-effort portal mount target for Telegram WebView / Next.js. */
export function getAppPortalRoot(): HTMLElement {
  if (typeof document === 'undefined') {
    return null as unknown as HTMLElement;
  }
  return document.body ?? document.documentElement;
}
