'use client';

export type GoToBansClickDismissTracePayload = {
  banId?: string | null;
  resultId?: string | null;
  overlayKey?: string | null;
  queueLen?: number;
  pendingLen?: number;
  activeKind?: string | null;
  activeBanId?: string | null;
  resultOpen?: boolean;
  dismissReason?: string | null;
  sourceFunction?: string | null;
  [key: string]: unknown;
};

function captureCallstack(): string {
  try {
    const stack = new Error('[go-to-bans-click-dismiss-trace]').stack ?? '';
    return stack.split('\n').slice(2, 14).join('\n');
  } catch {
    return '';
  }
}

function emit(event: string, data: GoToBansClickDismissTracePayload): void {
  if (typeof window === 'undefined') return;
  const payload = { t: performance.now(), ...data, callstack: captureCallstack() };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function isGoToBansDismissTraceReason(reason: string): boolean {
  return (
    reason.includes('go-to-bans') ||
    reason.includes('bans-close') ||
    reason.includes('result-cta-bans') ||
    reason.includes('status-cta')
  );
}

export function emitGoToBansClickEnter(
  data: GoToBansClickDismissTracePayload,
): void {
  emit('[GO TO BANS CLICK ENTER]', data);
}

export function emitGoToBansDismissStart(
  data: GoToBansClickDismissTracePayload,
): void {
  emit('[GO TO BANS DISMISS START]', data);
}

export function emitGoToBansDismissResult(
  data: GoToBansClickDismissTracePayload,
): void {
  emit('[GO TO BANS DISMISS RESULT]', data);
}

export function emitGoToBansShouldShowNext(
  data: GoToBansClickDismissTracePayload,
): void {
  emit('[GO TO BANS SHOULD SHOW NEXT]', data);
}

export function emitGoToBansShowNextCalled(
  data: GoToBansClickDismissTracePayload,
): void {
  emit('[GO TO BANS SHOW NEXT CALLED]', data);
}

export function emitGoToBansShowNextNotCalled(
  data: GoToBansClickDismissTracePayload,
): void {
  emit('[GO TO BANS SHOW NEXT NOT CALLED]', data);
}
