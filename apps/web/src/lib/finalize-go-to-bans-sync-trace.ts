'use client';

/** Inline sync trace — always console.log in browser, no hydration gate, no dynamic import. */
export function emitFinalizeGoToBansSync(
  event: string,
  data: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  const payload = {
    t: typeof performance !== 'undefined' ? performance.now() : 0,
    callStack: new Error().stack?.split('\n').slice(2, 12).join('\n') ?? null,
    typeofWindow: typeof window,
    ...data,
  };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}
