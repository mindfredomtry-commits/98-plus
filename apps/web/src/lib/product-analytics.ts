import { api } from './api';

/**
 * Product analytics for the monetization flow. Thin wrapper over the existing
 * `POST /analytics/track` endpoint (userId is taken from the JWT server-side).
 *
 * This is intentionally separate from the notification-queue debug logging —
 * do not mix the two. Fire-and-forget: never blocks or throws into the UI.
 */
export function trackProductEvent(
  name: string,
  token: string | null | undefined,
  meta?: Record<string, unknown>,
): void {
  if (!token) return;
  void api('/analytics/track', {
    method: 'POST',
    token,
    body: JSON.stringify({ name, meta }),
    retries: 0,
  }).catch(() => {
    // analytics is best-effort
  });
}
