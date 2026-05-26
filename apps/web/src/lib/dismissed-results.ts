const STORAGE_KEY = '98plus_dismissed_results';
const MAX_IDS = 80;

function readIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id) => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

function writeIds(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  const list = [...ids].slice(-MAX_IDS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function isDismissedResultLocally(banId: string): boolean {
  return readIds().has(banId);
}

export function markDismissedResultLocally(banId: string) {
  const ids = readIds();
  ids.add(banId);
  writeIds(ids);
}
