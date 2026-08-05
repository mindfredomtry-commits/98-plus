import {
  appCoordinatorReducer,
  type AppCoordinatorReduceContext,
} from './app-coordinator.reducer';
import type {
  AppCoordinatorEvent,
  AppCoordinatorInvariantViolation,
  AppCoordinatorResult,
  AppCoordinatorState,
} from './app-coordinator.types';
import type { AppCoordinatorCommandExecutor } from './app-coordinator.command-executor';

export type AppCoordinatorListener = (
  state: AppCoordinatorState,
  previousState: AppCoordinatorState,
  event: AppCoordinatorEvent,
) => void;

export type AppCoordinatorDispatchResult =
  | { status: 'PROCESSED'; result: AppCoordinatorResult }
  | { status: 'QUEUED' };

export interface AppCoordinatorStore {
  getState(): AppCoordinatorState;
  dispatch(event: AppCoordinatorEvent): AppCoordinatorDispatchResult;
  subscribe(listener: AppCoordinatorListener): () => void;
}

export function createAppCoordinatorStore(input: {
  initialState: AppCoordinatorState;
  executor: AppCoordinatorCommandExecutor;
  reduceContext?: AppCoordinatorReduceContext;
  onInvariantViolation: (
    violation: AppCoordinatorInvariantViolation,
    event: AppCoordinatorEvent,
  ) => void;
  /**
   * Called after each queued event is fully reduced (including nested/QUEUED
   * events). Used for OPEN → activate so nested opens cannot skip activation.
   */
  onEventProcessed?: (
    event: AppCoordinatorEvent,
    result: AppCoordinatorResult,
    previousState: AppCoordinatorState,
  ) => void;
}): AppCoordinatorStore {
  let state = input.initialState;
  let processing = false;
  const queue: Array<{
    event: AppCoordinatorEvent;
    result?: AppCoordinatorResult;
  }> = [];
  const listeners = new Set<AppCoordinatorListener>();
  const reduceContext: AppCoordinatorReduceContext = input.reduceContext ?? {
    getCurrentCapability: () => ({ transition: 'ALLOWED' }),
  };

  function processQueuedEvents(): void {
    if (processing) return;
    processing = true;
    try {
      while (queue.length > 0) {
        const pending = queue.shift();
        if (!pending) continue;

        const previousState = state;
        const result = appCoordinatorReducer(
          previousState,
          pending.event,
          reduceContext,
        );
        pending.result = result;

        if (result.state !== previousState) {
          state = result.state;
          for (const listener of [...listeners]) {
            listener(state, previousState, pending.event);
          }
        }

        if (result.violation) {
          input.onInvariantViolation(result.violation, pending.event);
        }

        for (const effect of result.effects) {
          input.executor.execute(effect);
        }

        input.onEventProcessed?.(pending.event, result, previousState);
      }
    } catch (error) {
      queue.length = 0;
      throw error;
    } finally {
      processing = false;
    }
  }

  return {
    getState() {
      return state;
    },

    dispatch(event) {
      const pending: {
        event: AppCoordinatorEvent;
        result?: AppCoordinatorResult;
      } = { event };
      queue.push(pending);

      if (processing) {
        return { status: 'QUEUED' };
      }

      processQueuedEvents();
      if (!pending.result) {
        throw new Error('Coordinator event was not processed.');
      }
      return { status: 'PROCESSED', result: pending.result };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
