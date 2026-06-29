'use client';

function captureCallstack(): string {
  try {
    const stack = new Error('[show-next-display-commit-trace]').stack ?? '';
    return stack.split('\n').slice(2, 14).join('\n');
  } catch {
    return '';
  }
}

function emit(event: string, data: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const payload = { t: performance.now(), ...data, callstack: captureCallstack() };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function emitShowNextPostSelectedEnter(
  data: Record<string, unknown>,
): void {
  emit('[SHOW NEXT POST SELECTED ENTER]', data);
}

export function emitShowNextReturn(data: Record<string, unknown>): void {
  emit('[SHOW NEXT RETURN]', data);
}

export function emitSyncDisplayCall(data: Record<string, unknown>): void {
  emit('[SYNC DISPLAY CALL]', data);
}

export function emitSyncDisplaySkipped(data: Record<string, unknown>): void {
  emit('[SYNC DISPLAY SKIPPED]', data);
}

export function emitSyncDisplayEnter(data: Record<string, unknown>): void {
  emit('[SYNC DISPLAY ENTER]', data);
}

export function emitSyncDisplayExit(data: Record<string, unknown>): void {
  emit('[SYNC DISPLAY EXIT]', data);
}

export function emitDisplayCommitCallSite(
  data: Record<string, unknown>,
): void {
  emit('[DISPLAY COMMIT CALL SITE]', data);
}

export function summarizeDisplayPatch(patch: {
  result?: unknown | null;
  checkBan?: { id: string } | null;
  incomingBan?: { id: string } | null;
  stableIncomingBan?: { id: string } | null;
  directResultOverlayActive?: boolean;
}): Record<string, unknown> {
  return {
    hasResult: patch.result !== undefined,
    resultId:
      patch.result && typeof patch.result === 'object' && patch.result !== null
        ? (patch.result as { id?: string }).id ?? null
        : patch.result === null
          ? null
          : undefined,
    checkBanId: patch.checkBan === undefined ? undefined : patch.checkBan?.id ?? null,
    incomingBanId:
      patch.incomingBan === undefined ? undefined : patch.incomingBan?.id ?? null,
    stableIncomingBanId:
      patch.stableIncomingBan === undefined
        ? undefined
        : patch.stableIncomingBan?.id ?? null,
    directResultOverlayActive: patch.directResultOverlayActive,
  };
}
