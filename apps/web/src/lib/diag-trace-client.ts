'use client';

export function isClientDiagTraceEnvironment(): boolean {
  return typeof window !== 'undefined';
}

export function canReadDiagDom(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function diagTraceNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

export function emitClientDiagTrace(
  event: string,
  payload: Record<string, unknown>,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}
