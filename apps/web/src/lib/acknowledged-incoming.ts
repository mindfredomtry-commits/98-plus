const MAX_IDS = 120;

function storageKey(userId: string): string {
  return `98plus_ack_incoming:${userId}`;
}

function writeIds(ids: Set<string>, userId: string) {
  if (typeof window === 'undefined') return;
  const list = [...ids].slice(-MAX_IDS);
  localStorage.setItem(storageKey(userId), JSON.stringify(list));
}

function readIdsForUser(userId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id) => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

export function isIncomingAcknowledgedLocally(userId: string, banId: string): boolean {
  return readIdsForUser(userId).has(banId);
}

export function markIncomingAcknowledgedLocally(userId: string, banId: string) {
  const ids = readIdsForUser(userId);
  ids.add(banId);
  writeIds(ids, userId);
}

export function hydrateAcknowledgedIncomingIds(userId: string): string[] {
  return [...readIdsForUser(userId)];
}
