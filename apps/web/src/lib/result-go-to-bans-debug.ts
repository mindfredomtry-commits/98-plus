'use client';

import { bridgeGoToBansContinueEntry } from '@/lib/go-to-bans-continue-trace-debug';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logResultGoToBansClick(data: Record<string, unknown>): void {
  emit('[RESULT GO_TO_BANS CLICK]', data);
  bridgeGoToBansContinueEntry({
    source: String(data.source ?? 'result-go-to-bans-click'),
    handlerName: 'logResultGoToBansClick',
    banId: (data.banId as string | null | undefined) ?? null,
    resultId: (data.banId as string | null | undefined) ?? null,
    action: 'click',
    wasDirect: (data.wasDirect as boolean | null | undefined) ?? null,
  });
}

export function logResultGoToBansClearActiveHold(
  data: Record<string, unknown>,
): void {
  emit('[RESULT GO_TO_BANS CLEAR ACTIVE HOLD]', data);
}

export function logResultGoToBansRemainingQueue(
  data: Record<string, unknown>,
): void {
  emit('[RESULT GO_TO_BANS REMAINING QUEUE]', data);
}

export function logResultGoToBansShowNext(data: Record<string, unknown>): void {
  emit('[RESULT GO_TO_BANS SHOW NEXT]', data);
}

export function logResultGoToBansOpenBansSection(
  data: Record<string, unknown>,
): void {
  emit('[RESULT GO_TO_BANS OPEN BANS SECTION]', data);
}

export function logResultGoToBansEmptyScreenBug(
  data: Record<string, unknown>,
): void {
  emit('[RESULT GO_TO_BANS EMPTY SCREEN BUG]', data);
}

export function logGoToBansEmptyRuntimeDeferredToAsyncContinue(
  data: Record<string, unknown>,
): void {
  emit('GO_TO_BANS_EMPTY_RUNTIME_DEFERRED_TO_ASYNC_CONTINUE', data);
}
