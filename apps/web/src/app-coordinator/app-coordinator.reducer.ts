/**
 * Pure App Coordinator reducer.
 * Stage 7 Phase 3: BOOTING | PRODUCT only. No Notification / Reply ownership.
 */
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorEffect,
  type AppCoordinatorEvent,
  type AppCoordinatorResult,
  type AppCoordinatorState,
  type ProductResumeDestination,
  type ProductRoute,
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

function unchanged(state: AppCoordinatorState): AppCoordinatorResult {
  return { state, effects: [], violation: null };
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
      return unchanged(state);

    case 'BOOT_COMPLETED': {
      const destination = productDestination(event.productRoute ?? 'LOBBY');
      return enterProduct(state, destination);
    }

    case 'ENTRY_ROUTED': {
      if (event.intent.type === 'NOTIFICATION') {
        // Ingest only — does not change AppMode.
        return {
          state,
          effects: [runtime({ type: 'INGEST_ENTRY', intent: event.intent })],
          violation: null,
        };
      }
      return enterProduct(state, productDestination(event.intent.route));
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
        effects: [product({ type: 'OPEN_ROUTE', route: 'WHO' })],
        violation: null,
      };
    }

    case 'PRODUCT_ROUTE_CHANGED': {
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
        effects: [runtime({ type: 'FLUSH_DEFERRED_DIRECT_ENTRY' })],
        violation: null,
      };
    }

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
): AppCoordinatorState {
  return events.reduce(
    (currentState, event) =>
      appCoordinatorReducer(currentState, event).state,
    initialState,
  );
}
