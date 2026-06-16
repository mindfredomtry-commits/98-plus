'use client';

export const OVERLAY_TRANSITION_DEBUG_EVENTS = {
  CARD_CLOSE_CLICK: '[CARD CLOSE CLICK]',
  DISMISS_START: '[DISMISS START]',
  DISMISS_COMMIT_DONE: '[DISMISS COMMIT DONE]',
  SHOW_NEXT_START: '[SHOW NEXT START]',
  SHOW_NEXT_SELECTED: '[SHOW NEXT SELECTED]',
  OVERLAY_STATE_SET: '[OVERLAY STATE SET]',
  CARD_MOUNTED: '[CARD MOUNTED]',
  TRANSITION_DELAY_USED: '[TRANSITION DELAY USED]',
} as const;

export function logOverlayTransition(
  event: string,
  data?: Record<string, unknown>,
): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}
