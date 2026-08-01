/**
 * Pure App Coordinator reducer.
 *
 * It owns surface mode and emits commands through explicit subsystem ports.
 * It never reads or writes Notification Runtime or Product Flow state.
 */
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorEffect,
  type AppCoordinatorEvent,
  type AppCoordinatorInvariantCode,
  type AppCoordinatorResult,
  type AppCoordinatorState,
  type ProductResumeDestination,
  type ProductRoute,
  type ResumeDestination,
} from './app-coordinator.types';

function runtime(
  command: Extract<
    AppCoordinatorEffect,
    { target: 'NOTIFICATION_RUNTIME' }
  >['command'],
): AppCoordinatorEffect {
  return { target: 'NOTIFICATION_RUNTIME', command };
}

function product(
  command: Extract<
    AppCoordinatorEffect,
    { target: 'PRODUCT_FLOW' }
  >['command'],
): AppCoordinatorEffect {
  return { target: 'PRODUCT_FLOW', command };
}

function productDestination(route: ProductRoute): ProductResumeDestination {
  return { type: 'PRODUCT', route };
}

function finalProductDestination(
  destination: ResumeDestination,
): ProductResumeDestination {
  return destination.type === 'PRODUCT'
    ? destination
    : destination.afterQueue;
}

function unchanged(state: AppCoordinatorState): AppCoordinatorResult {
  return { state, effects: [], violation: null };
}

function reject(
  state: AppCoordinatorState,
  event: AppCoordinatorEvent,
  code: AppCoordinatorInvariantCode,
  message: string,
): AppCoordinatorResult {
  return {
    state,
    effects: [],
    violation: { code, eventType: event.type, message },
  };
}

function enterProduct(
  state: AppCoordinatorState,
  destination: ProductResumeDestination,
  effects: AppCoordinatorEffect[] = [],
): AppCoordinatorResult {
  return {
    state: {
      ...state,
      mode: { type: 'PRODUCT', route: destination.route },
      resumeDestination: destination,
    },
    effects: [
      ...effects,
      product({ type: 'OPEN_ROUTE', route: destination.route }),
    ],
    violation: null,
  };
}

export function appCoordinatorReducer(
  state: AppCoordinatorState,
  event: AppCoordinatorEvent,
): AppCoordinatorResult {
  switch (event.type) {
    case 'APP_STARTED':
      // Runtime bootstrap remains Runtime-owned in Phase 1.
      return unchanged(state);

    case 'BOOT_COMPLETED': {
      // Stage 7 Phase 2: never auto-enter NOTIFICATION from boot.
      void event.currentNotificationItemId;
      const destination = productDestination(event.productRoute ?? 'LOBBY');
      return enterProduct(state, destination);
    }

    case 'ENTRY_ROUTED': {
      if (event.intent.type === 'NOTIFICATION') {
        return {
          state,
          effects: [runtime({ type: 'INGEST_ENTRY', intent: event.intent })],
          violation: null,
        };
      }

      if (state.mode.type === 'REPLY_COMPOSE') {
        return unchanged(state);
      }

      const destination = productDestination(event.intent.route);
      const effects: AppCoordinatorEffect[] = [];
      if (state.mode.type === 'NOTIFICATION') {
        effects.push(
          runtime({
            type: 'SUSPEND',
            sourceItemId: state.mode.itemId,
            resumeToken: null,
          }),
        );
      }
      return enterProduct(state, destination, effects);
    }

    case 'PRODUCT_COMPOSE_REQUESTED': {
      if (
        state.mode.type !== 'PRODUCT' ||
        state.mode.route !== 'LOBBY'
      ) {
        return unchanged(state);
      }
      return {
        state: {
          ...state,
          mode: { type: 'PRODUCT', route: 'WHO' },
          resumeDestination: productDestination('LOBBY'),
        },
        effects: [
          runtime({
            type: 'SUSPEND',
            sourceItemId: null,
            resumeToken: null,
          }),
          product({ type: 'OPEN_ROUTE', route: 'WHO' }),
        ],
        violation: null,
      };
    }

    case 'PRODUCT_ROUTE_CHANGED': {
      if (state.mode.type === 'REPLY_COMPOSE') {
        if (
          state.mode.completionPending ||
          event.route === 'LOBBY' ||
          event.route === 'WHO' ||
          event.route === 'BANS' ||
          state.mode.route === event.route
        ) {
          return unchanged(state);
        }
        return {
          state: {
            ...state,
            mode: { ...state.mode, route: event.route },
          },
          effects: [],
          violation: null,
        };
      }
      if (state.mode.type !== 'PRODUCT') return unchanged(state);
      if (state.mode.route === event.route) return unchanged(state);
      return {
        state: {
          ...state,
          mode: { type: 'PRODUCT', route: event.route },
        },
        effects: [],
        violation: null,
      };
    }

    case 'PRODUCT_FLOW_RELEASED': {
      if (state.mode.type !== 'PRODUCT') return unchanged(state);
      const destination = productDestination(event.route);
      return {
        state: {
          ...state,
          mode: { type: 'PRODUCT', route: destination.route },
          resumeDestination: destination,
        },
        effects: [
          runtime({ type: 'RESUME', resumeToken: null }),
        ],
        violation: null,
      };
    }

    case 'REPLY_REQUESTED': {
      if (state.mode.type === 'REPLY_COMPOSE') {
        return reject(
          state,
          event,
          'REPLY_ALREADY_ACTIVE',
          'Only one reply suspension may be active.',
        );
      }
      if (state.mode.type !== 'NOTIFICATION') {
        return reject(
          state,
          event,
          'NO_ACTIVE_REPLY_SUSPENSION',
          'A reply can start only from the current notification.',
        );
      }
      if (state.mode.itemId !== event.sourceItemId) {
        return reject(
          state,
          event,
          'WRONG_REPLY_SOURCE_ITEM',
          'Reply source does not match the current notification.',
        );
      }

      const afterQueue = finalProductDestination(state.resumeDestination);
      return {
        state: {
          ...state,
          mode: {
            type: 'REPLY_COMPOSE',
            sourceItemId: event.sourceItemId,
            targetUserId: event.targetUserId,
            resumeToken: event.resumeToken,
            route: 'WHAT',
            completionPending: false,
          },
          resumeDestination: {
            type: 'NOTIFICATION',
            itemId: event.sourceItemId,
            afterQueue,
          },
        },
        effects: [
          runtime({
            type: 'SUSPEND',
            sourceItemId: event.sourceItemId,
            resumeToken: event.resumeToken,
          }),
          product({
            type: 'OPEN_ROUTE',
            route: 'WHAT',
            context: {
              type: 'REPLY',
              sourceItemId: event.sourceItemId,
              targetUserId: event.targetUserId,
              resumeToken: event.resumeToken,
            },
          }),
        ],
        violation: null,
      };
    }

    case 'REPLY_ROUTE_CHANGED': {
      if (state.mode.type !== 'REPLY_COMPOSE') {
        return reject(
          state,
          event,
          'NO_ACTIVE_REPLY_SUSPENSION',
          'Reply route changed without an active suspension.',
        );
      }
      if (state.mode.resumeToken !== event.resumeToken) {
        return reject(
          state,
          event,
          'STALE_RESUME_TOKEN',
          'Reply route change used a stale resume token.',
        );
      }
      if (state.mode.completionPending || state.mode.route === event.route) {
        return unchanged(state);
      }
      return {
        state: {
          ...state,
          mode: { ...state.mode, route: event.route },
        },
        effects: [],
        violation: null,
      };
    }

    case 'REPLY_CANCELLED': {
      if (state.mode.type !== 'REPLY_COMPOSE') {
        if (
          state.lastSettledReply?.resumeToken === event.resumeToken &&
          state.lastSettledReply.outcome === 'cancelled'
        ) {
          return reject(
            state,
            event,
            'DUPLICATE_REPLY_CANCELLATION',
            'Reply cancellation was already applied.',
          );
        }
        return reject(
          state,
          event,
          'RESUME_WITHOUT_ACTIVE_SUSPENSION',
          'Reply cancellation cannot resume Runtime without an active suspension.',
        );
      }
      if (state.mode.resumeToken !== event.resumeToken) {
        return reject(
          state,
          event,
          'STALE_RESUME_TOKEN',
          'Reply cancellation used a stale resume token.',
        );
      }
      if (state.mode.completionPending) {
        return reject(
          state,
          event,
          'DUPLICATE_REPLY_COMPLETION',
          'Reply completion is already pending.',
        );
      }

      const sourceItemId = state.mode.sourceItemId;
      // Stage 7 Phase 2: no Notification activation — cancel returns to Product.
      return enterProduct(
        {
          ...state,
          lastSettledReply: {
            resumeToken: event.resumeToken,
            sourceItemId,
            outcome: 'cancelled',
          },
        },
        finalProductDestination(state.resumeDestination),
        [runtime({ type: 'RESUME', resumeToken: event.resumeToken })],
      );
    }

    case 'REPLY_COMPLETED': {
      if (state.mode.type !== 'REPLY_COMPOSE') {
        if (
          state.lastSettledReply?.resumeToken === event.resumeToken &&
          state.lastSettledReply.outcome === 'completed'
        ) {
          return reject(
            state,
            event,
            'DUPLICATE_REPLY_COMPLETION',
            'Reply completion was already applied.',
          );
        }
        return reject(
          state,
          event,
          'NO_ACTIVE_REPLY_SUSPENSION',
          'Reply completed without an active suspension.',
        );
      }
      if (state.mode.resumeToken !== event.resumeToken) {
        return reject(
          state,
          event,
          'STALE_RESUME_TOKEN',
          'Reply completion used a stale resume token.',
        );
      }
      if (state.mode.sourceItemId !== event.sourceItemId) {
        return reject(
          state,
          event,
          'WRONG_REPLY_SOURCE_ITEM',
          'Reply completion source does not match the suspended item.',
        );
      }
      if (state.mode.completionPending) {
        return reject(
          state,
          event,
          'DUPLICATE_REPLY_COMPLETION',
          'Reply completion is already pending.',
        );
      }
      if (state.mode.route !== 'SUCCESS') {
        return reject(
          state,
          event,
          'REPLY_COMPLETED_BEFORE_SUCCESS',
          'Reply completion is valid only from SUCCESS.',
        );
      }

      // Stage 7 Phase 2: no Runtime→Coordinator activation facts.
      // Complete source in Runtime and return to Product immediately.
      return enterProduct(
        {
          ...state,
          lastSettledReply: {
            resumeToken: event.resumeToken,
            sourceItemId: event.sourceItemId,
            outcome: 'completed',
          },
        },
        finalProductDestination(state.resumeDestination),
        [
          runtime({
            type: 'COMPLETE_SOURCE_ITEM',
            sourceItemId: state.mode.sourceItemId,
            resumeToken: state.mode.resumeToken,
          }),
          runtime({
            type: 'RESUME',
            resumeToken: state.mode.resumeToken,
          }),
        ],
      );
    }

    case 'RECONNECT_STARTED':
    case 'RECONNECT_COMPLETED':
      // Reconnect is Runtime-owned. These facts must not change global mode.
      return unchanged(state);

    default:
      return unchanged(state);
  }
}

export function reduceAppCoordinator(
  events: readonly AppCoordinatorEvent[],
  initialState = createInitialAppCoordinatorState(),
): AppCoordinatorState {
  return events.reduce(
    (currentState, event) =>
      appCoordinatorReducer(currentState, event).state,
    initialState,
  );
}
