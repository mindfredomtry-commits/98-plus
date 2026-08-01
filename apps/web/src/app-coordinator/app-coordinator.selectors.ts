/**
 * Pure App Coordinator selectors.
 * Surface owner is selected only from explicit AppMode.
 */
import type {
  AppCoordinatorState,
  AppMode,
  ProductRoute,
  ResumeDestination,
} from './app-coordinator.types';

export type ApplicationSurfaceOwner = 'BOOT' | 'PRODUCT_FLOW';

export function selectAppMode(state: AppCoordinatorState): AppMode {
  return state.mode;
}

export function selectApplicationSurfaceOwner(
  state: AppCoordinatorState,
): ApplicationSurfaceOwner {
  switch (state.mode.type) {
    case 'BOOTING':
      return 'BOOT';
    case 'PRODUCT':
      return 'PRODUCT_FLOW';
  }
}

export function selectProductRoute(
  state: AppCoordinatorState,
): ProductRoute | null {
  return state.mode.type === 'PRODUCT' ? state.mode.route : null;
}

export function selectResumeDestination(
  state: AppCoordinatorState,
): ResumeDestination {
  return state.resumeDestination;
}

export function selectIsExclusiveProductFlow(
  state: AppCoordinatorState,
): boolean {
  return state.mode.type === 'PRODUCT' && state.mode.route !== 'LOBBY';
}
