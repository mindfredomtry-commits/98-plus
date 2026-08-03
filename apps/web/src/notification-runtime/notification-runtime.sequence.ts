/**
 * Canonical bigint-safe sequence comparator for Notifications Sync V1.
 *
 * One comparator only. Presenter / Controller / Coordinator must not sort.
 * Client receive time is irrelevant; sequence is server-owned.
 */
import type { NotificationItemV1 } from '@98plus/shared';

const DECIMAL_RE = /^-?\d+$/;

/**
 * Compare two sequence strings as decimal bigints.
 * Invalid non-decimal strings sort after valid ones, then by raw string.
 */
export function compareNotificationSequenceV1(a: string, b: string): number {
  const aOk = DECIMAL_RE.test(a);
  const bOk = DECIMAL_RE.test(b);
  if (aOk && bOk) {
    const diff = BigInt(a) - BigInt(b);
    if (diff < BigInt(0)) return -1;
    if (diff > BigInt(0)) return 1;
    return 0;
  }
  if (aOk && !bOk) return -1;
  if (!aOk && bOk) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * FIFO item order: sequence ASC, then deterministic itemId tie-break.
 */
export function compareNotificationItemSequenceV1(
  a: Pick<NotificationItemV1, 'sequence' | 'itemId'>,
  b: Pick<NotificationItemV1, 'sequence' | 'itemId'>,
): number {
  const seq = compareNotificationSequenceV1(a.sequence, b.sequence);
  if (seq !== 0) return seq;
  if (a.itemId < b.itemId) return -1;
  if (a.itemId > b.itemId) return 1;
  return 0;
}

/** True iff `candidate` is strictly greater than `current` (decimal bigint). */
export function isRevisionNewerV1(
  current: string | null,
  candidate: string,
): boolean {
  if (current == null) return DECIMAL_RE.test(candidate);
  if (!DECIMAL_RE.test(current) || !DECIMAL_RE.test(candidate)) {
    return candidate > current;
  }
  return BigInt(candidate) > BigInt(current);
}

/** True iff revisions are equal decimal strings (or identical raw). */
export function isRevisionEqualV1(a: string, b: string): boolean {
  if (a === b) return true;
  if (DECIMAL_RE.test(a) && DECIMAL_RE.test(b)) {
    return BigInt(a) === BigInt(b);
  }
  return false;
}

/** Sort item IDs by their items' sequence ASC (missing items last). */
export function sortItemIdsBySequenceV1(
  itemIds: readonly string[],
  itemsById: Readonly<Record<string, NotificationItemV1>>,
): string[] {
  return [...itemIds].sort((idA, idB) => {
    const a = itemsById[idA];
    const b = itemsById[idB];
    if (!a && !b) return idA.localeCompare(idB);
    if (!a) return 1;
    if (!b) return -1;
    return compareNotificationItemSequenceV1(a, b);
  });
}
