/**
 * Pure App Coordinator selectors — Stage 8 Phase 1.
 * Surface selection follows currentOwner only.
 */
import type { ApplicationOwner, DomainId } from './application-owner';
import type { AppCoordinatorState } from './app-coordinator.types';

export type ApplicationSurfaceOwner = 'BOOT' | DomainId;

export function selectCurrentOwner(
  state: AppCoordinatorState,
): ApplicationOwner {
  return state.currentOwner;
}

export function selectApplicationSurfaceOwner(
  state: AppCoordinatorState,
): ApplicationSurfaceOwner {
  if (state.currentOwner.type === 'BOOT') return 'BOOT';
  return state.currentOwner.domain;
}

export function selectCurrentDomainId(
  state: AppCoordinatorState,
): DomainId | null {
  return state.currentOwner.type === 'DOMAIN'
    ? state.currentOwner.domain
    : null;
}
