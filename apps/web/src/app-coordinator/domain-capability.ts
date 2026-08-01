/**
 * Minimal domain capability projection for Application Policy.
 * Domains map local state → this shape; Coordinator never reads routes.
 */

export type DomainCapabilityReason = 'SUBMISSION_IN_PROGRESS';

export type DomainCapability =
  | { transition: 'ALLOWED' }
  | {
      transition: 'BLOCKED';
      reason: DomainCapabilityReason;
    };
