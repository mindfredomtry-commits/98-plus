'use client';

function captureCallStack(): string {
  try {
    const stack = new Error('[display-commit-trace]').stack ?? '';
    return stack.split('\n').slice(2, 14).join('\n');
  } catch {
    return '';
  }
}

function emit(event: string, data: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const payload = { t: performance.now(), ...data, callStack: captureCallStack() };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function emitDisplayCommitEnter(data: Record<string, unknown>): void {
  emit('[DISPLAY COMMIT ENTER]', data);
}

export function emitDisplayCommitReturn(data: Record<string, unknown>): void {
  emit('[DISPLAY COMMIT RETURN]', data);
}

export function emitDisplayCommitApplied(data: Record<string, unknown>): void {
  emit('[DISPLAY COMMIT APPLIED]', data);
}

export function emitDisplayClear(data: Record<string, unknown>): void {
  emit('[DISPLAY CLEAR]', data);
}

export function emitDisplayApplyBlocked(data: Record<string, unknown>): void {
  emit('[DISPLAY APPLY BLOCKED]', data);
}

export function emitSyncDisplayReady(data: Record<string, unknown>): void {
  emit('[SYNC DISPLAY READY]', data);
}

export function emitDisplayAfterFlush(data: Record<string, unknown>): void {
  emit('[DISPLAY AFTER FLUSH]', data);
}

export function resolveOwnerDisplayKindBanId(display: {
  result?: { id: string } | null;
  incomingBan?: { id: string } | null;
  checkBan?: { id: string } | null;
}): { displayKind: string | null; displayBanId: string | null } {
  if (display.result) {
    return { displayKind: 'result', displayBanId: display.result.id };
  }
  if (display.incomingBan) {
    return { displayKind: 'incoming', displayBanId: display.incomingBan.id };
  }
  if (display.checkBan) {
    return { displayKind: 'check', displayBanId: display.checkBan.id };
  }
  return { displayKind: null, displayBanId: null };
}
