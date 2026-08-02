/**
 * Owner Switching Engine — Stage 8 Phase 3.
 *
 * Pure policy. Answers only: should Current Owner change?
 *
 * Input:  currentOwner + currentCapability + OwnerRequest
 * Output: KEEP_CURRENT | SWITCH_OWNER
 *
 * No React, routes, screens, queues, or domain runtimes.
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

/** Binary owner decision — the only engine outputs. */
export type OwnerDecision =
  | { type: 'KEEP_CURRENT' }
  | { type: 'SWITCH_OWNER'; owner: ApplicationOwner };

/**
 * Decision table classification (generic policy classes).
 * INVALID_REQUEST / BLOCKED still yield KEEP_CURRENT as the binary decision.
 */
export type OwnerDecisionClass =
  | 'KEEP_CURRENT'
  | 'SWITCH_OWNER'
  | 'INVALID_REQUEST'
  | 'BLOCKED';

export type OwnerPolicyViolationCode =
  | 'UNREGISTERED_DOMAIN'
  | 'BOOT_OWNER_FORBIDDEN';

export type OwnerPolicyViolation = {
  code: OwnerPolicyViolationCode;
  message: string;
  target: string;
};

export type OwnerSwitchResult = {
  decision: OwnerDecision;
  decisionClass: OwnerDecisionClass;
  violation: OwnerPolicyViolation | null;
};

/** @deprecated Alias — prefer OwnerSwitchResult. */
export type OwnerPolicyResult = OwnerSwitchResult;

export type DecideOwnerSwitchInput = {
  currentOwner: ApplicationOwner;
  /** Capability of the current domain owner; null while BOOT. */
  currentCapability: DomainCapability | null;
  request: OwnerRequest | null;
};

function keep(
  decisionClass: OwnerDecisionClass,
  violation: OwnerPolicyViolation | null = null,
): OwnerSwitchResult {
  return {
    decision: { type: 'KEEP_CURRENT' },
    decisionClass,
    violation,
  };
}

function switchTo(domain: DomainId): OwnerSwitchResult {
  return {
    decision: { type: 'SWITCH_OWNER', owner: domainOwner(domain) },
    decisionClass: 'SWITCH_OWNER',
    violation: null,
  };
}

function bootAllowsFirstOwner(kind: OwnerRequestReason): boolean {
  return kind === 'SYSTEM_READY' || kind === 'ENTRY';
}

/**
 * Pure Owner Switching Engine.
 * Deterministic. One evaluation → at most one owner.
 * Never inspects domain routes, queues, or runtime state.
 */
export function decideOwnerSwitch(
  input: DecideOwnerSwitchInput,
): OwnerSwitchResult {
  const { currentOwner, currentCapability, request } = input;

  if (request == null) {
    return keep('KEEP_CURRENT');
  }

  const requestedOwner = request.target;

  if (!isRegisteredDomainId(requestedOwner)) {
    return keep('INVALID_REQUEST', {
      code: 'UNREGISTERED_DOMAIN',
      message: `Domain "${requestedOwner}" is not registered`,
      target: String(requestedOwner),
    });
  }

  const nextOwner = domainOwner(requestedOwner);
  if (ownersEqual(currentOwner, nextOwner)) {
    return keep('KEEP_CURRENT');
  }

  if (currentOwner.type === 'BOOT') {
    if (!bootAllowsFirstOwner(request.reason)) {
      return keep('INVALID_REQUEST', {
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
    return keep('BLOCKED');
  }

  return switchTo(requestedOwner);
}

/**
 * Backward-compatible adapter used by the Coordinator reducer.
 */
export function decideFromOwnerRequest(input: {
  currentOwner: ApplicationOwner;
  currentCapability: DomainCapability | null;
  request: OwnerRequest | null;
}): OwnerSwitchResult {
  return decideOwnerSwitch(input);
}

/**
 * @deprecated Prefer decideOwnerSwitch. Kept for Stage 8 Phase 1 tests.
 */
export function decideApplicationOwner(input: {
  currentOwner: ApplicationOwner;
  currentCapability: DomainCapability | null;
  requestedOwner: DomainId | null;
  requestKind: OwnerRequestReason | null;
}): OwnerSwitchResult {
  if (input.requestedOwner == null || input.requestKind == null) {
    return decideOwnerSwitch({
      currentOwner: input.currentOwner,
      currentCapability: input.currentCapability,
      request: null,
    });
  }
  return decideOwnerSwitch({
    currentOwner: input.currentOwner,
    currentCapability: input.currentCapability,
    request: {
      target: input.requestedOwner,
      reason: input.requestKind,
    },
  });
}
