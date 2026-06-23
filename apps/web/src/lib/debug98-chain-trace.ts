'use client';

import type { Debug98Event } from './debug98log';

/** Separate from overlay / __debug98events (30 cap, may reset on HMR). */
export const MAX_CHAIN_TRACE_EVENTS = 150;

const CHAIN_TRACE_KEYWORDS = [
  'OVERBOARD',
  'CHAIN HEAD SWITCH TRACE',
  'ATOMIC-OVERBOARD',
  'CHAIN-CONTINUE',
  'CHAIN CONTINUE',
  'SHOW-NEXT',
  'SHOW NEXT',
  'RESULT CLEAR',
  'RESULT CARD',
  'RESULT DISPLAY SOURCE PICK',
  'INCOMING STABLE BAN SET',
  'ACTIVE USER CARD',
  'CHECK CARD HOLD',
  'DISMISS',
  'QUEUE ITEM BUILT',
] as const;

export function isChainTraceEvent(event: string): boolean {
  const upper = event.toUpperCase();
  return CHAIN_TRACE_KEYWORDS.some((keyword) => upper.includes(keyword));
}

function pickField(data: unknown, keys: readonly string[]): string {
  if (!data || typeof data !== 'object') return '-';
  const record = data as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'boolean') return value ? '1' : '0';
    return String(value);
  }
  return '-';
}

function formatTimeMs(t: number): string {
  const d = new Date(t);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function formatChainTraceLine(ev: Debug98Event): string {
  const data = ev.data;
  const source = pickField(data, ['source']);
  const banId = pickField(data, [
    'banId',
    'activeBanId',
    'activeOverlayBanId',
    'resultBanId',
    'currentResultId',
    'resultIdBefore',
    'atomicId',
  ]);
  const fromKind = pickField(data, ['fromKind', 'heldKindBefore', 'queueHeadKindBefore']);
  const fromBanId = pickField(data, ['fromBanId', 'heldResultIdBefore', 'queueHeadBanIdBefore']);
  const toKind = pickField(data, ['toKind', 'nextKind', 'kind', 'heldKindAfter']);
  const toBanId = pickField(data, [
    'toBanId',
    'nextBanId',
    'resultIdAfter',
    'heldResultIdAfter',
    'queueHeadBanIdAfter',
  ]);
  const atomicId = pickField(data, ['atomicId']);
  const heldKind = pickField(data, ['heldKind', 'heldKindBefore', 'heldKindAfter']);
  const heldBanId = pickField(data, [
    'heldBanId',
    'heldResultId',
    'heldResultIdBefore',
    'heldResultIdAfter',
  ]);
  const resultRefId = pickField(data, ['resultRefId', 'resultRefIdAfter']);
  const displayResultId = pickField(data, ['displayResultId']);
  const queueLen = pickField(data, ['queueLen', 'finalQueueLen']);
  const pendingLen = pickField(data, ['pendingLen', 'finalPendingLen']);
  const reason = pickField(data, [
    'reason',
    'blockReason',
    'returnNullReason',
    'sourcePicked',
    'apiStatus',
    'ok',
  ]);

  return [
    formatTimeMs(ev.t),
    ev.event,
    source,
    banId,
    `${fromKind}/${fromBanId}`,
    `${toKind}/${toBanId}`,
    atomicId,
    heldKind,
    heldBanId,
    resultRefId,
    displayResultId,
    queueLen,
    pendingLen,
    reason,
  ].join(' ');
}

let chainTraceEvents: Debug98Event[] = [];

export function appendChainTraceEvent(event: string, data?: unknown): void {
  if (!isChainTraceEvent(event)) return;
  const ev: Debug98Event = { t: Date.now(), event, data };
  chainTraceEvents = [...chainTraceEvents, ev].slice(-MAX_CHAIN_TRACE_EVENTS);
}

export function dump98ChainTrace(): string[] {
  return chainTraceEvents.map(formatChainTraceLine);
}

export async function copy98ChainTrace(): Promise<string> {
  const text = dump98ChainTrace().join('\n');
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
  return text;
}

export function resetChainTraceEvents(): void {
  chainTraceEvents = [];
}

declare global {
  interface Window {
    __dump98ChainTrace?: () => string[];
    __copy98ChainTrace?: () => Promise<string>;
  }
}

export function installChainTraceHelpers(): void {
  if (typeof window === 'undefined') return;
  window.__dump98ChainTrace = dump98ChainTrace;
  window.__copy98ChainTrace = copy98ChainTrace;
}
