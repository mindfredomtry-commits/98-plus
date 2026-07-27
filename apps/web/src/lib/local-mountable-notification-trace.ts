import type { BanInteraction, BanResult } from '@98plus/shared';
import type { NotificationOverlayOwnerState } from '@/notification-owner/notification-owner-pin-state';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import { overlayQueueKey } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';

export type LocalMountableNotificationTracePayload = {
  source: string;
  telegramUserId?: string | null;
  queueLen?: number;
  pendingLen?: number;
  ownerQueueLen?: number;
  ownerPendingLen?: number;
  queueHeadKind?: string | null;
  queueHeadBanId?: string | null;
  queueHeadResultId?: string | null;
  activeKind?: string | null;
  activeBanId?: string | null;
  displayKind?: string | null;
  displayBanId?: string | null;
  candidateSource?: string | null;
  candidateKind?: string | null;
  candidateBanId?: string | null;
  candidateResultId?: string | null;
  candidateKey?: string | null;
  candidateStatus?: string | null;
  candidateOutcome?: string | null;
  candidateHandledAt?: string | null;
  candidateFresh?: boolean | null;
  candidateDelivered?: boolean | null;
  candidateShown?: boolean | null;
  candidateDismissed?: boolean | null;
  candidateRejectedReason?: string | null;
  selectedKind?: string | null;
  selectedBanId?: string | null;
  selectedResultId?: string | null;
  selectedKey?: string | null;
  returnReason?: string | null;
};

export function logLocalMountableNotificationTrace(
  payload: LocalMountableNotificationTracePayload,
): void {
  console.log('LOCAL_MOUNTABLE_NOTIFICATION_TRACE', payload);
}

type OverlayItemFields = {
  candidateKind: string | null;
  candidateBanId: string | null;
  candidateResultId: string | null;
  candidateKey: string | null;
  candidateStatus: string | null;
  candidateOutcome: string | null;
  candidateHandledAt: string | null;
};

function readOverlayItemFields(item: QueuedOverlay): OverlayItemFields {
  if (item.kind === 'result') {
    return {
      candidateKind: item.kind,
      candidateBanId: item.result.id,
      candidateResultId: item.result.id,
      candidateKey: overlayQueueKey(item),
      candidateStatus: item.result.status ?? null,
      candidateOutcome: item.result.outcome ?? null,
      candidateHandledAt: item.result.completedAt ?? null,
    };
  }
  return {
    candidateKind: item.kind,
    candidateBanId: item.ban.id,
    candidateResultId: null,
    candidateKey: overlayQueueKey(item),
    candidateStatus: item.ban.status ?? null,
    candidateOutcome: null,
    candidateHandledAt: item.ban.checkDueAt ?? item.ban.createdAt ?? null,
  };
}

function readDisplayBanFields(
  kind: 'incoming' | 'check',
  ban: BanInteraction,
): OverlayItemFields {
  return {
    candidateKind: kind,
    candidateBanId: ban.id,
    candidateResultId: null,
    candidateKey: `${kind}:${normalizeId(ban.id)}`,
    candidateStatus: ban.status ?? null,
    candidateOutcome: null,
    candidateHandledAt: ban.checkDueAt ?? ban.createdAt ?? null,
  };
}

function readDisplayResultFields(result: BanResult): OverlayItemFields {
  return {
    candidateKind: 'result',
    candidateBanId: result.id,
    candidateResultId: result.id,
    candidateKey: `result:${normalizeId(result.id)}`,
    candidateStatus: result.status ?? null,
    candidateOutcome: result.outcome ?? null,
    candidateHandledAt: result.completedAt ?? null,
  };
}

export type LocalMountableNotificationTraceInput = {
  source: string;
  telegramUserId?: string | null;
  owner: NotificationOverlayOwnerState;
  legacyQueue: readonly QueuedOverlay[];
  legacyPending: readonly QueuedOverlay[];
  displayIncomingBan: BanInteraction | null;
  displayCheckBan: BanInteraction | null;
  displayResult: BanResult | null;
  displayKind: string | null;
  hasPendingChain: boolean;
  canDrain: boolean;
  legacyWouldDrain: boolean;
  returnReason?: string | null;
  resolveOverlayRejectReason?: (
    item: QueuedOverlay,
    candidateSource: string,
    inOwnerAuthority: boolean,
  ) => {
    candidateFresh?: boolean | null;
    candidateDelivered?: boolean | null;
    candidateShown?: boolean | null;
    candidateDismissed?: boolean | null;
    candidateRejectedReason: string | null;
  };
  resolveDisplayRejectReason?: (
    kind: 'incoming' | 'check' | 'result',
    banId: string,
    candidateSource: string,
    inOwnerAuthority: boolean,
  ) => {
    candidateFresh?: boolean | null;
    candidateDelivered?: boolean | null;
    candidateShown?: boolean | null;
    candidateDismissed?: boolean | null;
    candidateRejectedReason: string | null;
  };
};

function buildSummaryFields(
  input: LocalMountableNotificationTraceInput,
): Omit<
  LocalMountableNotificationTracePayload,
  'source' | 'candidateSource' | 'returnReason'
> {
  const ownerHead = input.owner.queue[0] ?? input.owner.pending[0] ?? null;
  const legacyHead =
    input.legacyQueue[0] ?? input.legacyPending[0] ?? null;
  const head = ownerHead ?? legacyHead;
  return {
    telegramUserId: input.telegramUserId ?? null,
    queueLen: input.legacyQueue.length,
    pendingLen: input.legacyPending.length,
    ownerQueueLen: input.owner.queue.length,
    ownerPendingLen: input.owner.pending.length,
    queueHeadKind: head?.kind ?? null,
    queueHeadBanId:
      head?.kind === 'incoming' || head?.kind === 'check'
        ? head.ban.id
        : null,
    queueHeadResultId: head?.kind === 'result' ? head.result.id : null,
    activeKind: input.owner.active.kind,
    activeBanId:
      input.displayIncomingBan?.id ??
      input.displayCheckBan?.id ??
      input.displayResult?.id ??
      null,
    displayKind: input.displayKind,
    displayBanId:
      input.displayIncomingBan?.id ??
      input.displayCheckBan?.id ??
      input.displayResult?.id ??
      null,
  };
}

function ownerAuthorityKeys(owner: NotificationOverlayOwnerState): Set<string> {
  return new Set(
    [...owner.queue, ...owner.pending].map((item) => overlayQueueKey(item)),
  );
}

export function runLocalMountableNotificationTrace(
  input: LocalMountableNotificationTraceInput,
): void {
  const summary = buildSummaryFields(input);
  const ownerKeys = ownerAuthorityKeys(input.owner);
  const selectedHead =
    input.owner.queue[0] ?? input.owner.pending[0] ?? null;
  const selectedFields = selectedHead
    ? readOverlayItemFields(selectedHead)
    : null;

  logLocalMountableNotificationTrace({
    source: `${input.source}:before-search`,
    ...summary,
    returnReason: input.returnReason ?? null,
    selectedKind: selectedFields?.candidateKind ?? null,
    selectedBanId: selectedFields?.candidateBanId ?? null,
    selectedResultId: selectedFields?.candidateResultId ?? null,
    selectedKey: selectedFields?.candidateKey ?? null,
    candidateRejectedReason: input.canDrain
      ? null
      : input.legacyWouldDrain
        ? 'owner-queue-empty-but-legacy-would-drain'
        : 'owner-queue-empty-and-legacy-empty',
  });

  const logCandidate = (
    candidateSource: string,
    fields: OverlayItemFields,
    extras: {
      candidateFresh?: boolean | null;
      candidateDelivered?: boolean | null;
      candidateShown?: boolean | null;
      candidateDismissed?: boolean | null;
      candidateRejectedReason: string | null;
    },
  ) => {
    logLocalMountableNotificationTrace({
      source: `${input.source}:candidate`,
      ...summary,
      candidateSource,
      ...fields,
      ...extras,
      selectedKind: selectedFields?.candidateKind ?? null,
      selectedBanId: selectedFields?.candidateBanId ?? null,
      selectedResultId: selectedFields?.candidateResultId ?? null,
      selectedKey: selectedFields?.candidateKey ?? null,
      returnReason: input.returnReason ?? null,
    });
  };

  const inspectQueued = (
    item: QueuedOverlay,
    candidateSource: string,
    mountableIfInOwner: boolean,
  ) => {
    const fields = readOverlayItemFields(item);
    const inOwnerAuthority = ownerKeys.has(fields.candidateKey ?? '');
    const reject = input.resolveOverlayRejectReason?.(
      item,
      candidateSource,
      inOwnerAuthority,
    );
    const defaultReject = mountableIfInOwner
      ? inOwnerAuthority
        ? null
        : 'not-in-owner-queue-or-pending'
      : inOwnerAuthority
        ? null
        : 'legacy-ref-not-in-owner-authority';
    logCandidate(candidateSource, fields, {
      candidateFresh: reject?.candidateFresh ?? null,
      candidateDelivered: reject?.candidateDelivered ?? null,
      candidateShown: reject?.candidateShown ?? null,
      candidateDismissed: reject?.candidateDismissed ?? null,
      candidateRejectedReason:
        reject?.candidateRejectedReason ?? defaultReject,
    });
  };

  input.owner.queue.forEach((item, index) => {
    inspectQueued(item, `owner-queue[${index}]`, true);
  });
  input.owner.pending.forEach((item, index) => {
    inspectQueued(item, `owner-pending[${index}]`, true);
  });
  input.legacyQueue.forEach((item, index) => {
    inspectQueued(item, `legacy-overlayQueue[${index}]`, false);
  });
  input.legacyPending.forEach((item, index) => {
    inspectQueued(item, `legacy-pendingStartup[${index}]`, false);
  });

  if (input.displayIncomingBan?.id) {
    const fields = readDisplayBanFields('incoming', input.displayIncomingBan);
    const inOwnerAuthority = ownerKeys.has(fields.candidateKey ?? '');
    const reject = input.resolveDisplayRejectReason?.(
      'incoming',
      input.displayIncomingBan.id,
      'display-incomingBanRef',
      inOwnerAuthority,
    );
    logCandidate('display-incomingBanRef', fields, {
      candidateFresh: reject?.candidateFresh ?? null,
      candidateDelivered: reject?.candidateDelivered ?? null,
      candidateShown: reject?.candidateShown ?? null,
      candidateDismissed: reject?.candidateDismissed ?? null,
      candidateRejectedReason:
        reject?.candidateRejectedReason ??
        (inOwnerAuthority
          ? null
          : 'display-ref-only-not-in-owner-queue-or-pending'),
    });
  }

  if (input.displayCheckBan?.id) {
    const fields = readDisplayBanFields('check', input.displayCheckBan);
    const inOwnerAuthority = ownerKeys.has(fields.candidateKey ?? '');
    const reject = input.resolveDisplayRejectReason?.(
      'check',
      input.displayCheckBan.id,
      'display-checkBanRef',
      inOwnerAuthority,
    );
    logCandidate('display-checkBanRef', fields, {
      candidateFresh: reject?.candidateFresh ?? null,
      candidateDelivered: reject?.candidateDelivered ?? null,
      candidateShown: reject?.candidateShown ?? null,
      candidateDismissed: reject?.candidateDismissed ?? null,
      candidateRejectedReason:
        reject?.candidateRejectedReason ??
        (inOwnerAuthority
          ? null
          : 'display-ref-only-not-in-owner-queue-or-pending'),
    });
  }

  if (input.displayResult?.id) {
    const fields = readDisplayResultFields(input.displayResult);
    const inOwnerAuthority = ownerKeys.has(fields.candidateKey ?? '');
    const reject = input.resolveDisplayRejectReason?.(
      'result',
      input.displayResult.id,
      'display-resultRef',
      inOwnerAuthority,
    );
    logCandidate('display-resultRef', fields, {
      candidateFresh: reject?.candidateFresh ?? null,
      candidateDelivered: reject?.candidateDelivered ?? null,
      candidateShown: reject?.candidateShown ?? null,
      candidateDismissed: reject?.candidateDismissed ?? null,
      candidateRejectedReason:
        reject?.candidateRejectedReason ??
        (inOwnerAuthority
          ? null
          : 'display-ref-only-not-in-owner-queue-or-pending'),
    });
  }

  if (input.hasPendingChain) {
    logLocalMountableNotificationTrace({
      source: `${input.source}:candidate`,
      ...summary,
      candidateSource: 'hasPendingNotificationChain-flag',
      candidateKind: null,
      candidateBanId: null,
      candidateResultId: null,
      candidateKey: null,
      candidateStatus: null,
      candidateOutcome: null,
      candidateHandledAt: null,
      candidateFresh: null,
      candidateDelivered: null,
      candidateShown: null,
      candidateDismissed: null,
      candidateRejectedReason: input.canDrain
        ? 'pending-chain-flag-but-owner-already-has-queue'
        : 'pending-chain-flag-does-not-populate-owner-queue',
      selectedKind: selectedFields?.candidateKind ?? null,
      selectedBanId: selectedFields?.candidateBanId ?? null,
      selectedResultId: selectedFields?.candidateResultId ?? null,
      selectedKey: selectedFields?.candidateKey ?? null,
      returnReason: input.returnReason ?? null,
    });
  }

  logLocalMountableNotificationTrace({
    source: `${input.source}:result`,
    ...summary,
    selectedKind: selectedFields?.candidateKind ?? null,
    selectedBanId: selectedFields?.candidateBanId ?? null,
    selectedResultId: selectedFields?.candidateResultId ?? null,
    selectedKey: selectedFields?.candidateKey ?? null,
    candidateRejectedReason: input.canDrain
      ? null
      : input.legacyWouldDrain
        ? 'no-owner-mountable-head-selected'
        : 'no-candidates-anywhere',
    returnReason:
      input.returnReason ??
      (input.canDrain
        ? 'owner-queue-or-pending-nonempty'
        : 'no-local-mountable-notification'),
  });
}
