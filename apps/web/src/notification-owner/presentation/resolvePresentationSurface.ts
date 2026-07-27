/**
 * Pure surface identity for NotificationPresentation.
 * One presentation kind → exactly one top-level surface id.
 */
import type { NotificationPresentationState } from '../notification-owner.types';

export type PresentationSurfaceId =
  | 'BOOT'
  | 'LOBBY'
  | 'WHAT'
  | 'CONFIRM'
  | 'SENDING'
  | 'SUCCESS'
  | 'INCOMING'
  | 'CHECK'
  | 'ACTION_PENDING'
  | 'RESULT';

export type PresentationSurfaceDescriptor = {
  surfaceId: PresentationSurfaceId;
  /** DOM data attribute value for the root of this surface. */
  rootTestId: string;
  /** Nested markers that must be present for a complete surface. */
  requiredMarkers: readonly string[];
  /** Markers that must never appear on this surface. */
  forbiddenMarkers: readonly string[];
};

const FORBIDDEN_CROSS: Record<PresentationSurfaceId, readonly string[]> = {
  BOOT: [
    'data-np-surface="LOBBY"',
    'data-np-surface="INCOMING"',
    'data-np-surface="SUCCESS"',
    'data-np-overlay-shell',
  ],
  LOBBY: [
    'data-np-surface="INCOMING"',
    'data-np-surface="SUCCESS"',
    'data-np-surface="RESULT"',
    'data-np-overlay-shell',
    'data-np-orb-only',
  ],
  WHAT: ['data-np-surface="LOBBY"', 'data-np-overlay-shell'],
  CONFIRM: ['data-np-surface="LOBBY"', 'data-np-overlay-shell'],
  SENDING: [
    'data-np-surface="LOBBY"',
    'data-np-surface="CONFIRM"',
    'data-np-overlay-shell',
  ],
  SUCCESS: [
    'data-np-surface="LOBBY"',
    'data-np-overlay-shell',
    'data-np-surface="INCOMING"',
  ],
  INCOMING: [
    'data-np-surface="LOBBY"',
    'data-np-surface="SUCCESS"',
    'data-direct-overboard-result',
  ],
  CHECK: [
    'data-np-surface="LOBBY"',
    'data-np-surface="SUCCESS"',
    'data-direct-overboard-result',
  ],
  ACTION_PENDING: [
    'data-np-surface="LOBBY"',
    'data-direct-overboard-result',
  ],
  RESULT: [
    'data-np-surface="LOBBY"',
    'data-direct-overboard-result',
    'data-np-secondary-result-portal',
  ],
};

export function resolvePresentationSurface(
  presentation: NotificationPresentationState,
): PresentationSurfaceDescriptor {
  const kind = presentation.kind;
  switch (kind) {
    case 'BOOT':
      return {
        surfaceId: 'BOOT',
        rootTestId: 'data-np-surface="BOOT"',
        requiredMarkers: ['data-np-boot-complete'],
        forbiddenMarkers: FORBIDDEN_CROSS.BOOT,
      };
    case 'LOBBY':
      return {
        surfaceId: 'LOBBY',
        rootTestId: 'data-np-surface="LOBBY"',
        requiredMarkers: [
          'data-np-lobby-orb',
          'data-np-lobby-logo',
          'data-np-lobby-cta',
          'data-np-lobby-chrome',
          'data-np-lobby-mode="full"',
        ],
        forbiddenMarkers: FORBIDDEN_CROSS.LOBBY,
      };
    case 'WHAT':
      return {
        surfaceId: 'WHAT',
        rootTestId: 'data-np-surface="WHAT"',
        requiredMarkers: ['data-np-what-compose'],
        forbiddenMarkers: FORBIDDEN_CROSS.WHAT,
      };
    case 'CONFIRM':
      return {
        surfaceId: 'CONFIRM',
        rootTestId: 'data-np-surface="CONFIRM"',
        requiredMarkers: ['data-np-confirm-card'],
        forbiddenMarkers: FORBIDDEN_CROSS.CONFIRM,
      };
    case 'SENDING':
      return {
        surfaceId: 'SENDING',
        rootTestId: 'data-np-surface="SENDING"',
        requiredMarkers: ['data-np-sending'],
        forbiddenMarkers: FORBIDDEN_CROSS.SENDING,
      };
    case 'SUCCESS':
      return {
        surfaceId: 'SUCCESS',
        rootTestId: 'data-np-surface="SUCCESS"',
        requiredMarkers: ['data-np-success-card'],
        forbiddenMarkers: FORBIDDEN_CROSS.SUCCESS,
      };
    case 'INCOMING':
      return {
        surfaceId: 'INCOMING',
        rootTestId: 'data-np-surface="INCOMING"',
        requiredMarkers: [
          'data-np-backdrop',
          'data-np-overlay-shell',
          'data-np-card',
          'data-np-incoming-controls',
        ],
        forbiddenMarkers: FORBIDDEN_CROSS.INCOMING,
      };
    case 'CHECK':
      return {
        surfaceId: 'CHECK',
        rootTestId: 'data-np-surface="CHECK"',
        requiredMarkers: [
          'data-np-backdrop',
          'data-np-overlay-shell',
          'data-np-card',
          'data-np-check-controls',
        ],
        forbiddenMarkers: FORBIDDEN_CROSS.CHECK,
      };
    case 'ACTION_PENDING':
      return {
        surfaceId: 'ACTION_PENDING',
        rootTestId: 'data-np-surface="ACTION_PENDING"',
        requiredMarkers: [
          'data-np-backdrop',
          'data-np-overlay-shell',
          'data-np-card',
          'data-np-action-pending',
        ],
        forbiddenMarkers: FORBIDDEN_CROSS.ACTION_PENDING,
      };
    case 'RESULT':
      return {
        surfaceId: 'RESULT',
        rootTestId: 'data-np-surface="RESULT"',
        requiredMarkers: [
          'data-np-backdrop',
          'data-np-overlay-shell',
          'data-np-card',
          'data-np-result-card',
        ],
        forbiddenMarkers: FORBIDDEN_CROSS.RESULT,
      };
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      throw new Error('unknown presentation kind');
    }
  }
}

/** Count top-level surface roots in markup (must be exactly 1). */
export function countTopLevelSurfaces(html: string): number {
  const matches = html.match(/data-np-surface="/g);
  return matches?.length ?? 0;
}
