/**
 * Minimal Telegram EntryRouter — requests owner or ingest intent.
 * Never mounts a surface and never calls Runtime/Product directly.
 */
import { parseStartParam } from '@98plus/shared';
import type {
  EntryRouter,
  EntryRouterInput,
} from '@/app-coordinator/app-coordinator.boundaries';
import type { EntryIntent } from '@/app-coordinator/app-coordinator.types';

export function createTelegramEntryRouter(): EntryRouter {
  return {
    route(input: EntryRouterInput): EntryIntent {
      const action = parseStartParam(input.startParam);
      if (!action) {
        return { type: 'PRODUCT' };
      }
      switch (action.type) {
        case 'ban':
          return {
            type: 'NOTIFICATION',
            itemId: `incoming:${action.banId}`,
            notificationKind: 'incoming',
          };
        case 'check':
          return {
            type: 'NOTIFICATION',
            itemId: `check:${action.banId}`,
            notificationKind: 'status',
          };
        case 'result':
          return {
            type: 'NOTIFICATION',
            itemId: `result:${action.banId}`,
            notificationKind: 'status',
          };
        default:
          return { type: 'PRODUCT' };
      }
    },
  };
}
