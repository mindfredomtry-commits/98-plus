'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type QueueContinueSelectedAction =
  | 'show-next'
  | 'finish-drain'
  | 'open-section'
  | 'noop'
  | 'blocked'
  | 'needs-prefetch';

export function logResultCardCtaClick(payload: Record<string, unknown>): void {
  emit('[RESULT CARD CTA CLICK]', payload);
}

export function logResultDismissRequest(payload: Record<string, unknown>): void {
  emit('[RESULT DISMISS REQUEST]', payload);
}

export function logResultDismissCommit(payload: Record<string, unknown>): void {
  emit('[RESULT DISMISS COMMIT]', payload);
}

export function logQueueContinueAfterResult(payload: Record<string, unknown>): void {
  emit('[QUEUE CONTINUE AFTER RESULT]', payload);
}

export function logResultOverlayStillMounted(payload: Record<string, unknown>): void {
  emit('[RESULT OVERLAY STILL MOUNTED]', payload);
}
