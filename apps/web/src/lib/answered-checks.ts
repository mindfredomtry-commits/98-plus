import { normalizeId } from './normalize-json';

const MAX_IDS = 200;

function storageKey(userId: string): string {
  return `98plus_answered_checks:${userId}`;
}

function readIdsForUser(userId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((id) => typeof id === 'string' && id.length > 0),
    );
  } catch {
    return new Set();
  }
}

function writeIds(ids: Set<string>, userId: string) {
  if (typeof window === 'undefined') return;
  const list = [...ids].slice(-MAX_IDS);
  localStorage.setItem(storageKey(userId), JSON.stringify(list));
}

export function isCheckAnsweredLocally(userId: string, banId: string): boolean {
  return readIdsForUser(userId).has(normalizeId(banId));
}

export function markCheckAnsweredLocally(userId: string, banId: string) {
  const key = normalizeId(banId);
  if (!key) return;
  const ids = readIdsForUser(userId);
  ids.add(key);
  writeIds(ids, userId);
}

export function hydrateAnsweredCheckIds(userId: string): string[] {
  return [...readIdsForUser(userId)];
}
