/**
 * Stage 1 — read-only ObservedPresentationState.
 *
 * Telemetry / parity only. Does not decide what renders, does not dispatch
 * lifecycle commands, does not clear/replace displays, does not become a writer.
 *
 * Mapping (visible → owner → source → render predicate):
 *
 * | Visible              | Owner            | Source                                      | Render predicate                                      |
 * |----------------------|------------------|---------------------------------------------|-------------------------------------------------------|
 * | BOOT_LOBBY           | InstantBanFlow   | lobbyBootIntroPrimed, holdLobbyOrbForBootstrap, showBootOrb | LobbyBootOrbWrap when showBootOrb                     |
 * | LOBBY (empty/full)   | InstantBanFlow   | phase idle, showLobbyOrb, showLobbyChrome   | LobbyOrbWrap / chrome / CTA when primed + idle        |
 * | WHO                  | InstantBanFlow   | phase === 'selectingTarget'                 | WhoScreen / cross-screen pager                        |
 * | WHAT                 | InstantBanFlow   | phase === 'composingBan'                    | WhatScreen (data-instant-ban-view=WhatScreen)         |
 * | CONFIRM              | InstantBanFlow   | confirmActive (confirming + user + !success)| ConfirmScreen / confirm layer                         |
 * | SENDING              | InstantBanFlow   | confirming + inFlight\|sharing\|replySending| confirm “sending…” (still confirm layer)              |
 * | SUCCESS              | InstantBanFlow   | banSentSuccess + sendSnapshotRef            | SuccessScreen (data-instant-ban-view=SuccessOverlay)  |
 * | INCOMING/CHECK/RESULT| Runtime+Providers| activeOverlayKind + overlay mount/visible   | NotificationQueueShell → overlay children             |
 * | Direct overboard     | Providers        | showDirectOverboardLayer + result           | DirectOverboardResultLayer [data-direct-overboard-result] |
 * | Overlay host         | Providers        | GlobalOverlayHost active / shell mount      | portal beside children (unchanged Stage 1)            |
 * | Orb / logo / chrome  | InstantBanFlow   | showBootOrb/showLobbyOrb, persistentLogoVisible, showLobbyChrome | Lobby wraps / logo slot / chrome |
 *
 * InstantBanFlow continuous mount: Stage 1 never adds an exclusive root
 * presentation switch or remounts InstantBanFlow — observer is effect-only.
 *
 * SUCCESS snapshot: mirrored as a shallow copy of sendSnapshotRef fields while
 * ownership stays local to InstantBanFlow (not moved into runtime).
 *
 * Portal/host result: observed from existing AppContext mirrors InstantBanFlow
 * already reads (showDirectOverboardLayer, result, overlay mount flags).
 *
 * DOM parity: each mode carries domHints matching production attributes; tests
 * assert observe(mode) ↔ hint ↔ source still contains the paint branch.
 */

export type ObservedSendFlowPhase =
  | 'idle'
  | 'selectingTarget'
  | 'composingBan'
  | 'confirming';

export type ObservedRuntimeDisplayKind = 'incoming' | 'check' | 'result';

export type ObservedSuccessSnapshot = {
  selectedUserId: string | null;
  banText: string;
  durationMinutes: number;
  replyToBanId: string | null;
};

export type ObservedDisplayRef = {
  kind: ObservedRuntimeDisplayKind;
  id: string | null;
  /** 'queue' = NotificationQueueShell path; 'direct' = DirectOverboardResultLayer */
  surface: 'queue' | 'direct';
};

export type ObservedPresentationChrome = {
  orbVisible: boolean;
  bootOrbVisible: boolean;
  lobbyOrbVisible: boolean;
  logoVisible: boolean;
  chromeVisible: boolean;
  overlayHostActive: boolean;
  directOverboardHostActive: boolean;
  /** InstantBanFlow confirm layer (`confirmActive`) — observation only. */
  confirmLayerVisible: boolean;
  /** Confirm hold orb: confirm layer + lobby orb wrap both painting. */
  confirmOrbVisible: boolean;
};

export type ObservedPresentationMode =
  | 'BOOT_LOBBY'
  | 'LOBBY'
  | 'WHO'
  | 'WHAT'
  | 'CONFIRM'
  | 'SENDING'
  | 'SUCCESS'
  | 'INCOMING'
  | 'CHECK'
  | 'RESULT';

export type ObservedPresentationState =
  | {
      mode: 'BOOT_LOBBY';
      chrome: ObservedPresentationChrome;
      domHints: readonly string[];
    }
  | {
      mode: 'LOBBY';
      empty: boolean;
      chrome: ObservedPresentationChrome;
      domHints: readonly string[];
    }
  | {
      mode: 'WHO';
      chrome: ObservedPresentationChrome;
      domHints: readonly string[];
    }
  | {
      mode: 'WHAT';
      chrome: ObservedPresentationChrome;
      domHints: readonly string[];
    }
  | {
      mode: 'CONFIRM';
      chrome: ObservedPresentationChrome;
      domHints: readonly string[];
    }
  | {
      mode: 'SENDING';
      chrome: ObservedPresentationChrome;
      domHints: readonly string[];
    }
  | {
      mode: 'SUCCESS';
      snapshot: ObservedSuccessSnapshot;
      chrome: ObservedPresentationChrome;
      domHints: readonly string[];
    }
  | {
      mode: 'INCOMING';
      display: ObservedDisplayRef;
      chrome: ObservedPresentationChrome;
      domHints: readonly string[];
    }
  | {
      mode: 'CHECK';
      display: ObservedDisplayRef;
      chrome: ObservedPresentationChrome;
      domHints: readonly string[];
    }
  | {
      mode: 'RESULT';
      display: ObservedDisplayRef;
      chrome: ObservedPresentationChrome;
      domHints: readonly string[];
    };

/** Stable DOM selectors that production paint already uses (read-only parity). */
export const OBSERVED_PRESENTATION_DOM_HINTS = {
  BOOT_LOBBY: ['[data-boot-scene]', '[data-instant-ban-view="InstantBanFlow"]'],
  LOBBY: ['[data-base-lobby-orb]', '[data-instant-ban-view="InstantBanFlow"]'],
  LOBBY_EMPTY: ['[data-instant-ban-view="InstantBanFlow"]'],
  WHO: ['[data-instant-ban-view="InstantBanFlow"]', '[data-send-phase="selectingTarget"]'],
  WHAT: ['[data-instant-ban-view="WhatScreen"]'],
  CONFIRM: ['[data-instant-ban-view="ConfirmScreen"]'],
  SENDING: ['[data-instant-ban-view="ConfirmScreen"]', '[data-send-phase="confirming"]'],
  SUCCESS: ['[data-instant-ban-view="SuccessOverlay"]'],
  INCOMING: ['[data-notification-layer]'],
  CHECK: ['[data-notification-layer]', '[data-overlay-user-card]'],
  RESULT_QUEUE: ['[data-result-branch]', '[data-notification-layer]'],
  RESULT_DIRECT: ['[data-direct-overboard-result]'],
} as const;

export type ObservedPresentationInput = {
  phase: ObservedSendFlowPhase;
  banSentSuccess: boolean;
  successSnapshot: ObservedSuccessSnapshot | null;
  inFlight: boolean;
  sharing: boolean;
  replySending: boolean;
  confirmActive: boolean;
  lobbyBootIntroPrimed: boolean;
  holdLobbyOrbForBootstrap: boolean;
  showBootOrb: boolean;
  showLobbyOrb: boolean;
  persistentLogoVisible: boolean;
  showLobbyChrome: boolean;
  /** Runtime / host mirrors InstantBanFlow already reads from AppContext. */
  activeOverlayKind: ObservedRuntimeDisplayKind | null;
  overlayHostActive: boolean;
  notificationOverlayVisible: boolean;
  showDirectOverboardLayer: boolean;
  directOverboardResultId: string | null;
  queueResultId: string | null;
  /**
   * Runtime/host display id for the active overlay kind (incoming/check/result).
   * Copied from runtime display payload or Providers result — observation only.
   */
  overlayDisplayId: string | null;
};

function buildChrome(input: ObservedPresentationInput): ObservedPresentationChrome {
  return {
    orbVisible: input.showBootOrb || input.showLobbyOrb,
    bootOrbVisible: input.showBootOrb,
    lobbyOrbVisible: input.showLobbyOrb,
    logoVisible: input.persistentLogoVisible,
    chromeVisible: input.showLobbyChrome,
    overlayHostActive: input.overlayHostActive,
    directOverboardHostActive: input.showDirectOverboardLayer,
    confirmLayerVisible: input.confirmActive,
    confirmOrbVisible: input.confirmActive && input.showLobbyOrb,
  };
}

/**
 * Pure observation: records which product surface the current owners are
 * painting. Priority follows portal stacking then InstantBanFlow local layers.
 * Never mutates input or external stores.
 */
export function observePresentationState(
  input: ObservedPresentationInput,
): ObservedPresentationState {
  const chrome = buildChrome(input);
  const sending = input.inFlight || input.sharing || input.replySending;
  const overlayPainted =
    input.overlayHostActive || input.notificationOverlayVisible;

  // Local SUCCESS remains InstantBanFlow-owned; observe before queue overlays
  // so SUCCESS+blocked-result frames still report SUCCESS (matches paint intent).
  if (input.banSentSuccess && input.successSnapshot) {
    return {
      mode: 'SUCCESS',
      snapshot: { ...input.successSnapshot },
      chrome,
      domHints: OBSERVED_PRESENTATION_DOM_HINTS.SUCCESS,
    };
  }

  if (input.showDirectOverboardLayer && input.directOverboardResultId) {
    return {
      mode: 'RESULT',
      display: {
        kind: 'result',
        id: input.directOverboardResultId,
        surface: 'direct',
      },
      chrome,
      domHints: OBSERVED_PRESENTATION_DOM_HINTS.RESULT_DIRECT,
    };
  }

  if (overlayPainted && input.activeOverlayKind === 'incoming') {
    return {
      mode: 'INCOMING',
      display: {
        kind: 'incoming',
        id: input.overlayDisplayId,
        surface: 'queue',
      },
      chrome,
      domHints: OBSERVED_PRESENTATION_DOM_HINTS.INCOMING,
    };
  }

  if (overlayPainted && input.activeOverlayKind === 'check') {
    return {
      mode: 'CHECK',
      display: {
        kind: 'check',
        id: input.overlayDisplayId,
        surface: 'queue',
      },
      chrome,
      domHints: OBSERVED_PRESENTATION_DOM_HINTS.CHECK,
    };
  }

  if (overlayPainted && input.activeOverlayKind === 'result') {
    return {
      mode: 'RESULT',
      display: {
        kind: 'result',
        id: input.queueResultId ?? input.overlayDisplayId,
        surface: 'queue',
      },
      chrome,
      domHints: OBSERVED_PRESENTATION_DOM_HINTS.RESULT_QUEUE,
    };
  }

  if (input.phase === 'confirming' && sending) {
    return {
      mode: 'SENDING',
      chrome,
      domHints: OBSERVED_PRESENTATION_DOM_HINTS.SENDING,
    };
  }

  if (input.confirmActive || input.phase === 'confirming') {
    return {
      mode: 'CONFIRM',
      chrome,
      domHints: OBSERVED_PRESENTATION_DOM_HINTS.CONFIRM,
    };
  }

  if (input.phase === 'composingBan') {
    return {
      mode: 'WHAT',
      chrome,
      domHints: OBSERVED_PRESENTATION_DOM_HINTS.WHAT,
    };
  }

  if (input.phase === 'selectingTarget') {
    return {
      mode: 'WHO',
      chrome,
      domHints: OBSERVED_PRESENTATION_DOM_HINTS.WHO,
    };
  }

  if (
    !input.lobbyBootIntroPrimed ||
    input.holdLobbyOrbForBootstrap ||
    (input.showBootOrb && !input.showLobbyOrb)
  ) {
    return {
      mode: 'BOOT_LOBBY',
      chrome,
      domHints: OBSERVED_PRESENTATION_DOM_HINTS.BOOT_LOBBY,
    };
  }

  const empty =
    input.phase === 'idle' &&
    !chrome.orbVisible &&
    !chrome.chromeVisible &&
    !chrome.overlayHostActive &&
    !chrome.directOverboardHostActive;

  return {
    mode: 'LOBBY',
    empty,
    chrome,
    domHints: empty
      ? OBSERVED_PRESENTATION_DOM_HINTS.LOBBY_EMPTY
      : OBSERVED_PRESENTATION_DOM_HINTS.LOBBY,
  };
}
