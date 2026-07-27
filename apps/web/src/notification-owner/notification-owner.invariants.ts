/**
 * Notification Owner — hard invariants.
 * Violations mean the reducer produced an illegal state.
 */

import type {
  NotificationOwnerState,
  NotificationPresentationState,
} from './notification-owner.types';
import { displayIdOfPresentation } from './notification-owner.types';

export type InvariantViolation = {
  code: string;
  message: string;
};

export function assertNotificationOwnerInvariants(
  state: NotificationOwnerState,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const p = state.presentation;

  // 1. Exactly one presentation state (structural).
  if (!p || typeof p.kind !== 'string') {
    violations.push({
      code: 'presentation-missing',
      message: 'presentation state missing',
    });
    return violations;
  }

  // 3/5. No empty shell / no SUCCESS+INCOMING — union forbids both.
  // 4. Lobby is always full.
  if (p.kind === 'LOBBY' && p.mode !== 'full') {
    violations.push({
      code: 'lobby-not-full',
      message: 'LOBBY must be mode full',
    });
  }

  // BOOT is deliberate complete surface.
  if (p.kind === 'BOOT' && p.surface !== 'deliberate-boot') {
    violations.push({
      code: 'boot-incomplete',
      message: 'BOOT must be deliberate-boot',
    });
  }

  // Card surfaces must carry complete ids + card payload.
  if (
    p.kind === 'INCOMING' ||
    p.kind === 'CHECK' ||
    p.kind === 'ACTION_PENDING' ||
    p.kind === 'RESULT'
  ) {
    if (!p.displayId || !p.banId || !p.card) {
      violations.push({
        code: 'card-incomplete',
        message: `${p.kind} missing displayId/banId/card`,
      });
    }
  }

  // 6. displayId active at most once — not also sitting in queue.
  const activeDisplayId = displayIdOfPresentation(p);
  if (activeDisplayId) {
    const dupInQueue = state.queue.some((q) => q.displayId === activeDisplayId);
    if (dupInQueue) {
      violations.push({
        code: 'display-also-in-queue',
        message: `active displayId ${activeDisplayId} also in queue`,
      });
    }
  }

  // Queue must not contain consumed bans.
  for (const item of state.queue) {
    if (state.consumed.some((t) => t.banId === item.banId)) {
      violations.push({
        code: 'consumed-in-queue',
        message: `consumed banId ${item.banId} still in queue`,
      });
    }
  }

  // Queue displayIds unique.
  const seen = new Set<string>();
  for (const item of state.queue) {
    if (seen.has(item.displayId)) {
      violations.push({
        code: 'duplicate-queue-display',
        message: `duplicate queue displayId ${item.displayId}`,
      });
    }
    seen.add(item.displayId);
  }

  // 7. Terminal action ledger consistency.
  if (state.action) {
    if (
      p.kind !== 'ACTION_PENDING' ||
      p.displayId !== state.action.displayId ||
      p.banId !== state.action.banId
    ) {
      violations.push({
        code: 'action-presentation-mismatch',
        message: 'action ledger does not match ACTION_PENDING presentation',
      });
    }
  } else if (p.kind === 'ACTION_PENDING') {
    violations.push({
      code: 'action-pending-without-ledger',
      message: 'ACTION_PENDING without action ledger',
    });
  }

  // Terminal commits unique.
  const termSeen = new Set<string>();
  for (const id of state.terminalCommits) {
    if (termSeen.has(id)) {
      violations.push({
        code: 'duplicate-terminal-commit',
        message: `displayId ${id} committed twice`,
      });
    }
    termSeen.add(id);
  }

  // Consumed tombstones unique by banId.
  const banSeen = new Set<string>();
  for (const t of state.consumed) {
    if (banSeen.has(t.banId)) {
      violations.push({
        code: 'duplicate-tombstone',
        message: `duplicate consumed banId ${t.banId}`,
      });
    }
    banSeen.add(t.banId);
  }

  return violations;
}

export function presentationKind(
  state: NotificationOwnerState,
): NotificationPresentationState['kind'] {
  return state.presentation.kind;
}

/** Painted sequence helper — one kind per transition (no pseudo frames). */
export function paintedKind(
  state: NotificationOwnerState,
): NotificationPresentationState['kind'] {
  return state.presentation.kind;
}
