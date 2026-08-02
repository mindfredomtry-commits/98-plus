/**
 * Pure Application Policy — Stage 8 Phase 1.
 * Answers ownership and whether an owner switch is allowed.
 * No React, routes, queues, or domain business logic.
 */
import type { DomainCapability } from '@/domain-capability';
import type { OwnerRequest, OwnerRequestReason } from './owner-request';
import {
  domainOwner,
  isRegisteredDomainId,
  ownersEqual,
  type ApplicationOwner,
  type DomainId,
} from './application-owner';

export type OwnerDecision =
  | { type: 'KEEP_CURRENT' }
  | { type: 'SWITCH_OWNER'; owner: ApplicationOwner };

export type OwnerPolicyViolationCode =
  | 'UNREGISTERED_DOMAIN'
  | 'BOOT_OWNER_FORBIDDEN';

export type OwnerPolicyViolation = {
  code: OwnerPolicyViolationCode;
  message: string;
  target: string;
};

export type OwnerPolicyResult =
  | { decision: OwnerDecision; violation: null }
  | { decision: { type: 'KEEP_CURRENT' }; violation: OwnerPolicyViolation };

export type DecideApplicationOwnerInput = {
  currentOwner: ApplicationOwner;
  /** Capability of the current domain owner; null while BOOT. */
  currentCapability: DomainCapability | null;
  requestedOwner: DomainId | null;
  requestKind: OwnerRequestReason | null;
};

function keep(
  violation: OwnerPolicyViolation | null = null,
): OwnerPolicyResult {
  if (violation) {
    return { decision: { type: 'KEEP_CURRENT' }, violation };
  }
  return { decision: { type: 'KEEP_CURRENT' }, violation: null };
}

function switchTo(domain: DomainId): OwnerPolicyResult {
  return {
    decision: { type: 'SWITCH_OWNER', owner: domainOwner(domain) },
    violation: null,
  };
}

function bootAllowsFirstOwner(kind: OwnerRequestReason | null): boolean {
  return kind === 'SYSTEM_READY' || kind === 'ENTRY';
}

/**
 * Pure, deterministic owner decision. One evaluation → at most one owner.
 */
export function decideApplicationOwner(
  input: DecideApplicationOwnerInput,
): OwnerPolicyResult {
  const { currentOwner, currentCapability, requestedOwner, requestKind } =
    input;

  if (requestedOwner == null) {
    return keep();
  }

  if (!isRegisteredDomainId(requestedOwner)) {
    return keep({
      code: 'UNREGISTERED_DOMAIN',
      message: `Domain "${requestedOwner}" is not registered`,
      target: requestedOwner,
    });
  }

  const nextOwner = domainOwner(requestedOwner);
  if (ownersEqual(currentOwner, nextOwner)) {
    return keep();
  }

  if (currentOwner.type === 'BOOT') {
    if (!bootAllowsFirstOwner(requestKind)) {
      return keep({
        code: 'BOOT_OWNER_FORBIDDEN',
        message:
          'During BOOT only SYSTEM_READY or ENTRY may select the first domain',
        target: requestedOwner,
      });
    }
    return switchTo(requestedOwner);
  }

  if (
    currentCapability == null ||
    currentCapability.transition === 'BLOCKED'
  ) {
    return keep();
  }

  return switchTo(requestedOwner);
}

export function decideFromOwnerRequest(input: {
  currentOwner: ApplicationOwner;
  currentCapability: DomainCapability | null;
  request: OwnerRequest | null;
}): OwnerPolicyResult {
  if (!input.request) {
    return decideApplicationOwner({
      currentOwner: input.currentOwner,
      currentCapability: input.currentCapability,
      requestedOwner: null,
      requestKind: null,
    });
  }
  return decideApplicationOwner({
    currentOwner: input.currentOwner,
    currentCapability: input.currentCapability,
    requestedOwner: input.request.target,
    requestKind: input.request.reason,
  });
}
