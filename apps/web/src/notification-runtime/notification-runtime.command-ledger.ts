/**
 * Stage 7 Phase 2 — diagnostic command ledger (queue head only).
 *
 * Records events at the dispatch boundary. No production behavior change.
 */
import {
  notificationItemId,
  type NotificationRuntimeEvent,
  type NotificationRuntimeState,
} from './notification-runtime.types';

export type CommandLedgerEntry = {
  seq: number;
  source: string;
  command: string;
  reason: string | null;
  transitionId: string | null;
  itemId: string | null;
  replaceQueue: boolean | null;
  incomingItemCount: number | null;
  lifecycleBefore: string;
  lifecycleAfter: string;
  transitionIdBefore: string | null;
  transitionIdAfter: string | null;
  queueLengthBefore: number;
  queueLengthAfter: number;
  headIdBefore: string | null;
  headIdAfter: string | null;
  changed: boolean;
  timestamp: number;
};

const DEFAULT_CAPACITY = 512;

let enabled = false;
let capacity = DEFAULT_CAPACITY;
let seqCounter = 0;
let buffer: CommandLedgerEntry[] = [];

export function isCommandLedgerEnabled(): boolean {
  if (enabled) return true;
  const g = globalThis as { __NOTIF_RUNTIME_LEDGER__?: unknown };
  return g.__NOTIF_RUNTIME_LEDGER__ === true;
}

export function enableCommandLedger(cap: number = DEFAULT_CAPACITY): void {
  enabled = true;
  capacity = Math.max(1, cap);
}

export function disableCommandLedger(): void {
  enabled = false;
}

export function resetCommandLedger(): void {
  seqCounter = 0;
  buffer = [];
}

function headId(state: NotificationRuntimeState): string | null {
  const head = state.items.queue[0];
  return head ? notificationItemId(head) : null;
}

function eventItemId(event: NotificationRuntimeEvent): string | null {
  if ('targetItemId' in event && event.targetItemId) return event.targetItemId;
  if ('itemId' in event && event.itemId) return event.itemId;
  if ('item' in event && event.item) return notificationItemId(event.item);
  if ('items' in event && Array.isArray(event.items) && event.items[0]) {
    return notificationItemId(event.items[0]);
  }
  return null;
}

export function recordCommand(
  event: NotificationRuntimeEvent,
  before: NotificationRuntimeState,
  after: NotificationRuntimeState,
): void {
  if (!isCommandLedgerEnabled()) return;
  const entry: CommandLedgerEntry = {
    seq: ++seqCounter,
    source: 'source' in event && event.source ? String(event.source) : 'unknown',
    command: event.type,
    reason: 'reason' in event && event.reason ? String(event.reason) : null,
    transitionId:
      'transitionId' in event && event.transitionId
        ? String(event.transitionId)
        : null,
    itemId: eventItemId(event),
    replaceQueue:
      'replaceQueue' in event ? Boolean(event.replaceQueue) : null,
    incomingItemCount:
      'items' in event && Array.isArray(event.items) ? event.items.length : null,
    lifecycleBefore: before.lifecycle.status,
    lifecycleAfter: after.lifecycle.status,
    transitionIdBefore: before.lifecycle.transitionId,
    transitionIdAfter: after.lifecycle.transitionId,
    queueLengthBefore: before.items.queue.length,
    queueLengthAfter: after.items.queue.length,
    headIdBefore: headId(before),
    headIdAfter: headId(after),
    changed:
      before.lifecycle.status !== after.lifecycle.status ||
      before.items.queue.length !== after.items.queue.length ||
      headId(before) !== headId(after),
    timestamp: Date.now(),
  };
  buffer.push(entry);
  if (buffer.length > capacity) {
    buffer = buffer.slice(buffer.length - capacity);
  }
}

export function getCommandLedgerEntries(): readonly CommandLedgerEntry[] {
  return buffer;
}
