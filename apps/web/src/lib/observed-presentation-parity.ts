/**
 * Stage 2 — presentation parity oracle + sequence recorder.
 *
 * Closest app-level harness style: pure frame simulation of InstantBanFlow +
 * Providers paint predicates (same approach as providers-queue-flow /
 * success-drain script suites). No React remount, no PresentationRoot, no
 * render ownership changes.
 *
 * `derivePaintedDomSurface` is the paint oracle (JSX predicates → DOM ids).
 * `observePresentationState` is the Stage 1 mirror. Parity asserts they agree.
 */

import {
  observePresentationState,
  type ObservedPresentationInput,
  type ObservedPresentationMode,
  type ObservedPresentationState,
  type ObservedRuntimeDisplayKind,
  type ObservedSendFlowPhase,
  type ObservedSuccessSnapshot,
} from './observed-presentation-state';
import {
  getObservedPresentationPublishCount,
  publishObservedPresentation,
} from './observed-presentation-mirror';

export type PaintedDomSurface = {
  mode: ObservedPresentationMode;
  /** Topmost card/surface id when applicable. */
  cardId: string | null;
  surface: 'local' | 'queue' | 'direct' | 'lobby';
  /** Production DOM identifiers that would be present for this paint. */
  domIds: string[];
  empty?: boolean;
  confirmLayerVisible: boolean;
  confirmOrbVisible: boolean;
  successSnapshot: ObservedSuccessSnapshot | null;
};

export type ParityRuntimeSnapshot = {
  lifecycle: string | null;
  displayKind: ObservedRuntimeDisplayKind | null;
  displayId: string | null;
  displayPayloadPresent: boolean;
  queueLength: number;
};

export type ParityLocalSnapshot = {
  phase: ObservedSendFlowPhase;
  banSentSuccess: boolean;
  confirmActive: boolean;
  inFlight: boolean;
  sharing: boolean;
  replySending: boolean;
  lobbyBootIntroPrimed: boolean;
  holdLobbyOrbForBootstrap: boolean;
  showBootOrb: boolean;
  showLobbyOrb: boolean;
  persistentLogoVisible: boolean;
  showLobbyChrome: boolean;
  /** Stable InstantBanFlow instance token for remount detection. */
  instantBanFlowInstanceId: string;
};

export type PresentationParitySample = {
  t: number;
  label: string;
  observed: ObservedPresentationState;
  painted: PaintedDomSurface;
  runtime: ParityRuntimeSnapshot;
  local: ParityLocalSnapshot;
  mirrorPublishCount: number;
};

/**
 * Paint oracle — mirrors InstantBanFlow / Providers JSX predicates, not the
 * observer implementation. Keep intentional duplication so Stage 2 can catch
 * observer drift.
 *
 * Priority follows actual stacking:
 * 1. SuccessOverlay (InstantBanFlow local; product blocks concurrent result)
 * 2. DirectOverboardResultLayer (Providers portal)
 * 3. NotificationQueueShell overlays (Providers portal)
 * 4. Confirm / Sending (InstantBanFlow confirm layer)
 * 5. What / Who
 * 6. Boot lobby / Lobby
 */
export function derivePaintedDomSurface(
  input: ObservedPresentationInput,
): PaintedDomSurface {
  const sending = input.inFlight || input.sharing || input.replySending;
  const overlayPainted =
    input.overlayHostActive || input.notificationOverlayVisible;
  const confirmLayerVisible = input.confirmActive;
  const confirmOrbVisible = input.confirmActive && input.showLobbyOrb;

  // InstantBanFlow: `{banSentSuccess && successSnapshot ? ( … SuccessOverlay`
  if (input.banSentSuccess && input.successSnapshot) {
    return {
      mode: 'SUCCESS',
      cardId: input.successSnapshot.selectedUserId,
      surface: 'local',
      domIds: ['SuccessOverlay', 'data-instant-ban-view="SuccessOverlay"'],
      confirmLayerVisible: false,
      confirmOrbVisible: false,
      successSnapshot: { ...input.successSnapshot },
    };
  }

  // Providers: DirectOverboardResultLayer when showDirectOverboardLayer
  if (input.showDirectOverboardLayer && input.directOverboardResultId) {
    return {
      mode: 'RESULT',
      cardId: input.directOverboardResultId,
      surface: 'direct',
      domIds: ['data-direct-overboard-result'],
      confirmLayerVisible,
      confirmOrbVisible,
      successSnapshot: null,
    };
  }

  // Providers: GlobalOverlayHost / NotificationQueueShell children
  if (overlayPainted && input.activeOverlayKind === 'incoming') {
    return {
      mode: 'INCOMING',
      cardId: input.overlayDisplayId,
      surface: 'queue',
      domIds: ['data-notification-layer'],
      confirmLayerVisible,
      confirmOrbVisible,
      successSnapshot: null,
    };
  }
  if (overlayPainted && input.activeOverlayKind === 'check') {
    return {
      mode: 'CHECK',
      cardId: input.overlayDisplayId,
      surface: 'queue',
      domIds: ['data-notification-layer', 'data-overlay-user-card'],
      confirmLayerVisible,
      confirmOrbVisible,
      successSnapshot: null,
    };
  }
  if (overlayPainted && input.activeOverlayKind === 'result') {
    return {
      mode: 'RESULT',
      cardId: input.queueResultId ?? input.overlayDisplayId,
      surface: 'queue',
      domIds: ['data-result-branch', 'data-notification-layer'],
      confirmLayerVisible,
      confirmOrbVisible,
      successSnapshot: null,
    };
  }

  // InstantBanFlow: confirming + in-flight → still ConfirmScreen, sending label
  if (input.phase === 'confirming' && sending) {
    return {
      mode: 'SENDING',
      cardId: null,
      surface: 'local',
      domIds: ['ConfirmScreen', 'data-send-phase="confirming"'],
      confirmLayerVisible,
      confirmOrbVisible,
      successSnapshot: null,
    };
  }

  // InstantBanFlow: `{confirmActive ? ( … ConfirmScreen`
  if (input.confirmActive || input.phase === 'confirming') {
    return {
      mode: 'CONFIRM',
      cardId: null,
      surface: 'local',
      domIds: ['ConfirmScreen'],
      confirmLayerVisible,
      confirmOrbVisible,
      successSnapshot: null,
    };
  }

  if (input.phase === 'composingBan') {
    return {
      mode: 'WHAT',
      cardId: null,
      surface: 'local',
      domIds: ['WhatScreen'],
      confirmLayerVisible: false,
      confirmOrbVisible: false,
      successSnapshot: null,
    };
  }

  if (input.phase === 'selectingTarget') {
    return {
      mode: 'WHO',
      cardId: null,
      surface: 'local',
      domIds: ['data-send-phase="selectingTarget"'],
      confirmLayerVisible: false,
      confirmOrbVisible: false,
      successSnapshot: null,
    };
  }

  // InstantBanFlow: showBootOrb → LobbyBootOrbWrap [data-boot-scene]
  if (
    !input.lobbyBootIntroPrimed ||
    input.holdLobbyOrbForBootstrap ||
    (input.showBootOrb && !input.showLobbyOrb)
  ) {
    return {
      mode: 'BOOT_LOBBY',
      cardId: null,
      surface: 'lobby',
      domIds: ['data-boot-scene', 'InstantBanFlow'],
      confirmLayerVisible: false,
      confirmOrbVisible: false,
      successSnapshot: null,
    };
  }

  const empty =
    input.phase === 'idle' &&
    !input.showBootOrb &&
    !input.showLobbyOrb &&
    !input.showLobbyChrome &&
    !input.overlayHostActive &&
    !input.showDirectOverboardLayer;

  return {
    mode: 'LOBBY',
    cardId: null,
    surface: 'lobby',
    domIds: empty
      ? ['InstantBanFlow']
      : ['data-base-lobby-orb', 'InstantBanFlow'],
    empty,
    confirmLayerVisible: false,
    confirmOrbVisible: false,
    successSnapshot: null,
  };
}

export function assertObservedMatchesPainted(
  observed: ObservedPresentationState,
  painted: PaintedDomSurface,
  label: string,
): void {
  if (observed.mode !== painted.mode) {
    throw new Error(
      `${label}: mode mismatch observed=${observed.mode} painted=${painted.mode}`,
    );
  }
  if (observed.mode === 'SUCCESS' && painted.mode === 'SUCCESS') {
    if (
      observed.snapshot.banText !== painted.successSnapshot?.banText ||
      observed.snapshot.selectedUserId !==
        painted.successSnapshot?.selectedUserId ||
      observed.snapshot.durationMinutes !==
        painted.successSnapshot?.durationMinutes
    ) {
      throw new Error(`${label}: SUCCESS snapshot mismatch`);
    }
  }
  if (
    (observed.mode === 'INCOMING' ||
      observed.mode === 'CHECK' ||
      observed.mode === 'RESULT') &&
    (painted.mode === 'INCOMING' ||
      painted.mode === 'CHECK' ||
      painted.mode === 'RESULT')
  ) {
    const observedSurface =
      observed.mode === 'RESULT' ? observed.display.surface : 'queue';
    if (observed.mode === 'RESULT' && painted.mode === 'RESULT') {
      if (observed.display.surface !== painted.surface) {
        throw new Error(
          `${label}: RESULT surface mismatch observed=${observed.display.surface} painted=${painted.surface}`,
        );
      }
      if (observed.display.id !== painted.cardId) {
        throw new Error(
          `${label}: RESULT id mismatch observed=${observed.display.id} painted=${painted.cardId}`,
        );
      }
    }
    if (
      (observed.mode === 'INCOMING' || observed.mode === 'CHECK') &&
      observed.display.id !== painted.cardId
    ) {
      throw new Error(
        `${label}: ${observed.mode} id mismatch observed=${observed.display.id} painted=${painted.cardId}`,
      );
    }
    void observedSurface;
  }
  if (observed.mode === 'LOBBY' && painted.mode === 'LOBBY') {
    if (Boolean(observed.empty) !== Boolean(painted.empty)) {
      throw new Error(
        `${label}: LOBBY empty mismatch observed=${observed.empty} painted=${painted.empty}`,
      );
    }
  }
  if (observed.chrome.confirmLayerVisible !== painted.confirmLayerVisible) {
    throw new Error(`${label}: confirmLayerVisible chrome mismatch`);
  }
  if (observed.chrome.confirmOrbVisible !== painted.confirmOrbVisible) {
    throw new Error(`${label}: confirmOrbVisible chrome mismatch`);
  }
}

export type ParityFrameInput = {
  label: string;
  input: ObservedPresentationInput;
  runtime: ParityRuntimeSnapshot;
  instantBanFlowInstanceId: string;
};

export class PresentationParityRecorder {
  readonly samples: PresentationParitySample[] = [];
  private readonly t0: number;
  private readonly instanceId: string;

  constructor(instantBanFlowInstanceId: string, t0: number = Date.now()) {
    this.instanceId = instantBanFlowInstanceId;
    this.t0 = t0;
  }

  record(frame: Omit<ParityFrameInput, 'instantBanFlowInstanceId'>): PresentationParitySample {
    const observed = observePresentationState(frame.input);
    publishObservedPresentation(observed);
    const painted = derivePaintedDomSurface(frame.input);
    const sample: PresentationParitySample = {
      t: Date.now() - this.t0,
      label: frame.label,
      observed,
      painted,
      runtime: frame.runtime,
      local: {
        phase: frame.input.phase,
        banSentSuccess: frame.input.banSentSuccess,
        confirmActive: frame.input.confirmActive,
        inFlight: frame.input.inFlight,
        sharing: frame.input.sharing,
        replySending: frame.input.replySending,
        lobbyBootIntroPrimed: frame.input.lobbyBootIntroPrimed,
        holdLobbyOrbForBootstrap: frame.input.holdLobbyOrbForBootstrap,
        showBootOrb: frame.input.showBootOrb,
        showLobbyOrb: frame.input.showLobbyOrb,
        persistentLogoVisible: frame.input.persistentLogoVisible,
        showLobbyChrome: frame.input.showLobbyChrome,
        instantBanFlowInstanceId: this.instanceId,
      },
      mirrorPublishCount: getObservedPresentationPublishCount(),
    };
    this.samples.push(sample);
    return sample;
  }

  assertParity(): void {
    for (const sample of this.samples) {
      assertObservedMatchesPainted(
        sample.observed,
        sample.painted,
        sample.label,
      );
    }
  }

  assertContinuousMount(): void {
    for (const sample of this.samples) {
      if (sample.local.instantBanFlowInstanceId !== this.instanceId) {
        throw new Error(
          `${sample.label}: InstantBanFlow remounted (${sample.local.instantBanFlowInstanceId} !== ${this.instanceId})`,
        );
      }
    }
  }

  modes(): ObservedPresentationMode[] {
    return this.samples.map((s) => s.observed.mode);
  }
}

export function baseParityInput(
  overrides: Partial<ObservedPresentationInput> = {},
): ObservedPresentationInput {
  return {
    phase: 'idle',
    banSentSuccess: false,
    successSnapshot: null,
    inFlight: false,
    sharing: false,
    replySending: false,
    confirmActive: false,
    lobbyBootIntroPrimed: true,
    holdLobbyOrbForBootstrap: false,
    showBootOrb: false,
    showLobbyOrb: true,
    persistentLogoVisible: true,
    showLobbyChrome: true,
    activeOverlayKind: null,
    overlayHostActive: false,
    notificationOverlayVisible: false,
    showDirectOverboardLayer: false,
    directOverboardResultId: null,
    queueResultId: null,
    overlayDisplayId: null,
    ...overrides,
  };
}

export function idleRuntime(
  overrides: Partial<ParityRuntimeSnapshot> = {},
): ParityRuntimeSnapshot {
  return {
    lifecycle: 'idle',
    displayKind: null,
    displayId: null,
    displayPayloadPresent: false,
    queueLength: 0,
    ...overrides,
  };
}
