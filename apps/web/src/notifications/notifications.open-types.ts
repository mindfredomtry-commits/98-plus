/**
 * Stage 8 Phase 9H — Notifications open-path generations + open result types.
 */
export type NotificationsOpenRejectionCode =
  | 'OWNER_NOT_ALLOWED'
  | 'NOTIFICATIONS_UNAVAILABLE'
  | 'ACTIVATION_FAILED'
  | 'DISPOSED';

export type NotificationsOpenResult =
  | {
      ok: true;
      correlationId: string;
      ownerTransitionGeneration: number;
      presentationSessionGeneration: number;
      activationGeneration: number;
      activeItemId: string;
    }
  | {
      ok: false;
      correlationId: string;
      code: NotificationsOpenRejectionCode;
      message: string;
    };

export type NotificationsSessionCompleteMeta = {
  presentationSessionGeneration: number;
  reason: 'action' | 'close' | 'no_ready';
};
