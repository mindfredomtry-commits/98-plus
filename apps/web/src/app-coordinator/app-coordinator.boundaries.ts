import type {
  AppCoordinatorEvent,
  EntryIntent,
} from './app-coordinator.types';

export type EntryRouterInput = {
  startParam: string | null;
  launchSource: 'telegram' | 'bot-button' | 'web' | 'unknown';
};

/**
 * Parsing is intentionally outside Phase 1. An Entry Router may return only a
 * typed coordinator intent and never calls either subsystem directly.
 */
export interface EntryRouter {
  route(input: EntryRouterInput): EntryIntent;
}

export function entryIntentToCoordinatorEvent(
  intent: EntryIntent,
): AppCoordinatorEvent {
  return { type: 'ENTRY_ROUTED', intent };
}
