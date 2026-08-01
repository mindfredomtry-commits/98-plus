/**
 * Stage 7 Phase 2 — documented Coordinator transitions (no auto-activation).
 */
export type TransitionMatrixRow = {
  id: string;
  currentMode: string;
  event: string;
  nextMode: string;
};

/**
 * Passive Stage 7 matrix. Notification activation is intentionally absent.
 * Future Coordinator ACTIVATE policy must replace rows that previously
 * described RUNTIME_CURRENT_CHANGED / QUEUE_DRAINED auto-open.
 */
export const APP_COORDINATOR_TRANSITION_MATRIX: TransitionMatrixRow[] = [
  {
    id: 'boot-product',
    currentMode: 'BOOTING',
    event: 'BOOT_COMPLETED(currentItemId=null|ignored)',
    nextMode: 'PRODUCT(LOBBY)',
  },
  {
    id: 'entry-ingest-only',
    currentMode: 'PRODUCT(*)',
    event: 'ENTRY_ROUTED(NOTIFICATION)',
    nextMode: 'PRODUCT(*) + Runtime INGEST_ENTRY',
  },
  {
    id: 'compose',
    currentMode: 'PRODUCT(LOBBY)',
    event: 'PRODUCT_COMPOSE_REQUESTED',
    nextMode: 'PRODUCT(WHO)',
  },
  {
    id: 'reply-cancel-product',
    currentMode: 'REPLY_COMPOSE',
    event: 'REPLY_CANCELLED',
    nextMode: 'PRODUCT(saved)',
  },
  {
    id: 'reply-complete-product',
    currentMode: 'REPLY_COMPOSE(SUCCESS)',
    event: 'REPLY_COMPLETED',
    nextMode: 'PRODUCT(saved)',
  },
  {
    id: 'reconnect-noop',
    currentMode: 'PRODUCT(*)|NOTIFICATION(*)',
    event: 'RECONNECT_STARTED/COMPLETED',
    nextMode: 'unchanged',
  },
];
