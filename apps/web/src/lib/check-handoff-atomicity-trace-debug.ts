'use client';

/**
 * CHECK_HANDOFF_ATOMICITY_TRACE
 *
 * Read-only diagnostic trace that stitches together every event of a single
 * Check-Card → next-card handoff under one shared `handoffTraceId`.
 *
 * This module NEVER changes business logic, timers, guards, queue consume,
 * render priority or lobby visibility. It only records the order of events
 * between releasing the current Check and the next card appearing (or the
 * lobby appearing in the gap).
 *
 * handoffTraceId format: `check-handoff:<banId>:<timestamp>`.
 */

import { diagTraceNow, emitClientDiagTrace } from './diag-trace-client';

const TRACE_EVENT = 'CHECK_HANDOFF_ATOMICITY_TRACE';

export type CheckHandoffOutcome =
  | 'next-card-committed'
  | 'queue-confirmed-empty'
  | 'open-lobby'
  | 'retry-exhausted'
  | 'handoff-aborted';

type CheckHandoffState = {
  id: string;
  banId: string;
  startedAt: number;
  prefetchStartedAt: number | null;
  prefetchStarted: boolean;
  prefetchSettled: boolean;
  nextCardCommitted: boolean;
  retryAttempt: number;
  lastStage: string | null;
  outcome: CheckHandoffOutcome | null;
  finalized: boolean;
  fetchedIdentities: string[];
};

/** Single active handoff. Kept until the next handoff begins so that the
 * post-commit render/transition observers (stages 11-13) can still attach the
 * correct id right after a final outcome. */
let active: CheckHandoffState | null = null;

/** Dedup keys: `${id}::${stage}::${dedupKey}`. */
const emittedKeys = new Set<string>();

/** InstantBanFlow-computed values mirrored for Providers-side stages. Written
 * during render (read-only mirror, no logging, no logic). */
type RenderMirror = {
  showLobbyCta: boolean | null;
  queueClaimsNotificationScreen: boolean | null;
  effectiveBansOverlayOpen: boolean | null;
  notificationQueueUiLock: boolean | null;
  effectiveOverlayQueueLengthForLobbyCta: number | null;
  queueLobbyGuardActive: boolean | null;
};

let renderMirror: RenderMirror = {
  showLobbyCta: null,
  queueClaimsNotificationScreen: null,
  effectiveBansOverlayOpen: null,
  notificationQueueUiLock: null,
  effectiveOverlayQueueLengthForLobbyCta: null,
  queueLobbyGuardActive: null,
};

export function updateCheckHandoffRenderMirror(patch: Partial<RenderMirror>): void {
  renderMirror = { ...renderMirror, ...patch };
}

export function getCheckHandoffRenderMirror(): Readonly<RenderMirror> {
  return renderMirror;
}

/** Providers-only values mirrored so the InstantBanFlow render observer (stage
 * 11) can report the shell/overlay mount-arm state of the same frame. */
type ProvidersMirror = {
  ownerDisplayKind: string | null;
  chainAdvancePlaceholderKind: string | null;
  checkOverlayMounted: boolean | null;
  showCheckOverlayDirect: boolean | null;
  ownerPrimaryCheckBanForDisplayGuardsId: string | null;
  notificationChainTransitioning: boolean | null;
  ownerQueueLength: number | null;
  ownerPendingLength: number | null;
  currentQueueHeadKind: string | null;
  currentQueueHeadIdentity: string | null;
  notificationQueueShellKind: string | null;
};

let providersMirror: ProvidersMirror = {
  ownerDisplayKind: null,
  chainAdvancePlaceholderKind: null,
  checkOverlayMounted: null,
  showCheckOverlayDirect: null,
  ownerPrimaryCheckBanForDisplayGuardsId: null,
  notificationChainTransitioning: null,
  ownerQueueLength: null,
  ownerPendingLength: null,
  currentQueueHeadKind: null,
  currentQueueHeadIdentity: null,
  notificationQueueShellKind: null,
};

export function updateCheckHandoffProvidersMirror(
  patch: Partial<ProvidersMirror>,
): void {
  providersMirror = { ...providersMirror, ...patch };
}

export function getCheckHandoffProvidersMirror(): Readonly<ProvidersMirror> {
  return providersMirror;
}

export function getActiveCheckHandoffTraceId(): string | null {
  return active?.id ?? null;
}

export function getActiveCheckHandoffState(): Readonly<CheckHandoffState> | null {
  return active;
}

export function checkHandoffElapsedFromStartMs(): number | null {
  if (!active) return null;
  return Math.round(diagTraceNow() - active.startedAt);
}

export function checkHandoffElapsedFromPrefetchMs(): number | null {
  if (!active || active.prefetchStartedAt == null) return null;
  return Math.round(diagTraceNow() - active.prefetchStartedAt);
}

/** Begin a new handoff trace at the moment the Check answer is accepted. Aborts
 * any previous still-unfinalized handoff. Returns the new handoffTraceId. */
export function beginCheckHandoffTrace(banId: string | null | undefined): string {
  if (active && !active.finalized) {
    // Previous handoff never reached a terminal outcome — record abort.
    emitCheckHandoffStage('handoff-aborted', {
      previousBanId: active.banId,
      abortedByNewHandoff: true,
      lastHandoffStage: active.lastStage,
    });
    active.outcome = 'handoff-aborted';
    active.finalized = true;
  }
  const normalizedBanId = (banId ?? '').trim() || 'unknown';
  const id = `check-handoff:${normalizedBanId}:${Date.now()}`;
  active = {
    id,
    banId: normalizedBanId,
    startedAt: diagTraceNow(),
    prefetchStartedAt: null,
    prefetchStarted: false,
    prefetchSettled: false,
    nextCardCommitted: false,
    retryAttempt: 0,
    lastStage: null,
    outcome: null,
    finalized: false,
    fetchedIdentities: [],
  };
  emittedKeys.clear();
  return id;
}

export function setCheckHandoffFetchedIdentities(identities: string[]): void {
  if (!active) return;
  active.fetchedIdentities = identities;
}

export function getCheckHandoffFetchedIdentities(): string[] {
  return active?.fetchedIdentities ?? [];
}

export function markCheckHandoffPrefetchStarted(): void {
  if (!active) return;
  active.prefetchStarted = true;
  if (active.prefetchStartedAt == null) {
    active.prefetchStartedAt = diagTraceNow();
  }
}

export function markCheckHandoffPrefetchSettled(): void {
  if (!active) return;
  active.prefetchSettled = true;
}

export function markCheckHandoffNextCardCommitted(): void {
  if (!active) return;
  active.nextCardCommitted = true;
}

export function setCheckHandoffRetryAttempt(attempt: number): void {
  if (!active) return;
  active.retryAttempt = attempt;
}

export function getCheckHandoffFlags(): {
  prefetchStarted: boolean;
  prefetchSettled: boolean;
  nextCardCommitted: boolean;
  retryAttempt: number;
  lastHandoffStage: string | null;
} {
  return {
    prefetchStarted: active?.prefetchStarted ?? false,
    prefetchSettled: active?.prefetchSettled ?? false,
    nextCardCommitted: active?.nextCardCommitted ?? false,
    retryAttempt: active?.retryAttempt ?? 0,
    lastHandoffStage: active?.lastStage ?? null,
  };
}

/** Mark a terminal outcome without clearing the active handoff (so post-commit
 * observers can still attach the id). The handoff is replaced on the next
 * `beginCheckHandoffTrace`. */
export function markCheckHandoffOutcome(outcome: CheckHandoffOutcome): void {
  if (!active) return;
  active.outcome = outcome;
  active.finalized = true;
}

/**
 * Emit one CHECK_HANDOFF_ATOMICITY_TRACE event, deduplicated by
 * `handoffTraceId + stage + dedupKey`. No-op when there is no active handoff.
 */
export function emitCheckHandoffStage(
  stage: string,
  fields: Record<string, unknown>,
  dedupKey?: string,
): void {
  if (!active) return;
  const key = `${active.id}::${stage}::${dedupKey ?? ''}`;
  if (emittedKeys.has(key)) return;
  emittedKeys.add(key);
  active.lastStage = stage;
  emitClientDiagTrace(TRACE_EVENT, {
    handoffTraceId: active.id,
    stage,
    t: diagTraceNow(),
    ...fields,
  });
}
