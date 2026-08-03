/**
 * Stage 8 Phase 5 — Notifications chaos diagnostic ledger.
 *
 * Enable (browser / Node smoke):
 *   globalThis.__NOTIFICATIONS_CHAOS_DIAG__ = true
 * or
 *   process.env.NOTIFICATIONS_CHAOS_DIAG = '1'
 *
 * Does not change Runtime/Coordinator behavior when disabled.
 */
export type ChaosDiagEntry = {
  seq: number;
  ts: number;
  channel: string;
  type: string;
  userId?: string | null;
  storeId?: string | null;
  lifecycleId?: string | null;
  source?: string | null;
  banId?: string | null;
  itemId?: string | null;
  queueBefore?: string[];
  queueAfter?: string[];
  activationBefore?: string | null;
  activationAfter?: string | null;
  activeItemId?: string | null;
  consumedIds?: string[];
  pendingGeneration?: number | null;
  currentOwner?: string | null;
  returnOwner?: string | null;
  reason?: string | null;
  detail?: Record<string, unknown>;
};

type ChaosGlobal = typeof globalThis & {
  __NOTIFICATIONS_CHAOS_DIAG__?: boolean;
  __notificationsChaosLedger?: ChaosDiagEntry[];
  __notificationsChaosSeq?: number;
};

function chaosGlobal(): ChaosGlobal {
  return globalThis as ChaosGlobal;
}

export function isNotificationsChaosDiagEnabled(): boolean {
  const g = chaosGlobal();
  if (g.__NOTIFICATIONS_CHAOS_DIAG__ === true) return true;
  if (typeof process !== 'undefined' && process.env?.NOTIFICATIONS_CHAOS_DIAG === '1') {
    return true;
  }
  return false;
}

export function resetNotificationsChaosDiag(): void {
  const g = chaosGlobal();
  g.__notificationsChaosLedger = [];
  g.__notificationsChaosSeq = 0;
}

export function getNotificationsChaosLedger(): readonly ChaosDiagEntry[] {
  return chaosGlobal().__notificationsChaosLedger ?? [];
}

export function logNotificationsChaos(
  channel: string,
  type: string,
  fields: Omit<ChaosDiagEntry, 'seq' | 'ts' | 'channel' | 'type'> = {},
): void {
  if (!isNotificationsChaosDiagEnabled()) return;
  const g = chaosGlobal();
  if (!g.__notificationsChaosLedger) g.__notificationsChaosLedger = [];
  g.__notificationsChaosSeq = (g.__notificationsChaosSeq ?? 0) + 1;
  const entry: ChaosDiagEntry = {
    seq: g.__notificationsChaosSeq,
    ts: Date.now(),
    channel,
    type,
    ...fields,
  };
  g.__notificationsChaosLedger.push(entry);
  // eslint-disable-next-line no-console
  console.log('[notifications-chaos]', entry);
}

let storeIdSeq = 0;
let lifecycleIdSeq = 0;
let transportIdSeq = 0;

export function nextChaosStoreId(): string {
  storeIdSeq += 1;
  return `runtime-store:${storeIdSeq}`;
}

export function nextChaosLifecycleId(): string {
  lifecycleIdSeq += 1;
  return `lifecycle:${lifecycleIdSeq}`;
}

export function nextChaosTransportId(): string {
  transportIdSeq += 1;
  return `transport:${transportIdSeq}`;
}
