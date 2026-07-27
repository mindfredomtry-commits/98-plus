/**
 * Notification Owner — Phase 2 pure contract.
 *
 * Future single authority for queue, active display, presentation, terminal
 * action, consumed tombstones, next-card selection, and Lobby release.
 *
 * Not wired to JSX / Providers / InstantBanFlow in Phase 2.
 * Unrepresentable by construction: empty shell, orb-only Lobby,
 * SUCCESS+INCOMING coexistence, display=null→Lobby, host-without-card.
 */

export type BanId = string;
export type DisplayId = string;

/** Minimal card models — render-complete payloads (no host timing). */
export type IncomingCardModel = {
  banId: BanId;
  text: string;
  senderLabel: string;
};

export type CheckCardModel = {
  banId: BanId;
  text: string;
  senderLabel: string;
};

export type ResultCardModel = {
  banId: BanId;
  title: string;
  body: string;
  outcome: string | null;
};

export type ComposeDraft = {
  selectedUserId: string | null;
  banText: string;
  durationMinutes: number;
  replyToBanId: BanId | null;
};

export type SendSnapshot = {
  selectedUserId: string;
  banText: string;
  durationMinutes: number;
  replyToBanId: BanId | null;
};

export type SuccessSnapshot = SendSnapshot;

export type QueuedIncoming = {
  kind: 'incoming';
  displayId: DisplayId;
  banId: BanId;
  card: IncomingCardModel;
};

export type QueuedCheck = {
  kind: 'check';
  displayId: DisplayId;
  banId: BanId;
  card: CheckCardModel;
};

export type QueuedResult = {
  kind: 'result';
  displayId: DisplayId;
  banId: BanId;
  card: ResultCardModel;
};

export type QueueItem = QueuedIncoming | QueuedCheck | QueuedResult;

/**
 * Exactly one authoritative presentation surface.
 * Every variant is render-complete — no pseudo-surfaces.
 */
export type NotificationPresentationState =
  | { kind: 'BOOT'; surface: 'deliberate-boot' }
  | { kind: 'LOBBY'; mode: 'full' }
  | { kind: 'WHAT'; draft: ComposeDraft }
  | { kind: 'CONFIRM'; draft: ComposeDraft }
  | { kind: 'SENDING'; snapshot: SendSnapshot }
  | { kind: 'SUCCESS'; snapshot: SuccessSnapshot }
  | {
      kind: 'INCOMING';
      displayId: DisplayId;
      banId: BanId;
      card: IncomingCardModel;
    }
  | {
      kind: 'CHECK';
      displayId: DisplayId;
      banId: BanId;
      card: CheckCardModel;
    }
  | {
      kind: 'ACTION_PENDING';
      displayId: DisplayId;
      banId: BanId;
      from: 'INCOMING' | 'CHECK';
      card: IncomingCardModel | CheckCardModel;
      action: 'overboard' | 'counter' | 'check-answer';
    }
  | {
      kind: 'RESULT';
      displayId: DisplayId;
      banId: BanId;
      card: ResultCardModel;
    };

export type ConsumedTombstone = {
  banId: BanId;
  displayId: DisplayId;
  /** Removed only after server confirms item is no longer pending. */
  awaitingServerClear: boolean;
};

export type ActionLedgerEntry = {
  displayId: DisplayId;
  banId: BanId;
  status: 'requested' | 'confirmed';
};

/**
 * Single owner state — queue + presentation + action + tombstones.
 * One writer for each concern lives here alone.
 */
export type NotificationOwnerState = {
  presentation: NotificationPresentationState;
  /** Ordered future items; never includes consumed banIds. */
  queue: QueueItem[];
  consumed: ConsumedTombstone[];
  /** At most one in-flight terminal action. */
  action: ActionLedgerEntry | null;
  /** displayIds that have been terminally committed (idempotency). */
  terminalCommits: DisplayId[];
};

/** UI intents — components emit these; they never mutate owner state directly. */
export type NotificationOwnerCommand =
  | { type: 'BOOT_COMPLETE'; next: QueueItem | null }
  | { type: 'OPEN_WHAT'; draft?: Partial<ComposeDraft> }
  | { type: 'EDIT_DRAFT'; draft: Partial<ComposeDraft> }
  | { type: 'OPEN_CONFIRM' }
  | { type: 'SUBMIT_SEND' }
  | { type: 'SEND_SUCCEEDED'; snapshot?: SendSnapshot }
  | { type: 'SEND_FAILED' }
  | { type: 'CLOSE_SUCCESS' }
  | {
      type: 'REQUEST_CARD_ACTION';
      action: 'overboard' | 'counter' | 'check-answer';
    }
  | { type: 'DISMISS_CARD' }
  | { type: 'CLOSE_RESULT' };

/** Owner-internal / network events. */
export type NotificationOwnerEvent =
  | { type: 'ITEMS_INGESTED'; items: QueueItem[] }
  | {
      type: 'ACTION_CONFIRMED';
      displayId: DisplayId;
      banId: BanId;
      /** When set, becomes the next RESULT surface after consume. */
      result?: ResultCardModel;
      /** When true and no result, advance to next queue item or LOBBY. */
      consumeOnly?: boolean;
    }
  | {
      type: 'ACTION_FAILED';
      displayId: DisplayId;
      banId: BanId;
    }
  | {
      type: 'SERVER_PENDING_CLEARED';
      banId: BanId;
    };

export type NotificationOwnerInput =
  | NotificationOwnerCommand
  | NotificationOwnerEvent;

export type NotificationOwnerReduceResult = {
  state: NotificationOwnerState;
  /** Rejected transitions leave state unchanged and set reason. */
  rejected: string | null;
};

export function emptyComposeDraft(
  overrides: Partial<ComposeDraft> = {},
): ComposeDraft {
  return {
    selectedUserId: null,
    banText: '',
    durationMinutes: 30,
    replyToBanId: null,
    ...overrides,
  };
}

export function createInitialNotificationOwnerState(): NotificationOwnerState {
  return {
    presentation: { kind: 'BOOT', surface: 'deliberate-boot' },
    queue: [],
    consumed: [],
    action: null,
    terminalCommits: [],
  };
}

export function displayIdOfPresentation(
  p: NotificationPresentationState,
): DisplayId | null {
  switch (p.kind) {
    case 'INCOMING':
    case 'CHECK':
    case 'ACTION_PENDING':
    case 'RESULT':
      return p.displayId;
    default:
      return null;
  }
}

export function banIdOfPresentation(
  p: NotificationPresentationState,
): BanId | null {
  switch (p.kind) {
    case 'INCOMING':
    case 'CHECK':
    case 'ACTION_PENDING':
    case 'RESULT':
      return p.banId;
    default:
      return null;
  }
}

export function isConsumedBan(
  state: NotificationOwnerState,
  banId: BanId,
): boolean {
  return state.consumed.some((t) => t.banId === banId);
}

export function filterUnconsumedQueue(
  items: QueueItem[],
  consumed: ConsumedTombstone[],
): QueueItem[] {
  const banned = new Set(consumed.map((t) => t.banId));
  const seen = new Set<string>();
  const out: QueueItem[] = [];
  for (const item of items) {
    if (banned.has(item.banId)) continue;
    if (seen.has(item.displayId)) continue;
    seen.add(item.displayId);
    out.push(item);
  }
  return out;
}
