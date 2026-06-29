'use client';

type HydrateCallback = () => void;

let hydrated = false;
const hydrateQueue: HydrateCallback[] = [];
const moduleCache = new Map<string, Promise<unknown>>();

export function isBrowserDebugEnvironment(): boolean {
  return typeof window !== 'undefined';
}

export function isBrowserDebugHydrated(): boolean {
  return hydrated && isBrowserDebugEnvironment();
}

/** Call once from Providers after client mount — debug modules may run after this. */
export function markBrowserDebugHydrated(): void {
  if (!isBrowserDebugEnvironment() || hydrated) return;
  hydrated = true;
  const queue = hydrateQueue.splice(0, hydrateQueue.length);
  for (const cb of queue) {
    try {
      cb();
    } catch {
      /* debug only */
    }
  }
}

export function runAfterBrowserDebugHydrated(cb: HydrateCallback): void {
  if (!isBrowserDebugEnvironment()) return;
  if (hydrated) {
    cb();
    return;
  }
  hydrateQueue.push(cb);
}

export function importBrowserDebugModule<T>(
  key: string,
  loader: () => Promise<T>,
): Promise<T | null> {
  if (!isBrowserDebugEnvironment()) {
    return Promise.resolve(null);
  }
  if (!hydrated) {
    return new Promise((resolve) => {
      runAfterBrowserDebugHydrated(() => {
        void importBrowserDebugModule(key, loader).then(resolve);
      });
    });
  }
  const existing = moduleCache.get(key);
  if (existing) {
    return existing as Promise<T | null>;
  }
  const pending = loader()
    .catch(() => null)
    .then((mod) => mod ?? null);
  moduleCache.set(key, pending);
  return pending as Promise<T | null>;
}
