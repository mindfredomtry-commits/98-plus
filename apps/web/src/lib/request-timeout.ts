export const DEFAULT_SEND_TIMEOUT_MS = 9_000;

export class RequestTimeoutError extends Error {
  constructor(message = 'Сеть тормозит, попробуй ещё раз') {
    super(message);
    this.name = 'RequestTimeoutError';
  }
}

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_SEND_TIMEOUT_MS, signal: outerSignal, ...rest } =
    init;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (outerSignal) {
    if (outerSignal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      outerSignal.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
    }
  }

  return fetch(input, { ...rest, signal: controller.signal }).finally(() => {
    clearTimeout(timeoutId);
  });
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  return false;
}
