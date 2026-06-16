import { normalizeId } from './normalize-json';

const STORAGE_KEY_PREFIX = '98plus_dismissed_results';
const MAX_IDS = 80;

function storageKey(scopeUserId?: string | null): string {
  return `${STORAGE_KEY_PREFIX}:${scopeUserId ?? 'global'}`;
}

function readIds(scopeUserId?: string | null): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(storageKey(scopeUserId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id) => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

function writeIds(ids: Set<string>, scopeUserId?: string | null) {
  if (typeof window === 'undefined') return;
  const list = [...ids].slice(-MAX_IDS);
  localStorage.setItem(storageKey(scopeUserId), JSON.stringify(list));
}

export function isDismissedResultLocally(
  banId: string,
  scopeUserId?: string | null,
): boolean {
  return readIds(scopeUserId).has(normalizeId(banId));
}

export function markDismissedResultLocally(
  banId: string,
  scopeUserId?: string | null,
) {
  const key = normalizeId(banId);
  if (!key) return;
  const ids = readIds(scopeUserId);
  ids.add(key);
  writeIds(ids, scopeUserId);
}

export function clearDismissedResultLocally(
  banId: string,
  scopeUserId?: string | null,
) {
  const key = normalizeId(banId);
  if (!key) return;
  const ids = readIds(scopeUserId);
  if (!ids.delete(key)) return;
  writeIds(ids, scopeUserId);
}

/** Restore in-memory consumed sets after auth ref reset. */
export function hydrateDismissedResultIds(
  scopeUserId?: string | null,
): string[] {
  return [...readIds(scopeUserId)];
}
