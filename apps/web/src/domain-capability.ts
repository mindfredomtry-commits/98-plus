/**
 * Minimal domain capability projection for Application Policy.
 * Shared contract — domains map local state; Coordinator never reads routes.
 */

export type DomainCapabilityReason = 'SUBMISSION_IN_PROGRESS';

export type DomainCapability =
  | { transition: 'ALLOWED' }
  | {
      transition: 'BLOCKED';
      reason: DomainCapabilityReason;
    };
