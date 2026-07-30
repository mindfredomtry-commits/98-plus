/**
 * Pure App Coordinator selectors.
 *
 * The mounted surface owner is selected only from explicit AppMode. No UI flag
 * combinations, Runtime paint state, or Product state are accepted here.
 */
import type {
  AppCoordinatorState,
  AppMode,
  ProductRoute,
  ReplyComposeRoute,
  ResumeDestination,
} from './app-coordinator.types';

export type ApplicationSurfaceOwner =
  | 'BOOT'
  | 'PRODUCT_FLOW'
  | 'NOTIFICATION_SYSTEM';

export function selectAppMode(state: AppCoordinatorState): AppMode {
  return state.mode;
}

export function selectApplicationSurfaceOwner(
  state: AppCoordinatorState,
): ApplicationSurfaceOwner {
  switch (state.mode.type) {
    case 'BOOTING':
      return 'BOOT';
    case 'NOTIFICATION':
      return 'NOTIFICATION_SYSTEM';
    case 'PRODUCT':
    case 'REPLY_COMPOSE':
      return 'PRODUCT_FLOW';
  }
}

export function selectProductRoute(
  state: AppCoordinatorState,
): ProductRoute | null {
  return state.mode.type === 'PRODUCT' ? state.mode.route : null;
}

export function selectNotificationItemId(
  state: AppCoordinatorState,
): string | null {
  return state.mode.type === 'NOTIFICATION' ? state.mode.itemId : null;
}

export function selectReplyCompose(
  state: AppCoordinatorState,
): {
  sourceItemId: string;
  targetUserId: string;
  resumeToken: string;
  route: ReplyComposeRoute;
  completionPending: boolean;
} | null {
  if (state.mode.type !== 'REPLY_COMPOSE') return null;
  return {
    sourceItemId: state.mode.sourceItemId,
    targetUserId: state.mode.targetUserId,
    resumeToken: state.mode.resumeToken,
    route: state.mode.route,
    completionPending: state.mode.completionPending,
  };
}

export function selectResumeDestination(
  state: AppCoordinatorState,
): ResumeDestination {
  return state.resumeDestination;
}

export function selectIsExclusiveProductFlow(
  state: AppCoordinatorState,
): boolean {
  return (
    state.mode.type === 'REPLY_COMPOSE' ||
    (state.mode.type === 'PRODUCT' && state.mode.route !== 'LOBBY')
  );
}
