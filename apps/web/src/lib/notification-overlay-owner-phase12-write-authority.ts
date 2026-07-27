import type { QueuedOverlay } from '@/lib/overlay-queue';
import { overlayBanId } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';
import type { NotificationOverlayOwnerState } from '@/lib/notification-overlay-owner';

export type Phase12WriteAuthoritySnapshot = {
  queueLen: number;
  pendingLen: number;
  headKind: string | null;
  headBanId: string | null;
};

function headBanIdFromQueueHead(head: QueuedOverlay | null | undefined): string | null {
  if (!head) return null;
  if (head.kind === 'result') return head.result.id;
  if (head.kind === 'incoming' || head.kind === 'check') return head.ban.id;
  return null;
}

export function buildPhase12WriteAuthoritySnapshotFromOwner(
  owner: NotificationOverlayOwnerState,
): Phase12WriteAuthoritySnapshot {
  const head = owner.queue[0] ?? null;
  return {
    queueLen: owner.queue.length,
    pendingLen: owner.pending.length,
    headKind: head?.kind ?? null,
    headBanId: headBanIdFromQueueHead(head),
  };
}

export function buildPhase12WriteAuthoritySnapshotFromLegacy(
  queue: readonly QueuedOverlay[],
  pending: readonly QueuedOverlay[],
): Phase12WriteAuthoritySnapshot {
  const head = queue[0] ?? null;
  return {
    queueLen: queue.length,
    pendingLen: pending.length,
    headKind: head?.kind ?? null,
    headBanId: head ? normalizeId(overlayBanId(head)) || headBanIdFromQueueHead(head) : null,
  };
}

export function phase12WriteAuthoritySnapshotsMismatch(
  ownerAfter: Phase12WriteAuthoritySnapshot,
  legacyAfter: Phase12WriteAuthoritySnapshot,
): boolean {
  return (
    ownerAfter.queueLen !== legacyAfter.queueLen ||
    ownerAfter.pendingLen !== legacyAfter.pendingLen ||
    ownerAfter.headKind !== legacyAfter.headKind ||
    normalizeId(ownerAfter.headBanId ?? '') !== normalizeId(legacyAfter.headBanId ?? '')
  );
}
