/**
 * Create Ban controller — owns CreateBanState, runs effects via ports/sinks.
 */
import type { ProductFlowEventSink } from '@/app-coordinator/app-coordinator.ports';
import type {
  ProductRoute,
  ProductRouteContext,
} from '@/app-coordinator/app-coordinator.types';
import {
  createBanReducer,
  createInitialCreateBanState,
} from './create-ban.reducer';
import {
  mapUnknownSubmitError,
  type CreateBanRecipientsPort,
  type CreateBanSubmissionPort,
} from './create-ban.ports';
import type {
  CreateBanEvent,
  CreateBanState,
  CreateBanUiIntent,
} from './create-ban.types';

export type CreateBanController = {
  getState(): CreateBanState;
  subscribe(listener: (state: CreateBanState) => void): () => void;
  /** Coordinator ProductFlowPort entry. */
  openRoute(input: {
    route: ProductRoute;
    context?: ProductRouteContext;
  }): void;
  /** Compatibility local navigation — preserves reply/draft. */
  changeLocalRoute(route: ProductRoute): void;
  dispatch(intent: CreateBanUiIntent): void;
  /**
   * Compatibility: force SUCCESS after an external success mark.
   * Prefer SUBMIT_SUCCEEDED via the submission port.
   */
  markSendSucceeded(banId: string): void;
  dispose(): void;
};

export function createCreateBanController(input: {
  sink: ProductFlowEventSink;
  submissionPort?: CreateBanSubmissionPort | null;
  recipientsPort?: CreateBanRecipientsPort | null;
}): CreateBanController {
  let state = createInitialCreateBanState();
  let disposed = false;
  const listeners = new Set<(state: CreateBanState) => void>();
  let submitGeneration = 0;
  let recipientsGeneration = 0;

  function emit(): void {
    for (const listener of [...listeners]) {
      listener(state);
    }
  }

  function applyEvent(event: CreateBanEvent): void {
    if (disposed) return;
    const result = createBanReducer(state, event);
    state = result.state;
    emit();
    for (const effect of result.effects) {
      runEffect(effect);
    }
  }

  function runEffect(
    effect: ReturnType<typeof createBanReducer>['effects'][number],
  ): void {
    if (disposed) return;
    switch (effect.type) {
      case 'SINK_ROUTE_CHANGED':
        input.sink.routeChanged(effect.route);
        return;
      case 'SINK_REPLY_CANCELLED':
        input.sink.replyCancelled({
          resumeToken: effect.resumeToken,
          sourceItemId: effect.sourceItemId,
        });
        return;
      case 'SINK_REPLY_COMPLETED':
        input.sink.replyCompleted({
          resumeToken: effect.resumeToken,
          sourceItemId: effect.sourceItemId,
        });
        return;
      case 'SINK_FLOW_RELEASED':
        input.sink.flowReleased(effect.route);
        return;
      case 'SUBMIT': {
        const port = input.submissionPort;
        if (!port) {
          applyEvent({
            type: 'SUBMIT_FAILED',
            error: { code: 'AUTH_REQUIRED', detail: 'Submission port unbound' },
          });
          return;
        }
        const gen = ++submitGeneration;
        void port
          .submit(effect.command)
          .then((result) => {
            if (disposed || gen !== submitGeneration) return;
            applyEvent({ type: 'SUBMIT_SUCCEEDED', result });
          })
          .catch((err: unknown) => {
            if (disposed || gen !== submitGeneration) return;
            applyEvent({
              type: 'SUBMIT_FAILED',
              error: mapUnknownSubmitError(err),
            });
          });
        return;
      }
      case 'LOAD_RECIPIENTS': {
        const port = input.recipientsPort;
        if (!port) {
          applyEvent({
            type: 'RECIPIENTS_LOAD_FAILED',
            error: {
              code: 'RECIPIENTS_LOAD_FAILED',
              detail: 'Recipients port unbound',
            },
          });
          return;
        }
        const gen = ++recipientsGeneration;
        // Ensure LOADING if reducer did not already set it (OPEN_ROUTE path).
        if (state.recipients.status !== 'LOADING') {
          state = {
            ...state,
            recipients: { status: 'LOADING' },
          };
          emit();
        }
        void port
          .loadRecipients()
          .then((recipients) => {
            if (disposed || gen !== recipientsGeneration) return;
            applyEvent({
              type: 'RECIPIENTS_LOAD_SUCCEEDED',
              recipients,
            });
          })
          .catch((err: unknown) => {
            if (disposed || gen !== recipientsGeneration) return;
            applyEvent({
              type: 'RECIPIENTS_LOAD_FAILED',
              error: {
                code: 'RECIPIENTS_LOAD_FAILED',
                detail: err instanceof Error ? err.message : undefined,
              },
            });
          });
        return;
      }
      default:
        return;
    }
  }

  return {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    openRoute(openInput) {
      applyEvent({
        type: 'OPEN_ROUTE',
        route: openInput.route,
        context: openInput.context,
      });
    },

    changeLocalRoute(route) {
      applyEvent({ type: 'LOCAL_ROUTE_CHANGED', route });
    },

    dispatch(intent) {
      applyEvent(intent);
    },

    markSendSucceeded(banId) {
      applyEvent({
        type: 'SUBMIT_SUCCEEDED',
        result: { banId },
      });
    },

    dispose() {
      disposed = true;
      submitGeneration += 1;
      recipientsGeneration += 1;
      listeners.clear();
    },
  };
}
