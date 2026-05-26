/** Startup timing logs — grep console for [auth-timing] / [friends-timing]. */

export function logAuthTiming(
  event: string,
  payload: Record<string, unknown> = {},
) {
  console.log('[auth-timing]', { event, ...payload, at: Date.now() });
}

export function logFriendsTiming(
  event: string,
  payload: Record<string, unknown> = {},
) {
  console.log('[friends-timing]', { event, ...payload, at: Date.now() });
}
