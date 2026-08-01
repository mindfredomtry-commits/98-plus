import type { AppCoordinatorEffect } from './app-coordinator.types';
import type { NotificationRuntimePort } from './app-coordinator.ports';

export interface AppCoordinatorCommandExecutor {
  execute(effect: AppCoordinatorEffect): void;
}

export function createAppCoordinatorCommandExecutor(input: {
  notificationRuntime: NotificationRuntimePort;
}): AppCoordinatorCommandExecutor {
  return {
    execute(effect) {
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
