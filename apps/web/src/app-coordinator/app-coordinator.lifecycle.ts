/**
 * One App Coordinator lifecycle for the application.
 * Constructed once; disposed explicitly. No module-global mutable singleton.
 */
import { createAppCoordinatorCommandExecutor } from './app-coordinator.command-executor';
import {
  createNotificationRuntimeEventSink,
  createProductFlowEventSink,
} from './app-coordinator.ports';
import {
  createAppCoordinatorStore,
  type AppCoordinatorStore,
} from './app-coordinator.store';
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorInvariantViolation,
  type AppCoordinatorEvent,
} from './app-coordinator.types';
import {
  createSequentialResumeTokenFactory,
  type ResumeTokenFactory,
} from './resume-token';
import {
  createNotificationRuntimePort,
  type NotificationRuntimePortHandle,
} from '@/notification-runtime/notification-runtime.coordinator-port';
import { createDirectItemTransport } from '@/notification-runtime/notification-runtime.direct-item-transport';
import type { NotificationRuntimeStore } from '@/notification-runtime/notification-runtime.store';
import {
  createProductFlowController,
  type ProductFlowController,
} from '@/product-flow/product-flow.controller';
import { createTelegramEntryRouter } from './app-coordinator.entry-router';
import {
  entryIntentToCoordinatorEvent,
  type EntryRouter,
} from './app-coordinator.boundaries';

export type AppCoordinatorLifecycle = {
  store: AppCoordinatorStore;
  runtimePort: NotificationRuntimePortHandle;
  productController: ProductFlowController;
  resumeTokens: ResumeTokenFactory;
  entryRouter: EntryRouter;
  dispatch(event: AppCoordinatorEvent): void;
  dispose(): void;
};

export function createAppCoordinatorLifecycle(input: {
  runtimeStore: NotificationRuntimeStore;
  getToken: () => string | null;
  onInvariantViolation?: (
    violation: AppCoordinatorInvariantViolation,
    event: AppCoordinatorEvent,
  ) => void;
}): AppCoordinatorLifecycle {
  let disposed = false;
  const resumeTokens = createSequentialResumeTokenFactory('prod-reply');
  const entryRouter = createTelegramEntryRouter();

  let store!: AppCoordinatorStore;
  let runtimePort!: NotificationRuntimePortHandle;
  let productController!: ProductFlowController;

  const dispatch = (event: AppCoordinatorEvent) => {
    if (disposed) return;
    store.dispatch(event);
  };

  const runtimeSink = createNotificationRuntimeEventSink(dispatch);
  const productSink = createProductFlowEventSink(dispatch);

  productController = createProductFlowController({ sink: productSink });
  runtimePort = createNotificationRuntimePort({
    store: input.runtimeStore,
    sink: runtimeSink,
    fetchDirectItem: createDirectItemTransport(input.getToken),
  });

  const executor = createAppCoordinatorCommandExecutor({
    notificationRuntime: runtimePort,
    productFlow: productController.asPort(),
  });

  store = createAppCoordinatorStore({
    initialState: createInitialAppCoordinatorState(),
    executor,
    onInvariantViolation(violation, event) {
      input.onInvariantViolation?.(violation, event);
      console.error('[app-coordinator:invariant]', violation, event);
    },
  });

  store.dispatch({ type: 'APP_STARTED' });

  return {
    store,
    runtimePort,
    productController,
    resumeTokens,
    entryRouter,
    dispatch,
    dispose() {
      if (disposed) return;
      disposed = true;
      runtimePort.dispose();
      productController.dispose();
    },
  };
}

export function routeLaunchEntry(
  lifecycle: AppCoordinatorLifecycle,
  input: {
    startParam: string | null;
    launchSource: 'telegram' | 'bot-button' | 'web' | 'unknown';
  },
): void {
  const intent = lifecycle.entryRouter.route(input);
  lifecycle.dispatch(entryIntentToCoordinatorEvent(intent));
}
