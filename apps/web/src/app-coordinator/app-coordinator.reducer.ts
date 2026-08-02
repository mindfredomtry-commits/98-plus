/**
 * Pure App Coordinator reducer — Stage 8 Phase 3.
 * Owner Switching Engine evaluates; reducer applies decision and routes effects.
 * No ProductRoute. Domain intents are routed outside the reducer.
 */
import {
  decideOwnerSwitch,
  type OwnerSwitchResult,
} from './application-policy';
import { DEFAULT_DOMAIN_ID } from './application-owner';
import type { DomainCapability } from '@/domain-capability';
import type { OwnerRequest } from './owner-request';
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorEffect,
  type AppCoordinatorEvent,
  type AppCoordinatorInvariantViolation,
  type AppCoordinatorResult,
  type AppCoordinatorState,
} from './app-coordinator.types';

export type AppCoordinatorReduceContext = {
  /** Capability of current domain owner; null while BOOT. */
  getCurrentCapability: () => DomainCapability | null;
};

function runtime(
  command: AppCoordinatorEffect['command'],
): AppCoordinatorEffect {
  return { target: 'NOTIFICATION_RUNTIME', command };
}

function unchanged(state: AppCoordinatorState): AppCoordinatorResult {
  return { state, effects: [], violation: null };
}

function applyOwnerSwitch(
  state: AppCoordinatorState,
  policy: OwnerSwitchResult,
  effects: AppCoordinatorEffect[] = [],
): AppCoordinatorResult {
  const violation: AppCoordinatorInvariantViolation | null = policy.violation
    ? {
        code: policy.violation.code,
        eventType: 'OWNER_REQUESTED',
        message: policy.violation.message,
      }
    : null;

  if (policy.decision.type === 'KEEP_CURRENT') {
    return { state, effects, violation };
  }

  return {
    state: { currentOwner: policy.decision.owner },
    effects,
    violation,
  };
}

function requestOwner(
  state: AppCoordinatorState,
  request: OwnerRequest,
  getCurrentCapability: () => DomainCapability | null,
  effects: AppCoordinatorEffect[] = [],
): AppCoordinatorResult {
  const policy = decideOwnerSwitch({
    currentOwner: state.currentOwner,
    currentCapability: getCurrentCapability(),
    request,
  });
  return applyOwnerSwitch(state, policy, effects);
}

const defaultContext: AppCoordinatorReduceContext = {
  getCurrentCapability: () => ({ transition: 'ALLOWED' }),
};

export function appCoordinatorReducer(
  state: AppCoordinatorState,
  event: AppCoordinatorEvent,
  context: AppCoordinatorReduceContext = defaultContext,
): AppCoordinatorResult {
  switch (event.type) {
    case 'APP_STARTED':
      return unchanged(state);

    case 'BOOT_COMPLETED':
      return requestOwner(
        state,
        { target: DEFAULT_DOMAIN_ID, reason: 'SYSTEM_READY' },
        context.getCurrentCapability,
      );

    case 'ENTRY_ROUTED': {
      if (event.intent.type === 'NOTIFICATION') {
        // Ingest only — not an owner switch.
        return {
          state,
          effects: [runtime({ type: 'INGEST_ENTRY', intent: event.intent })],
          violation: null,
        };
      }
      return requestOwner(
        state,
        { target: DEFAULT_DOMAIN_ID, reason: 'ENTRY' },
        context.getCurrentCapability,
      );
    }

    case 'OWNER_REQUESTED':
      return requestOwner(
        state,
        event.request,
        context.getCurrentCapability,
      );

    case 'DOMAIN_RELEASED':
      // Runtime flush only — ownership unchanged.
      return {
        state,
        effects: [runtime({ type: 'FLUSH_DEFERRED_DIRECT_ENTRY' })],
        violation: null,
      };

    case 'RECONNECT_STARTED':
    case 'RECONNECT_COMPLETED':
      return unchanged(state);

    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return unchanged(state);
    }
  }
}

export function reduceAppCoordinator(
  events: readonly AppCoordinatorEvent[],
  initialState = createInitialAppCoordinatorState(),
  context: AppCoordinatorReduceContext = defaultContext,
): AppCoordinatorState {
  return events.reduce(
    (currentState, event) =>
      appCoordinatorReducer(currentState, event, context).state,
    initialState,
  );
}
