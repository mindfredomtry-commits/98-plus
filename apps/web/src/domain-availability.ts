/**
 * Target-owner availability — distinct from DomainCapability.
 * Capability: may the current owner release?
 * Availability: can the target owner truthfully start?
 */

export type DomainAvailabilityReason = 'NO_READY_OR_ACTIVE_ITEM';

export type DomainAvailability =
  | { availability: 'AVAILABLE' }
  | {
      availability: 'UNAVAILABLE';
      reason: DomainAvailabilityReason;
    };

export function available(): DomainAvailability {
  return { availability: 'AVAILABLE' };
}

export function unavailable(
  reason: DomainAvailabilityReason,
): DomainAvailability {
  return { availability: 'UNAVAILABLE', reason };
}
