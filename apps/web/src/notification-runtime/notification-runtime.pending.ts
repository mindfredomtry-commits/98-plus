/**
 * Vertical 4 — canonical pending indicator ingest + consume helpers.
 * Badge = selectIndicatorVisible only. Queue length / hints are not authority.
 */
import { normalizeId } from '@/lib/normalize-json';
import { overlayQueueKey, type QueuedOverlay } from '@/lib/overlay-queue';
import type { NotificationRuntimeStore } from './notification-runtime.store';
import type { RuntimeSource } from './notification-runtime.types';
import { mapProvidersSourceToRuntime } from './notification-runtime.production-advance';

/** Normalize + dedupe stable item ids (`kind:id`). */
export function normalizePendingItemIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id || !id.includes(':') || id.endsWith(':') || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function pendingItemIdsFromQueued(
  items: readonly QueuedOverlay[],
): string[] {
  return normalizePendingItemIds(items.map(overlayQueueKey));
}

export function pendingItemIdFromParts(
  kind: 'incoming' | 'check' | 'result',
  banId: string,
): string | null {
  const id = normalizeId(banId);
  if (!id) return null;
  return `${kind}:${id}`;
}

/**
 * Replace pending source snapshot (server/live prefetch).
 * Consumed tombstones are retained; selector subtracts them (no resurrection).
 */
export function ingestPendingSnapshot(
  store: NotificationRuntimeStore,
  itemIds: readonly string[],
  source: string | RuntimeSource,
  sourceVersion: string | null = null,
): void {
  const runtimeSource =
    typeof source === 'string' ? mapProvidersSourceToRuntime(source) : source;
  store.dispatch({
    type: 'PENDING_SOURCE_UPDATED',
    itemIds: normalizePendingItemIds(itemIds),
    sourceVersion,
    source: runtimeSource,
  });
}

/**
 * Merge ids into current pending snapshot (live / deeplink single-item).
 * Idempotent for duplicates.
 */
export function mergePendingItemIds(
  store: NotificationRuntimeStore,
  itemIds: readonly string[],
  source: string | RuntimeSource,
  sourceVersion: string | null = null,
): void {
  const incoming = normalizePendingItemIds(itemIds);
  if (incoming.length === 0) return;
  const current = store.getState().pending.itemIds;
  const merged = normalizePendingItemIds([...current, ...incoming]);
  ingestPendingSnapshot(store, merged, source, sourceVersion);
}

/**
 * Immediate local consume tombstone — badge hides without server ack.
 * Does not clear queue/lifecycle; idempotent.
 */
export function markRuntimeItemConsumed(
  store: NotificationRuntimeStore,
  itemId: string,
  source: string | RuntimeSource = 'user',
): void {
  const id = itemId.trim();
  if (!id) return;
  const runtimeSource =
    typeof source === 'string' ? mapProvidersSourceToRuntime(source) : source;
  store.dispatch({
    type: 'ITEM_CONSUMED',
    itemId: id,
    source: runtimeSource,
  });
}

/** Map prefetch payload rows → stable pending item ids. */
export function pendingIdsFromPrefetchParts(input: {
  incomingIds?: readonly string[];
  checkId?: string | null;
  resultId?: string | null;
}): string[] {
  const ids: string[] = [];
  for (const raw of input.incomingIds ?? []) {
    const id = pendingItemIdFromParts('incoming', raw);
    if (id) ids.push(id);
  }
  if (input.checkId) {
    const id = pendingItemIdFromParts('check', input.checkId);
    if (id) ids.push(id);
  }
  if (input.resultId) {
    const id = pendingItemIdFromParts('result', input.resultId);
    if (id) ids.push(id);
  }
  return normalizePendingItemIds(ids);
}
