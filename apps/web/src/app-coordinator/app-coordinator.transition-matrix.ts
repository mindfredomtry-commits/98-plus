/**
 * Stage 8 Phase 1 — documented Coordinator transitions (owner policy).
 */
export type TransitionMatrixRow = {
  id: string;
  currentOwner: string;
  event: string;
  nextOwner: string;
};

export const APP_COORDINATOR_TRANSITION_MATRIX: TransitionMatrixRow[] = [
  {
    id: 'boot-default-domain',
    currentOwner: 'BOOT',
    event: 'BOOT_COMPLETED',
    nextOwner: 'DOMAIN(CREATE_BAN)',
  },
  {
    id: 'entry-product-owner',
    currentOwner: 'BOOT|DOMAIN(*)',
    event: 'ENTRY_ROUTED(PRODUCT)',
    nextOwner: 'DOMAIN(CREATE_BAN)',
  },
  {
    id: 'entry-ingest-only',
    currentOwner: 'DOMAIN(CREATE_BAN)',
    event: 'ENTRY_ROUTED(NOTIFICATION)',
    nextOwner: 'DOMAIN(CREATE_BAN) + Runtime INGEST_ENTRY',
  },
  {
    id: 'domain-release-flush',
    currentOwner: 'DOMAIN(CREATE_BAN)',
    event: 'DOMAIN_RELEASED',
    nextOwner: 'unchanged + FLUSH_DEFERRED_DIRECT_ENTRY',
  },
  {
    id: 'reconnect-noop',
    currentOwner: 'DOMAIN(*)',
    event: 'RECONNECT_STARTED/COMPLETED',
    nextOwner: 'unchanged',
  },
];
