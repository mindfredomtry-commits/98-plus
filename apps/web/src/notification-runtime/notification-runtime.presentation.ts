/**
 * Root PresentationState — sole authority for which root surface may mount.
 *
 * LobbySurface / TransitionSurface / NotificationSurface are mutually exclusive.
 * `display === null` never implies LOBBY: gaps are TRANSITION until an explicit
 * idle+empty release with no in-flight handoff/action/result chain.
 */
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  getEarlyParkedActionResultForTest,
  getInteractiveCardActionChain,
  isInteractiveCardActionChainBan,
} from './notification-runtime.action-result-handoff';
import { selectCurrentItem } from './notification-runtime.selectors';
import type { NotificationRuntimeState } from './notification-runtime.types';
import { normalizeId } from '@/lib/normalize-json';

export type PresentationTransitionReason =
  | 'SUCCESS_HANDOFF'
  | 'ACTION_SUBMIT'
  | 'RESULT_WAIT'
  | 'RESULT_REPLACEMENT'
  | 'RECONCILIATION'
  | 'QUEUE_ADVANCE';

export type MaterializedNotificationDisplay =
  | { kind: 'incoming'; ban: BanInteraction }
  | { kind: 'check'; ban: BanInteraction }
  | { kind: 'result'; result: BanResult }
  | { kind: 'success' };

export type PresentationState =
  | { mode: 'LOBBY' }
  | { mode: 'TRANSITION'; reason: PresentationTransitionReason }
  | { mode: 'NOTIFICATION'; display: MaterializedNotificationDisplay };

function materializedFromRuntimeDisplay(
  state: NotificationRuntimeState,
): MaterializedNotificationDisplay | null {
  const payload = state.display.payload;
  if (!payload) return null;
  if (payload.kind === 'incoming') {
    return { kind: 'incoming', ban: payload.ban };
  }
  if (payload.kind === 'check') {
    return { kind: 'check', ban: payload.ban };
  }
  if (payload.kind === 'result') {
    return { kind: 'result', result: payload.result };
  }
  return null;
}

function hasActiveActionOrResultChain(state: NotificationRuntimeState): boolean {
  if (
    state.action.status === 'pending' ||
    state.action.status === 'succeeded' ||
    state.action.status === 'failed'
  ) {
    return true;
  }
  const head = selectCurrentItem(state);
  if (head?.kind === 'incoming') {
    const banId = normalizeId(head.ban.id);
    if (banId && isInteractiveCardActionChainBan(banId)) return true;
    if (banId && getEarlyParkedActionResultForTest(banId)) return true;
  }
  if (head?.kind === 'result') {
    const banId = normalizeId(head.result.id);
    if (banId && isInteractiveCardActionChainBan(banId)) return true;
  }
  return false;
}

function transitionReasonForState(
  state: NotificationRuntimeState,
): PresentationTransitionReason {
  if (state.lifecycle.status === 'draining') return 'SUCCESS_HANDOFF';
  if (state.lifecycle.status === 'recovering') return 'RECONCILIATION';
  if (state.action.status === 'pending') return 'ACTION_SUBMIT';
  if (state.action.status === 'succeeded') return 'RESULT_WAIT';
  if (state.action.status === 'failed') return 'RECONCILIATION';
  if (state.lifecycle.status === 'completing') return 'QUEUE_ADVANCE';
  if (state.lifecycle.status === 'submitting') return 'ACTION_SUBMIT';

  const head = selectCurrentItem(state);
  if (head?.kind === 'incoming') {
    const banId = normalizeId(head.ban.id);
    const chain = banId ? getInteractiveCardActionChain(banId) : null;
    if (chain?.status === 'in-flight' && chain.waitStartedAt != null) {
      return 'RESULT_WAIT';
    }
    if (chain?.status === 'in-flight' && chain.stagedResult != null) {
      return 'RESULT_REPLACEMENT';
    }
    if (banId && getEarlyParkedActionResultForTest(banId)) {
      return 'RESULT_WAIT';
    }
  }
  if (state.lifecycle.status === 'booting') return 'QUEUE_ADVANCE';
  return 'QUEUE_ADVANCE';
}

/**
 * Sole root presentation decision. Providers / InstantBanFlow must not invent
 * a competing mode — they only render the surface this selector selects.
 */
export function selectPresentationState(
  state: NotificationRuntimeState,
): PresentationState {
  // 1. SUCCESS card owns NotificationSurface.
  if (state.presentation.successCardVisible) {
    return { mode: 'NOTIFICATION', display: { kind: 'success' } };
  }

  // 2. Materialized runtime head → NotificationSurface (includes submitting).
  const materialized = materializedFromRuntimeDisplay(state);
  if (materialized) {
    return { mode: 'NOTIFICATION', display: materialized };
  }

  // 3. SUCCESS handoff armed (sync before SUCCESS unmount) or draining.
  if (state.presentation.handoffArmed || state.lifecycle.status === 'draining') {
    return { mode: 'TRANSITION', reason: 'SUCCESS_HANDOFF' };
  }
  if (state.lifecycle.status === 'submitting') {
    return { mode: 'TRANSITION', reason: 'ACTION_SUBMIT' };
  }
  if (state.lifecycle.status === 'completing') {
    return { mode: 'TRANSITION', reason: 'QUEUE_ADVANCE' };
  }
  if (state.lifecycle.status === 'recovering') {
    return { mode: 'TRANSITION', reason: 'RECONCILIATION' };
  }
  if (state.lifecycle.status === 'booting') {
    // Boot without a head: do not paint full Lobby under an unsafe boot claim.
    if (
      state.items.queue.length > 0 ||
      state.directEntry.active ||
      state.directEntry.deferred != null ||
      state.recovery.status === 'loading'
    ) {
      return { mode: 'TRANSITION', reason: transitionReasonForState(state) };
    }
  }
  if (hasActiveActionOrResultChain(state)) {
    return { mode: 'TRANSITION', reason: transitionReasonForState(state) };
  }

  // 4. Explicit Lobby release: idle + empty display + no ownership chain.
  if (
    state.lifecycle.status === 'idle' &&
    state.display.kind == null &&
    state.display.payload == null &&
    state.action.status === 'idle'
  ) {
    return { mode: 'LOBBY' };
  }

  // 5. showing/other without payload — retain TRANSITION, never invent LOBBY.
  return { mode: 'TRANSITION', reason: transitionReasonForState(state) };
}

export type PresentationSurfaceMount = {
  lobby: boolean;
  transition: boolean;
  notification: boolean;
};

export function presentationSurfaceMount(
  presentation: PresentationState,
): PresentationSurfaceMount {
  return {
    lobby: presentation.mode === 'LOBBY',
    transition: presentation.mode === 'TRANSITION',
    notification: presentation.mode === 'NOTIFICATION',
  };
}

/**
 * Dev/test fatal invariants for root presentation exclusivity.
 * Throws in development / when `forceThrow` is true.
 */
export function assertPresentationInvariants(
  presentation: PresentationState,
  state: NotificationRuntimeState,
  opts?: { forceThrow?: boolean; mountedSurfaces?: PresentationSurfaceMount },
): void {
  const errors: string[] = [];
  if (
    presentation.mode === 'NOTIFICATION' &&
    !(
      presentation.display &&
      (presentation.display.kind === 'success' ||
        presentation.display.kind === 'incoming' ||
        presentation.display.kind === 'check' ||
        presentation.display.kind === 'result')
    )
  ) {
    errors.push('NOTIFICATION requires a materialized display');
  }
  if (presentation.mode === 'LOBBY') {
    if (state.presentation.successCardVisible) {
      errors.push('LOBBY while SUCCESS card latch is active');
    }
    if (state.presentation.handoffArmed) {
      errors.push('LOBBY while SUCCESS handoff is armed');
    }
    if (state.lifecycle.status === 'draining') {
      errors.push('LOBBY while SUCCESS handoff draining');
    }
    if (state.lifecycle.status === 'submitting') {
      errors.push('LOBBY while card action submitting');
    }
    if (hasActiveActionOrResultChain(state) && state.action.status !== 'idle') {
      errors.push('LOBBY while action/result chain owns presentation');
    }
  }
  const mounted = opts?.mountedSurfaces;
  if (mounted) {
    const count =
      Number(mounted.lobby) +
      Number(mounted.transition) +
      Number(mounted.notification);
    if (count > 1) {
      errors.push(
        `multiple root surfaces mounted: lobby=${mounted.lobby} transition=${mounted.transition} notification=${mounted.notification}`,
      );
    }
    if (mounted.lobby && mounted.notification) {
      errors.push('LobbySurface and NotificationSurface coexist');
    }
    if (mounted.notification && presentation.mode !== 'NOTIFICATION') {
      errors.push('NotificationSurface mounted without NOTIFICATION mode');
    }
    if (mounted.lobby && presentation.mode !== 'LOBBY') {
      errors.push('LobbySurface mounted without LOBBY mode');
    }
  }
  if (errors.length === 0) return;
  const message = `[PRESENTATION_INVARIANT] ${errors.join('; ')}`;
  console.error(message, { presentation, lifecycle: state.lifecycle.status });
  if (
    opts?.forceThrow ||
    (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production')
  ) {
    throw new Error(message);
  }
}
