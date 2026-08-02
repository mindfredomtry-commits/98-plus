/**
 * Pure App Coordinator reducer — Stage 8 Phase 5.
 * Owner Switching Engine evaluates; reducer owns returnOwner context.
 * No Notifications/Settings-specific branches inside the pure policy engine.
 */
import {
  decideOwnerSwitch,
  type OwnerSwitchResult,
} from './application-policy';
import { DEFAULT_DOMAIN_ID } from './application-owner';
import type { DomainAvailability } from '@/domain-availability';
import type { DomainCapability } from '@/domain-capability';
import type { DomainId } from './application-owner';
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
  /**
   * Target availability for opening a domain (generic projection).
   * Defaults to AVAILABLE when omitted (CreateBan / Settings).
   */
  getTargetAvailability?: (domain: DomainId) => DomainAvailability;
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
  patch: Partial<AppCoordinatorState> = {},
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
    return {
      state: { ...state, ...patch },
      effects,
      violation,
    };
  }

  return {
    state: {
      ...state,
      ...patch,
      currentOwner: policy.decision.owner,
    },
    effects,
    violation,
  };
}

function requestOwner(
  state: AppCoordinatorState,
  request: OwnerRequest,
  getCurrentCapability: () => DomainCapability | null,
  patch: Partial<AppCoordinatorState> = {},
  effects: AppCoordinatorEffect[] = [],
): AppCoordinatorResult {
  const policy = decideOwnerSwitch({
    currentOwner: state.currentOwner,
    currentCapability: getCurrentCapability(),
    request,
  });
  return applyOwnerSwitch(state, policy, patch, effects);
}

function releaseTemporaryOwner(
  state: AppCoordinatorState,
  expectedDomain: DomainId,
  eventType:
    | 'CLOSE_SETTINGS_REQUESTED'
    | 'NOTIFICATIONS_RELEASE_REQUESTED',
  getCurrentCapability: () => DomainCapability | null,
): AppCoordinatorResult {
  if (
    state.currentOwner.type !== 'DOMAIN' ||
    state.currentOwner.domain !== expectedDomain
  ) {
    return unchanged(state);
  }
  if (state.returnOwner == null || state.returnOwner.type !== 'DOMAIN') {
    return {
      state,
      effects: [],
      violation: {
        code: 'MISSING_RETURN_OWNER',
        eventType,
        message: `Cannot release ${expectedDomain} without a valid return owner`,
      },
    };
  }
  const returnDomain = state.returnOwner.domain;
  const policy = decideOwnerSwitch({
    currentOwner: state.currentOwner,
    currentCapability: getCurrentCapability(),
    request: { target: returnDomain, reason: 'DOMAIN_RELEASE' },
  });
  if (policy.decision.type === 'SWITCH_OWNER') {
    return {
      state: {
        currentOwner: policy.decision.owner,
        returnOwner: null,
      },
      effects: [],
      violation: null,
    };
  }
  return applyOwnerSwitch(state, policy);
}

const defaultContext: AppCoordinatorReduceContext = {
  getCurrentCapability: () => ({ transition: 'ALLOWED' }),
  getTargetAvailability: () => ({ availability: 'AVAILABLE' }),
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
        { returnOwner: null },
      );

    case 'ENTRY_ROUTED': {
      if (event.intent.type === 'NOTIFICATION') {
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
        { returnOwner: null },
      );
    }

    case 'OWNER_REQUESTED':
      return requestOwner(
        state,
        event.request,
        context.getCurrentCapability,
      );

    case 'OPEN_SETTINGS_REQUESTED': {
      if (state.currentOwner.type !== 'DOMAIN') {
        return unchanged(state);
      }
      const previousOwner = state.currentOwner;
      const policy = decideOwnerSwitch({
        currentOwner: state.currentOwner,
        currentCapability: context.getCurrentCapability(),
        request: { target: 'SETTINGS', reason: 'USER_INTENT' },
      });
      if (policy.decision.type === 'KEEP_CURRENT') {
        return applyOwnerSwitch(state, policy);
      }
      return {
        state: {
          currentOwner: policy.decision.owner,
          returnOwner: previousOwner,
        },
        effects: [],
        violation: null,
      };
    }

    case 'CLOSE_SETTINGS_REQUESTED':
      return releaseTemporaryOwner(
        state,
        'SETTINGS',
        'CLOSE_SETTINGS_REQUESTED',
        context.getCurrentCapability,
      );

    case 'OPEN_NOTIFICATIONS_REQUESTED': {
      if (state.currentOwner.type !== 'DOMAIN') {
        return unchanged(state);
      }
      const getAvailability =
        context.getTargetAvailability ??
        (() => ({ availability: 'AVAILABLE' as const }));
      const availability = getAvailability('NOTIFICATIONS');
      if (availability.availability === 'UNAVAILABLE') {
        return {
          state,
          effects: [],
          violation: {
            code: 'NOTIFICATIONS_UNAVAILABLE',
            eventType: 'OPEN_NOTIFICATIONS_REQUESTED',
            message: `Notifications unavailable: ${availability.reason}`,
          },
        };
      }
      const previousOwner = state.currentOwner;
      const policy = decideOwnerSwitch({
        currentOwner: state.currentOwner,
        currentCapability: context.getCurrentCapability(),
        request: { target: 'NOTIFICATIONS', reason: 'USER_INTENT' },
      });
      if (policy.decision.type === 'KEEP_CURRENT') {
        return applyOwnerSwitch(state, policy);
      }
      return {
        state: {
          currentOwner: policy.decision.owner,
          returnOwner: previousOwner,
        },
        effects: [],
        violation: null,
      };
    }

    case 'NOTIFICATIONS_RELEASE_REQUESTED':
      return releaseTemporaryOwner(
        state,
        'NOTIFICATIONS',
        'NOTIFICATIONS_RELEASE_REQUESTED',
        context.getCurrentCapability,
      );

    case 'DOMAIN_RELEASED':
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
