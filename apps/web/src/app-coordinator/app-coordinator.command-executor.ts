import type { AppCoordinatorEffect } from './app-coordinator.types';
import type {
  NotificationRuntimePort,
  ProductFlowPort,
} from './app-coordinator.ports';

export interface AppCoordinatorCommandExecutor {
  execute(effect: AppCoordinatorEffect): void;
}

export function createAppCoordinatorCommandExecutor(input: {
  notificationRuntime: NotificationRuntimePort;
  productFlow: ProductFlowPort;
}): AppCoordinatorCommandExecutor {
  return {
    execute(effect) {
      if (effect.target === 'PRODUCT_FLOW') {
        input.productFlow.openRoute({ route: effect.command.route });
        return;
      }

      const command = effect.command;
      switch (command.type) {
        case 'INGEST_ENTRY':
          input.notificationRuntime.ingestEntry(command.intent);
          return;
        case 'FLUSH_DEFERRED_DIRECT_ENTRY':
          input.notificationRuntime.flushDeferredDirectEntry();
          return;
      }
    },
  };
}
