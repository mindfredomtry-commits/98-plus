'use client';

function captureCallStack(): string {
  try {
    const stack = new Error('[hold-state-trace]').stack ?? '';
    return stack.split('\n').slice(2, 14).join('\n');
  } catch {
    return '';
  }
}

function emit(event: string, data: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const payload = { t: performance.now(), ...data, callstack: captureCallStack() };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function emitHoldStateRead(data: Record<string, unknown>): void {
  emit('[HOLD STATE READ]', data);
}

export function emitHoldStateWrite(data: Record<string, unknown>): void {
  emit('[HOLD STATE WRITE]', data);
}

export function emitHoldBlockDecision(data: Record<string, unknown>): void {
  emit('[HOLD BLOCK DECISION]', data);
}

export function emitHoldClear(data: Record<string, unknown>): void {
  emit('[HOLD CLEAR]', data);
}

export function snapshotOwnerDisplayFields(display: {
  result?: { id: string } | null;
  incomingBan?: { id: string } | null;
  checkBan?: { id: string } | null;
}): Record<string, string | null> {
  return {
    resultId: display.result?.id ?? null,
    incomingBanId: display.incomingBan?.id ?? null,
    checkBanId: display.checkBan?.id ?? null,
  };
}
