/**
 * Generic request to change Application Owner.
 */
import type { DomainId } from './application-owner';

export type OwnerRequestReason =
  | 'USER_INTENT'
  | 'ENTRY'
  | 'DOMAIN_RELEASE'
  | 'SYSTEM_READY';

export type OwnerRequest = {
  target: DomainId;
  reason: OwnerRequestReason;
};
