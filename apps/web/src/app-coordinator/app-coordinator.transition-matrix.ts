/**
 * Stage 7 Phase 3 — documented Coordinator transitions (BOOT | PRODUCT only).
 */
export type TransitionMatrixRow = {
  id: string;
  currentMode: string;
  event: string;
  nextMode: string;
};

export const APP_COORDINATOR_TRANSITION_MATRIX: TransitionMatrixRow[] = [
  {
    id: 'boot-product',
    currentMode: 'BOOTING',
    event: 'BOOT_COMPLETED',
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
    id: 'product-release',
    currentMode: 'PRODUCT(*)',
    event: 'PRODUCT_FLOW_RELEASED',
    nextMode: 'PRODUCT(route) + FLUSH_DEFERRED_DIRECT_ENTRY',
  },
  {
    id: 'reconnect-noop',
    currentMode: 'PRODUCT(*)',
    event: 'RECONNECT_STARTED/COMPLETED',
    nextMode: 'unchanged',
  },
];
