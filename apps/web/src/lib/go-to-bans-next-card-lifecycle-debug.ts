'use client';

import type { OwnerDisplayWriteTraceSnapshot } from '@/lib/owner-display-write-trace-debug';

const TRACE_TTL_MS = 30_000;

let traceActive = false;
let clickedBanId: string | null = null;
let traceStartedAt = 0;

function captureStack(): string | null {
  return new Error().stack?.split('\n').slice(2, 10).join('\n') ?? null;
}

function emit(event: string, data?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const payload = {
    t: typeof performance !== 'undefined' ? performance.now() : 0,
    stack: captureStack(),
    clickedBanId,
    ...data,
  };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function isGoToBansNextCardTraceActive(): boolean {
  if (!traceActive) return false;
  if (Date.now() - traceStartedAt > TRACE_TTL_MS) {
    traceActive = false;
    clickedBanId = null;
    return false;
  }
  return true;
}

export function beginGoToBansNextCardTrace(data: { banId: string | null }): void {
  traceActive = true;
  clickedBanId = data.banId;
  traceStartedAt = Date.now();
}

export function endGoToBansNextCardTrace(reason: string): void {
  if (!traceActive) return;
  emit('[GO TO BANS NEXT CARD TRACE END]', { reason });
  traceActive = false;
  clickedBanId = null;
}

export function logGoToBansNextCardClick(data: Record<string, unknown>): void {
  beginGoToBansNextCardTrace({
    banId: typeof data.banId === 'string' ? data.banId : null,
  });
  emit('[GO TO BANS NEXT CARD CLICK]', data);
}

export function logGoToBansResultClear(data: Record<string, unknown>): void {
  if (!isGoToBansNextCardTraceActive()) return;
  emit('[GO TO BANS RESULT CLEAR]', data);
}

export function logGoToBansQueueHeadBefore(data: Record<string, unknown>): void {
  if (!isGoToBansNextCardTraceActive()) return;
  emit('[GO TO BANS QUEUE HEAD BEFORE]', data);
}

export function logGoToBansQueueHeadAfter(data: Record<string, unknown>): void {
  if (!isGoToBansNextCardTraceActive()) return;
  emit('[GO TO BANS QUEUE HEAD AFTER]', data);
}

export function traceGoToBansOwnerDisplayWrite(data: {
  previous: OwnerDisplayWriteTraceSnapshot;
  next: OwnerDisplayWriteTraceSnapshot;
  source: string;
  eventType: string;
}): void {
  if (!isGoToBansNextCardTraceActive()) return;
  const { previous, next } = data;
  const resultCleared =
    previous.displayResultBanId != null && next.displayResultBanId == null;
  const incomingWritten =
    previous.displayIncomingBanId == null && next.displayIncomingBanId != null;
  const checkWritten =
    previous.displayCheckBanId == null && next.displayCheckBanId != null;
  const incomingCleared =
    previous.displayIncomingBanId != null && next.displayIncomingBanId == null;
  const checkCleared =
    previous.displayCheckBanId != null && next.displayCheckBanId == null;

  if (resultCleared) {
    emit('[GO TO BANS RESULT CLEAR]', {
      source: data.source,
      eventType: data.eventType,
      previousResultBanId: previous.displayResultBanId,
      nextResultBanId: next.displayResultBanId,
    });
  }

  if (incomingWritten || checkWritten) {
    emit('[GO TO BANS NEXT CARD OWNER WRITE]', {
      source: data.source,
      eventType: data.eventType,
      incomingWritten,
      checkWritten,
      displayIncomingBanId: next.displayIncomingBanId,
      displayCheckBanId: next.displayCheckBanId,
      displayResultBanId: next.displayResultBanId,
      activeKind: next.activeKind,
      activeBanId: next.activeBanId,
      queueHeadKind: next.queueHeadKind,
      queueHeadBanId: next.queueHeadBanId,
    });
  }

  if (incomingCleared || checkCleared) {
    emit('[GO TO BANS NEXT CARD OWNER CLEAR]', {
      source: data.source,
      eventType: data.eventType,
      incomingCleared,
      checkCleared,
      displayIncomingBanId: next.displayIncomingBanId,
      displayCheckBanId: next.displayCheckBanId,
    });
  }
}

export function logGoToBansNextCardMount(data: {
  kind: 'check' | 'incoming';
  banId: string;
  [key: string]: unknown;
}): void {
  if (!isGoToBansNextCardTraceActive()) return;
  emit('[GO TO BANS NEXT CARD MOUNT]', data);
}

export function logGoToBansNextCardUnmount(data: {
  kind: 'check' | 'incoming';
  banId: string;
  [key: string]: unknown;
}): void {
  if (!isGoToBansNextCardTraceActive()) return;
  emit('[GO TO BANS NEXT CARD UNMOUNT]', data);
}

export function logGoToBansNextCardShellVisibility(
  data: Record<string, unknown>,
): void {
  if (!isGoToBansNextCardTraceActive()) return;

  const queueHeadKind =
    typeof data.queueHeadKind === 'string' ? data.queueHeadKind : null;
  const shellKind =
    typeof data.shellKind === 'string' ? data.shellKind : null;
  const checkVisible = data.checkVisible === true;
  const incomingVisible = data.incomingVisible === true;

  const expectsCheck = queueHeadKind === 'check';
  const expectsIncoming = queueHeadKind === 'incoming';

  if (!expectsCheck && !expectsIncoming) {
    if (typeof data.queueLen === 'number' && data.queueLen === 0) {
      endGoToBansNextCardTrace('queue-empty');
    }
    return;
  }

  const cardVisible = expectsCheck ? checkVisible : incomingVisible;
  const shellMatches =
    shellKind === (expectsCheck ? 'check' : 'incoming');

  if (cardVisible && shellMatches) {
    endGoToBansNextCardTrace('next-card-visible');
    return;
  }

  const reasons: string[] = [];
  if (!shellMatches) {
    reasons.push(
      shellKind == null
        ? 'shell-kind-null'
        : `shell-kind-mismatch:${shellKind}`,
    );
  }
  if (!cardVisible) {
    reasons.push(
      typeof data.checkReason === 'string'
        ? `visibility:${data.checkReason}`
        : typeof data.incomingReason === 'string'
          ? `visibility:${data.incomingReason}`
          : 'visibility-false',
    );
  }
  if (data.chainAdvanceWaiting === true) {
    reasons.push('chain-advance-waiting');
  }
  if (data.shellAdvanceWaiting === true) {
    reasons.push('shell-advance-waiting');
  }
  if (data.composeBlocksNotificationHost === true) {
    reasons.push('compose-blocks-host');
  }
  if (data.showDirectOverboardLayer === true) {
    reasons.push('direct-overboard-layer');
  }

  emit('[GO TO BANS NEXT CARD NOT RENDERED]', {
    ...data,
    reason: reasons.join('|') || 'unknown',
  });
}
