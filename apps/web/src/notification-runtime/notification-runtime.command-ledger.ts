/**
 * Dev/test-only canonical command ledger.
 *
 * Records every event that reaches the notification-runtime dispatch boundary
 * with monotonic seq + compact before/after state, so the FIRST destructive
 * writer after showHead can be named (command + source + item id + transition).
 *
 * Constraints:
 * - No production behavior change: recording only; never alters dispatch result.
 * - Disabled unless the diagnostic flag is enabled (off by default).
 * - Bounded ring buffer (no unbounded memory growth).
 * - One canonical ledger — not scattered console logs.
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
  /** Async operation id / transition carried by the event, when present. */
  transitionId: string | null;
  /** Item id the command targets/creates, when derivable. */
  itemId: string | null;
  /** Whether replaceQueue was requested (empty-replace is the prime suspect). */
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
  displayKindBefore: string | null;
  displayKindAfter: string | null;
  displayItemIdBefore: string | null;
  displayItemIdAfter: string | null;
  /** True when this command turned a renderable display into a non-renderable one. */
  clearedRenderableDisplay: boolean;
  changed: boolean;
  timestamp: number;
};

const DEFAULT_CAPACITY = 512;

let enabled = false;
let capacity = DEFAULT_CAPACITY;
let seqCounter = 0;
let buffer: CommandLedgerEntry[] = [];

/** Enable via flag (globalThis.__NOTIF_RUNTIME_LEDGER__) or explicit call. */
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

function displayItemId(state: NotificationRuntimeState): string | null {
  const payload = state.display.payload;
  if (!payload) return null;
  if (payload.kind === 'result') {
    return `result:${String(payload.result.id).trim()}`;
  }
  return `${payload.kind}:${String(payload.ban.id).trim()}`;
}

function isRenderable(state: NotificationRuntimeState): boolean {
  return state.display.kind != null && state.display.payload != null;
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

function eventTransitionId(event: NotificationRuntimeEvent): string | null {
  if ('transitionId' in event && event.transitionId != null) {
    return String(event.transitionId);
  }
  if ('commandId' in event && event.commandId != null) {
    return String(event.commandId);
  }
  return null;
}

/**
 * Record one command with before/after snapshots. Cheap no-op when disabled.
 */
export function recordCommand(
  event: NotificationRuntimeEvent,
  before: NotificationRuntimeState,
  after: NotificationRuntimeState,
): CommandLedgerEntry | null {
  if (!isCommandLedgerEnabled()) return null;
  seqCounter += 1;
  const renderableBefore = isRenderable(before);
  const renderableAfter = isRenderable(after);
  const entry: CommandLedgerEntry = {
    seq: seqCounter,
    source: 'source' in event && event.source ? String(event.source) : 'unknown',
    command: event.type,
    reason: 'reason' in event && event.reason ? String(event.reason) : null,
    transitionId: eventTransitionId(event),
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
    displayKindBefore: before.display.kind,
    displayKindAfter: after.display.kind,
    displayItemIdBefore: displayItemId(before),
    displayItemIdAfter: displayItemId(after),
    clearedRenderableDisplay: renderableBefore && !renderableAfter,
    changed: before !== after,
    timestamp: Date.now(),
  };
  buffer.push(entry);
  if (buffer.length > capacity) buffer.splice(0, buffer.length - capacity);
  return entry;
}

export function getCommandLedger(): readonly CommandLedgerEntry[] {
  return buffer.slice();
}

/** First entry after (and including) `fromSeq` that cleared a renderable display. */
export function firstDestructiveAfterShow(
  fromSeq = 0,
): CommandLedgerEntry | null {
  for (const entry of buffer) {
    if (entry.seq >= fromSeq && entry.clearedRenderableDisplay) return entry;
  }
  return null;
}
