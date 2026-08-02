/**
 * Stage 8 Phase 3 — Owner Switching Engine decision table.
 * Documented transitions for owner authority only (no routes/screens).
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
    event: 'BOOT_COMPLETED → OwnerRequest(SYSTEM_READY)',
    nextOwner: 'DOMAIN(default) via SWITCH_OWNER',
  },
  {
    id: 'entry-product-owner',
    currentOwner: 'BOOT|DOMAIN(*)',
    event: 'ENTRY_ROUTED(PRODUCT) → OwnerRequest(ENTRY)',
    nextOwner: 'DOMAIN(default) via policy',
  },
  {
    id: 'entry-ingest-only',
    currentOwner: 'DOMAIN(*)',
    event: 'ENTRY_ROUTED(NOTIFICATION)',
    nextOwner: 'KEEP_CURRENT + Runtime INGEST_ENTRY',
  },
  {
    id: 'owner-requested',
    currentOwner: 'DOMAIN(*)',
    event: 'OWNER_REQUESTED',
    nextOwner: 'KEEP_CURRENT | SWITCH_OWNER (policy)',
  },
  {
    id: 'domain-release-flush',
    currentOwner: 'DOMAIN(*)',
    event: 'DOMAIN_RELEASED',
    nextOwner: 'KEEP_CURRENT + FLUSH_DEFERRED_DIRECT_ENTRY',
  },
  {
    id: 'reconnect-noop',
    currentOwner: 'DOMAIN(*)',
    event: 'RECONNECT_STARTED/COMPLETED',
    nextOwner: 'KEEP_CURRENT',
  },
];

/**
 * Pure Owner Switching Engine decision table (generic classes).
 */
export type OwnerDecisionTableRow = {
  id: string;
  condition: string;
  decisionClass: 'KEEP_CURRENT' | 'SWITCH_OWNER' | 'INVALID_REQUEST' | 'BLOCKED';
  binary: 'KEEP_CURRENT' | 'SWITCH_OWNER';
};

export const OWNER_SWITCH_DECISION_TABLE: OwnerDecisionTableRow[] = [
  {
    id: 'no-request',
    condition: 'request == null',
    decisionClass: 'KEEP_CURRENT',
    binary: 'KEEP_CURRENT',
  },
  {
    id: 'same-owner',
    condition: 'target == currentOwner',
    decisionClass: 'KEEP_CURRENT',
    binary: 'KEEP_CURRENT',
  },
  {
    id: 'invalid-unregistered',
    condition: 'target not registered',
    decisionClass: 'INVALID_REQUEST',
    binary: 'KEEP_CURRENT',
  },
  {
    id: 'boot-forbidden-reason',
    condition: 'BOOT + reason not SYSTEM_READY|ENTRY',
    decisionClass: 'INVALID_REQUEST',
    binary: 'KEEP_CURRENT',
  },
  {
    id: 'boot-allowed',
    condition: 'BOOT + SYSTEM_READY|ENTRY + registered',
    decisionClass: 'SWITCH_OWNER',
    binary: 'SWITCH_OWNER',
  },
  {
    id: 'blocked',
    condition: 'currentCapability BLOCKED (or null off-BOOT)',
    decisionClass: 'BLOCKED',
    binary: 'KEEP_CURRENT',
  },
  {
    id: 'allowed-switch',
    condition: 'ALLOWED + different registered target',
    decisionClass: 'SWITCH_OWNER',
    binary: 'SWITCH_OWNER',
  },
];
