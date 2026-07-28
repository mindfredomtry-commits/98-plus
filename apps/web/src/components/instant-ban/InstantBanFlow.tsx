import {
  logQueueAppearanceReactionTrace,
} from '@/lib/queue-appearance-reaction-trace';
import { logStartDrainEntryTrace } from '@/lib/start-drain-entry-trace';
import { registerQueueHeadMutationContext } from '@/lib/queue-head-lifecycle-trace-debug';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type SetStateAction,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
import {
  coerceFriendList,
  findFriendByUsername,
  isValidDurationMinutes,
  ANALYTICS_EVENTS,
  type BanInteraction,
  type FriendCard,
  type NotificationMode,
  type SessionState,
  type UserPublic,
} from '@98plus/shared';
import {
  logResultTimerActionAllowed,
  logResultTimerDismissContinueQueue,
  logResultTimerGoToBansClick,
  logResultTimerInputBlockedBug,
  logResultTimerReplyClick,
} from '@/lib/result-timer-card-debug';
import { allowOverlayUserTap } from '@/lib/overlay-input-guard';
import { installResultTimerHitTestProbe } from '@/lib/result-timer-hit-test-debug';
import { useApp } from '../Providers';
import { useTelegram } from '@/hooks/useTelegram';
import { useSendChallenge } from '@/hooks/useSendChallenge';
import { useInstantBanViewport } from '@/hooks/useInstantBanViewport';
import { useNotificationRuntimeStoreOptional } from '@/notification-runtime/notification-runtime.context';
import {
  selectHoldLobbyOrbForBootstrap,
  selectIndicatorVisible,
  selectIsDraining,
  selectIsRecovering,
  selectLobbyMayShow,
  selectOverlayVisible,
  selectPendingCount,
} from '@/notification-runtime/notification-runtime.selectors';
import {
  evaluateSuccessPresentationHandoffHold,
  notificationTransitionOwnsPresentation,
  resolveLobbyOrbLayersWithSuccessDrainHold,
  SUCCESS_PRESENTATION_HANDOFF_HOLD_MAX_MS,
  type SuccessPresentationHandoffHoldInput,
} from '@/lib/success-drain-empty-shell-hold';
import { evaluateSuccessToNextHandoff } from '@/lib/success-to-next-handoff';
import {
  expectNextDisplayDomMount,
  getIncomingDomMountAckSnapshot,
  resetIncomingDomMountAck,
  subscribeIncomingDomMountAck,
} from '@/lib/incoming-dom-mount-ack';
import {
  buildSuccessPresentationHandoffTraceFields,
  logSuccessPresentationHandoffArmed,
  logSuccessPresentationHandoffReleased,
  type SuccessPresentationHandoffTraceFields,
} from '@/lib/success-drain-empty-shell-hold-debug';
import { observePresentationState } from '@/lib/observed-presentation-state';
import { publishObservedPresentation } from '@/lib/observed-presentation-mirror';
import { createInitialNotificationRuntimeState } from '@/notification-runtime/notification-runtime.types';
import {
  logOverboardV3WriterChange,
} from '@/lib/overboard-v3-prod-trace';
import {
  buildPostNotificationPresentationSnapshot,
  detectPostNotificationPresentationReleaseEdge,
  isPostNotificationPresentationFullyReleased,
} from '@/lib/post-notification-presentation-release';
import { decideLobbyClaimFromRuntime } from '@/lib/lobby-claim-from-runtime';
import { planLobbyBansOpenNavigation } from '@/lib/lobby-bans-open-navigation';
import {
  dispatchNotificationOwnerBootLobby,
  getNotificationOwnerBootLobbyState,
  resolveSendFlowSurfaceExclusivity,
  useNotificationOwnerWhoProjection,
} from '@/notification-owner';
import { logBootGate } from '@/lib/boot-gate-diag';
import { safeResolveReceiverTarget } from '@/lib/resolve-receiver';
import { resolveDevSendTarget } from '@/lib/dev-receiver';
import { getApiUrl, isClientDevAuthEnabled } from '@/lib/config';
import {
  instantBanDebug,
  instantBanSendBeforeDebug,
  instantBanSendErrorDebug,
  instantBanSendSuccessDebug,
  isInstantBanLiteMode,
} from '@/lib/instant-ban-debug';
import {
  traceSuccessExitHandler,
  traceSuccessHide,
  traceSuccessSnapshotCleared,
  traceSuccessStateReset,
} from '@/lib/success-card-trace';
import {
  allowSuccessExitLobbyOpen,
  authorizeSuccessExitDrain,
  beginSendSuccessCardSession,
  beginSuccessExitInProgress,
  clearStaleSuccessExitLatch,
  endSuccessExitInProgress,
  endSuccessExitInstrumentation,
  logSendSuccessCardShowRequired,
  logSuccessCardSkippedBug,
  logSuccessExitLobbyOpenAttempt,
  logSuccessExitStart,
  setSuccessExitDrainingForDebug,
  isSuccessExitInstrumentationActive,
  shouldSuppressLobbyOpenDuringSuccessExit,
  readLastSuccessExitDrainDiagnostic,
} from '@/lib/success-exit-first-notification-debug';
import {
  logLobbyCtaHiddenBug,
  logSuccessDrainResultLostBug,
} from '@/lib/result-next-chain-debug';
import {
  completePostSuccessHandoffEmptyOpenLobby,
  getPostSuccessHandoffSnapshot,
  abortPostSuccessHandoffForReplyCompose,
  isPostSuccessHandoffInProgress,
  logPostSuccessHandoffPreventBaseLobby,
  logPostSuccessHandoffStartTooLateBug,
  logPostSuccessHandoffWaitingMount,
  markPostSuccessExitWindowOpen,
  subscribePostSuccessHandoff,
} from '@/lib/post-success-handoff-debug';
import {
  getLastKnownVisualQueueDimSessionLive,
  getQueueLobbyGuardSnapshot,
  logLobbyOpenRejectedQueueActive,
  shouldBlockLobbyForActiveQueue,
  syncQueueLobbyGuardState,
} from '@/lib/queue-lobby-guard';
import { traceQueueClaimsNotificationScreenIfChanged } from '@/lib/queue-claims-notification-screen-trace-debug';
import { observeCheckRemainedAfterResultButNotRendered } from '@/lib/check-remained-after-result-but-not-rendered-trace-debug';
import { traceShellStuckOnResultWhileOwnerAdvancedIfNeeded } from '@/lib/shell-stuck-on-result-while-owner-advanced-trace-debug';
import { traceQueueResultOverlayClaimStuckIfNeeded } from '@/lib/queue-result-overlay-claim-trace-debug';
import { observeNextOverlayAfterResultRelease } from '@/lib/next-overlay-not-activated-after-result-release-trace-debug';
import { observeShellCheckLifecycle } from '@/lib/shell-check-lifecycle-trace-debug';
import {
  logLobbyChromeHidden,
  logLobbyChromeHiddenBug,
  logLobbyChromeVisible,
  logLobbyIndicatorState,
} from '@/lib/lobby-chrome-debug';
import { logLobbyMountHydrateTrace } from '@/lib/lobby-indicator-hydrate-trace-debug';
import {
  logLobbyCtaRestoreAfterSectionClose,
  logLobbyCtaVisibilityState,
  resolveLobbyCtaHiddenReason,
} from '@/lib/lobby-cta-visibility-debug';
import {
  logLobbyCtaRenderCheck,
  logLobbyCtaReturnNull,
  computeLobbyCtaGuardDecision,
  logCtaRenderDecisionDiag,
} from '@/lib/lobby-cta-render-debug';
import { patchLobbyCtaDebugSnapshot } from '@/lib/lobby-cta-snapshot-debug';
import { resolveLobbyInfluencePercent } from '@/lib/lobby-influence';
import { logDeepLinkHandlerResult } from '@/lib/deep-link-boot-debug';
import { markVisibleOverboardTrace } from '@/lib/overboard-flow-debug';
import { logReplyFlow, logReplyFlowLoopGuard } from '@/lib/reply-handoff-debug';
import {
  buildConfirmHoldNullReason,
  computeLobbyOrbMountDecisionWithDiag,
  isQueueHandoffOrbBlocker,
  logBeginComposingReplyState,
  logConfirmHoldRenderCheck,
  logConfirmHoldReturnNull,
  logConfirmOrbBlockedByQueueState,
  logConfirmOrbMountDecision,
  logPostSuccessHandoffStillActiveDuringReply,
  logQueueStateDuringConfirm,
} from '@/lib/confirm-hold-render-debug';
import {
  buildRenderLobbyOrbBlockers,
  logConfirmOrbMissingDiag,
  resolveOrbMountBlockedReason,
  traceConfirmStripRenderDiag,
} from '@/lib/confirm-orb-missing-debug';
import { traceZazhmiRenderSourceDiag } from '@/lib/zazhmi-render-source-debug';
import { patchZazhmiDomProbeFields } from '@/lib/zazhmi-dom-probe-debug';
import {
  logBaseLobbyLayerState,
  resolveBaseLobbyReasonIfHidden,
} from '@/lib/base-lobby-layer-debug';
import {
  collectConfirmOrbContainerMeasures,
  logConfirmHoldButtonDecision,
  logConfirmHoldComponentReturnNull,
  logConfirmOrbContainerMeasure,
  logConfirmRenderState,
} from '@/lib/confirm-hold-render-diag';
import {
  logConfirmHoldProtectionActive,
  readHoldOwnerRoute,
} from '@/lib/hold-owner-debug';
import { patchConfirmOrbDebugSnapshot } from '@/lib/confirm-orb-snapshot-debug';
import { logActiveBanDeeplink } from '@/lib/active-ban-deeplink-debug';
import {
  isDeepLinkRouteBootPending,
  logOpenActiveBanCard,
  resolvePendingDeepLinkRoute,
  subscribeDeepLinkRouteBoot,
} from '@/lib/deep-link-route-boot';
import {
  isNotificationQueueLocked,
  lockNotificationQueue,
  logOverlayPriority,
} from '@/lib/overlay-priority';
import { api } from '@/lib/api';
import {
  getSavedBans,
  saveBan,
  unsaveBan,
} from '@/lib/saved-bans-api';
import {
  shareDeepLink,
  shareInstantBanInviteMore,
  shareLobbyAskInvite,
} from '@/lib/share';
import { ArenaLobbyIdle, type LobbyCtaState } from './ArenaLobbyIdle';
import { ArenaLobbyOrb } from './ArenaLobbyOrb';
import { syncSeedCachedFriendAvatars } from '@/lib/avatar-preload';
import { enrichFriendsForWho } from '@/lib/friend-avatar-merge';
import { WhoOverlay } from './WhoScreen';
import { WhatScreen } from './WhatScreen';
import { ConfirmScreen } from './ConfirmScreen';
import { SuccessScreen } from './SuccessScreen';
import { ArenaLobbyTopNav } from './ArenaLobbyTopNav';
import { ArenaSettingsPanel } from './ArenaSettingsPanel';
import { MonetizationSection } from '../monetization/MonetizationSection';
import { trackProductEvent } from '@/lib/product-analytics';
import { BansOverlay } from './BansOverlay';
import { ActiveBanCardOverlay } from './ActiveBanCardOverlay';
import {
  type BansTab,
  filterBansForTab,
  opponentForBan,
  resolveOpponentFriendCard,
} from './bans-overlay-utils';
import { useConfirmOrbController } from './useConfirmOrbController';
import { LobbyBootOrbWrap } from '@/components/lobby/LobbyBootOrbWrap';
import { LobbyPersistentLogoSlot } from '@/components/lobby/LobbyPersistentLogoSlot';
import { LobbyIdleOrb } from '@/components/lobby/LobbyIdleOrb';
import { useGlobalRelationshipOrb } from '@/lib/use-global-relationship-orb';
import { LobbyOrbWrap } from '@/components/lobby/LobbyOrbWrap';
import { LobbyScreenAtmosphere } from '@/components/lobby/LobbyScreenAtmosphere';
import { LobbyBootLogoHideMarker } from '@/components/LobbyBootLogoHideMarker';
import { shouldHideLobbyBootLogoOnly } from '@/lib/lobby-boot-logo-hide';
import type { BootSceneIntroController } from './useBootSceneIntro';
import {
  isLobbyBootIntroPrimed,
  subscribeLobbyBootIntroSession,
} from '@/lib/lobby-boot-intro-session';
import { patchBootHandoffDebug } from '@/lib/boot-handoff-debug';
import {
  formatVisibleLogoSources,
  logPersistentLogoComputedStyles,
  logVisibleLobbyLogoSources,
  scanVisibleLobbyLogoSources,
} from '@/lib/lobby-logo-debug';
import '@/components/lobby-boot-intro.css';
import { triggerLobbyBlockedHaptic } from './lobby-cta-haptics';
import {
  evaluateConfirmSubmitEnergy,
  isDailyBanLimitSendFailure,
  isInsufficientEnergyApiError,
  isLowEnergySendFailure,
  logEnergyGate,
  resolveSendFlowSource,
  type ConfirmSubmitEnergyDecision,
} from '@/lib/energy-gate';
import { canLobbySendBan } from '@/lib/lobby-influence';
import { isReplyDeeplinkShellBan } from '@/lib/reply-deeplink-fast';
import { REPLY_DEEPLINK_TOAST_SENT } from '@/lib/reply-deeplink-action-result';
import {
  isReplyQueueHandoffSessionActive,
  patchReplyQueueHandoffSession,
} from '@/lib/reply-queue-handoff-debug';
import {
  logPostSuccessReplyDeeplinkLobbyState,
  logReplyDeeplinkSuccessState,
} from '@/lib/reply-deeplink-startup-debug';
import {
  logLobbyBansCtaClickTrace,
  logLobbyBansDrainNotEntered,
} from '@/lib/queue-source-comparison-debug';
import { logLobbyBansCtaEmptyDelayDiag } from '@/lib/lobby-bans-cta-debug';
import { logLobbyBansClick } from '@/lib/lobby-bans-click-diag-debug';
import { logResultRenderBranch, logResultRenderSelectionTrace } from '@/lib/result-render-selection-trace';
import { BanGlyph } from './SuccessBanCardBody';
import { logSendFlow } from '@/lib/send-flow-debug';
import { logSendBanResponseTrace } from '@/lib/send-ban-response-trace';
import { DEFAULT_SEND_TIMEOUT_MS } from '@/lib/request-timeout';
import {
  updateCheckHandoffRenderMirror,
  emitCheckHandoffStage,
  getActiveCheckHandoffTraceId,
  getCheckHandoffFlags,
  getCheckHandoffProvidersMirror,
  checkHandoffElapsedFromStartMs,
} from '@/lib/check-handoff-atomicity-trace-debug';
import {
  getCrossScreenTouchPolicy,
  isWhatInteractiveTarget,
} from './gestureExclusion';
import {
  describeHitTarget,
  logDocumentHitTest,
  logPager,
} from './whatScreenTouchDiag';
import '../lobby-screen.css';
import './instant-ban.css';

const DEFAULT_DURATION_MINUTES = 3;

function logHoldDebug(
  message: string,
  data?: Record<string, unknown>,
): void {
  if (data) {
    console.log(`[hold-debug] ${message}`, data);
  } else {
    console.log(`[hold-debug] ${message}`);
  }
}

function logHoldBlocked(reason: string, extra?: Record<string, unknown>): void {
  console.log('[hold-debug] blocked:', reason, extra ?? {});
}
const CTA_EXIT_MS = 200;
const CTA_ENTER_MS = 400;
/** First boot CTA paints immediately; re-entry still uses spring via beginCtaSpringIn. */
const LOBBY_CTA_COLD_START_DELAY_MS = 0;
const WHO_PANEL_ENTER_MS = 220;
const WHO_OVERLAY_TITLE = 'КОМУ ЗАПРЕЩАЕШЬ?';
const WHAT_OVERLAY_TITLE = 'ЧТО ЗАПРЕЩАЕШЬ?';
const SCREEN_TRANSITION_MS = 300;
/** Release past this progress → complete page change (~30% screen, tuned down from 0.35). */
const CROSS_SCREEN_COMMIT_THRESHOLD = 0.3;
/** Finger travel → progress multiplier (~22% more responsive). */
const CROSS_SCREEN_DRAG_SENSITIVITY = 1.22;
/** Ignore micro-movements before axis lock. */
const CROSS_SCREEN_AXIS_LOCK_MIN_PX = 12;
const CROSS_SCREEN_DEFER_AXIS_LOCK_MIN_PX = 24;
/** |dx| must exceed |dy| × this to claim horizontal pager (not vertical dismiss/compose). */
const CROSS_SCREEN_HORIZONTAL_DX_DOMINANCE = 1.2;
/** Short fling can complete below commit threshold if velocity is high enough. */
const CROSS_SCREEN_FLING_MIN_PROGRESS = 0.2;
/** Progress per second to count as intentional fling (~20% easier than 0.8). */
const CROSS_SCREEN_FLING_VELOCITY = 0.65;

type ScreenTransition = 'whoToWhat' | 'whatToWho' | null;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function resolveInitialCtaState(sendStarted: boolean): LobbyCtaState {
  if (sendStarted) return 'hidden';
  if (prefersReducedMotion()) return 'visible';
  return 'hidden';
}

/** Parent send-flow phases (arena shell stays mounted). */
export type SendFlowPhase =
  | 'idle'
  | 'selectingTarget'
  | 'composingBan'
  | 'confirming';

/** Legacy step ids for CSS hooks / debug. */
type LegacyStep = 'idle' | 'who' | 'what' | 'confirm';

type BansOverlayEntrySource = {
  type: 'bans-overlay';
  tab: BansTab;
};

type ConfirmEntrySource = 'send-flow' | BansOverlayEntrySource;

function isBansOverlayEntrySource(
  source: ConfirmEntrySource,
): source is BansOverlayEntrySource {
  return typeof source === 'object' && source.type === 'bans-overlay';
}

type Props = {
  sendStarted: boolean;
  onStartSend: () => void;
  influencePercent: number;
  /** User energy known (session + real energyPercent, not prefetch placeholder). */
  energyLoaded?: boolean;
  inviteUsername?: string | null;
  onClose?: () => void;
  bootIntro: BootSceneIntroController;
};

function legacyStepFromPhase(phase: SendFlowPhase): LegacyStep {
  switch (phase) {
    case 'idle':
      return 'idle';
    case 'selectingTarget':
      return 'who';
    case 'composingBan':
      return 'what';
    case 'confirming':
      return 'confirm';
  }
}

function triggerConfirmHaptic(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(30);
    }
    const telegramHaptic = (
      window as Window & {
        Telegram?: {
          WebApp?: {
            HapticFeedback?: {
              notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
            };
          };
        };
      }
    ).Telegram?.WebApp?.HapticFeedback;
    telegramHaptic?.notificationOccurred?.('success');
  } catch {
    // no-op
  }
}

export function InstantBanFlow({
  sendStarted,
  onStartSend,
  influencePercent,
  energyLoaded = false,
  inviteUsername = null,
  onClose,
  bootIntro,
}: Props) {
  const flowId = useId();
  const renderCountRef = useRef(0);
  const confirmHoldDiagSigRef = useRef('');
  const confirmOrbMountDiagSigRef = useRef('');
  const confirmOrbMissingDiagSigRef = useRef('');
  const confirmQueueStateDiagSigRef = useRef('');
  const postSuccessHandoffDuringReplySigRef = useRef('');
  const lobbyCtaDiagSigRef = useRef('');
  const ctaRenderDecisionDiagSigRef = useRef('');
  renderCountRef.current += 1;

  const {
    token,
    user,
    friends,
    reloadPending,
    reloadFriends,
    refreshUser,
    onboard,
    scheduleDeferredSync,
    flushDeferredSync,
    applyOptimisticSend,
    confirmOptimisticSend,
    rollbackOptimisticSend,
    activeBans,
    newBanWhoFlowRequest,
    openBansOverlayRequest,
    openBansOverlayTabRequest,
    closeBansOverlayRequest,
    resultCtaBansOverlayOpen,
    clearResultCtaBansOverlayOpen,
    bansCtaQueueSuppress,
    clearBansCtaQueueSuppress,
    canOpenBansLayerNow,
    noteBansLayerOpenAllowed,
    bansNavState,
    resetBansNavState,
    bansReturnToLobbyLatch,
    setBansReturnToLobbyLatch,
    completeBansOverlayCloseFromResultCta,
    lobbyOpen,
    lobbyDeeplinkToast,
    deepLinkRepeatBan,
    deepLinkRepeatGoToConfirm,
    clearDeepLinkRepeatBan,
    deepLinkInviteToBanInviter,
    clearDeepLinkInviteToBan,
    deepLinkReplyBan,
    clearDeepLinkReplyBan,
    deepLinkActiveBan,
    clearDeepLinkActiveBan,
    clearActiveBanDeepLinkShell,
    incomingReplyBanId,
    replyToBanId,
    replyComposeActive,
    getPinnedReplyToBanId,
    clearIncomingReply,
    openSendFlow,
    closeSendFlow,
    setComposeFlowState,
    registerResetSendUiForBansNavigation,
    clearStaleComposeStateBeforeBansNavigation,
    notificationMode,
    updateNotificationMode,
    setArenaOverlayGuardState,
    applySession,
    pendingStartupInteractions,
    hasPendingNotificationChain,
    armPostSuccessHandoffEarlyIfPending,
    releaseStartupInteractions,
    unlockNotificationQueueAndFlush,
    startLobbyBansNotificationDrain,
    clearSharedSkipResultsPrefetchForExplicitDrain,
    drainNextNotificationAfterSuccess,
    logPostSuccessQueueSnapshotBeforeRelease,
    logPostSuccessReleaseStartupResult,
    logReplyQueueHandoffDiag,
    logQueueSourceComparisonSnapshot,
    logLobbyBansClickDecisionDiag,
    markSessionBanSendSuccess,
    setSendSuccessCardMounted,
    resolveReplyParentActiveBanImmediate,
    ensureReplyParentActiveBanForSuccess,
    refreshReplyParentActiveBanInBackground,
    hasReplyParentActivePriorityPending,
    getReplyParentActiveBanId,
    markReplyParentActivePriorityShown,
    isReplyParentActivePriorityActive,
    releaseNotificationQueueAfterReplyParentActive,
    markOverlayUserAction,
    incomingGateActive,
    checkGateActive,
    checkDeeplinkDirectPending,
    notificationSessionActive,
    notificationOverlayMounted,
    lobbyBansNeedAttention,
    notificationOverlayVisible,
    visualQueueDimSession,
    showDirectOverboardLayer,
    notificationChainTransitioning,
    setNotificationChainTransitioning,
    clearNotificationOverlayForEmptyQueueAfterSuccessExit,
    activeOverlayKind,
    result,
    sendFlowOpen,
    overlayQueueLength,
    deepLinkReplyBooting,
    setDeepLinkReplyBooting,
    replyUiShellActive,
    replyDeeplinkFastShell,
    replyHandoffLock,
    replyDeepLinkBanId,
    incomingCardFullyReady,
    routeOverlayAboveBoot,
    notifyReplyWhatVisible,
    releaseReplyHandoffLock,
    activeBanUiShellActive,
    activeBanDeepLinkBanId,
    notifyActiveBanCardVisible,
    resultReplyPending,
    resultReplyRequest,
    resultReplyHandoffLock,
    notifyResultReplyWhatVisible,
    openLobby,
    clearReplyDeepLinkState,
    getConfirmHoldDebugSnapshot,
    getConfirmOrbQueueDebugSnapshot,
    tryClearExplicitNotificationDrainGuarded,
    runtimeLobbyMayShow,
    prefetchPendingAfterLobbyBansOpen,
  } = useApp();
  // Vertical 4: sole badge paint from selectIndicatorVisible (runtime pending − consumed).
  const notificationRuntimeStore = useNotificationRuntimeStoreOptional();
  const notificationRuntimeState = useSyncExternalStore(
    notificationRuntimeStore?.subscribe ?? (() => () => {}),
    notificationRuntimeStore?.getState ??
      (() => createInitialNotificationRuntimeState()),
    () => createInitialNotificationRuntimeState(),
  );
  const lobbyClaimFromRuntime = decideLobbyClaimFromRuntime(
    notificationRuntimeState,
  );
  const interactiveLobbyChromeMayShow = lobbyClaimFromRuntime.chromeMayShow;
  const runtimeClaimsNotificationScreen =
    lobbyClaimFromRuntime.claimsNotificationScreen;
  const runtimeLobbyMayShowStrict = lobbyClaimFromRuntime.lobbyMayShow;
  const holdLobbyOrbForBootstrap = selectHoldLobbyOrbForBootstrap(
    notificationRuntimeState,
  );
  const bansIndicatorVisible = selectIndicatorVisible(notificationRuntimeState);
  /**
   * V4: restore Lobby CTA only when post-notification presentation is fully
   * released (runtime idle+empty AND every host result/dim/mount latch gone).
   * V3 runtime-idle completion edge is bypassed for CTA restore.
   */
  const presentationFullyReleasedPrevRef = useRef<boolean | null>(null);
  /** Global Relationship Orb only — never used for CTA / energy-gate. */
  const globalRelationshipRing = useGlobalRelationshipOrb(token);
  const { haptic, hapticSuccess, webApp } = useTelegram();
  const deepLinkRouteBootPending = useSyncExternalStore(
    subscribeDeepLinkRouteBoot,
    isDeepLinkRouteBootPending,
    () => false,
  );
  const lobbyBootIntroPrimed = useSyncExternalStore(
    subscribeLobbyBootIntroSession,
    isLobbyBootIntroPrimed,
    () => false,
  );
  const lobbyBootIntroPrimedPrevRef = useRef(lobbyBootIntroPrimed);

  const [phase, setPhaseState] = useState<SendFlowPhase>(() => {
    if (activeBanDeepLinkBanId) return 'idle';
    return sendStarted ? 'selectingTarget' : 'idle';
  });
  const setPhase = useCallback(
    (next: SendFlowPhase, source = 'instant-ban') => {
      setComposeFlowState({ phase: next, source });
      setPhaseState(next);
    },
    [setComposeFlowState],
  );

  /**
   * WHO/WHAT/CONFIRM ownership: NotificationOwner is macro authority.
   * Legacy selectingTarget / composingBan / confirming are one-way projections.
   */
  const leaveWhoForLegacyRef = useRef(false);
  const finishWhoDismissRef = useRef<() => void>(() => {});
  const applyWhoPhaseFromOwner = useCallback(() => {
    leaveWhoForLegacyRef.current = false;
    setPhase('selectingTarget', 'notification-owner-who-projection');
  }, [setPhase]);
  const applyWhatPhaseFromOwner = useCallback(() => {
    leaveWhoForLegacyRef.current = false;
    setPhase('composingBan', 'notification-owner-what-projection');
  }, [setPhase]);
  const applyConfirmPhaseFromOwner = useCallback(() => {
    leaveWhoForLegacyRef.current = false;
    setPhase('confirming', 'notification-owner-confirm-projection');
  }, [setPhase]);
  const applyLobbyFromWhoOwner = useCallback(() => {
    finishWhoDismissRef.current();
  }, []);
  const { ownerKind } = useNotificationOwnerWhoProjection(
    phase,
    applyWhoPhaseFromOwner,
    applyLobbyFromWhoOwner,
    leaveWhoForLegacyRef,
    applyWhatPhaseFromOwner,
    applyConfirmPhaseFromOwner,
  );

  /** Clear owner WHO / WHAT / CONFIRM / SUCCESS / LEGACY_FLOW before legacy idle resets. */
  const releaseOwnerWhoToLobby = useCallback(() => {
    const kind = getNotificationOwnerBootLobbyState().presentation.kind;
    if (
      kind !== 'WHO' &&
      kind !== 'WHAT' &&
      kind !== 'CONFIRM' &&
      kind !== 'SUCCESS' &&
      kind !== 'LEGACY_FLOW'
    ) {
      return;
    }
    leaveWhoForLegacyRef.current = false;
    dispatchNotificationOwnerBootLobby({ type: 'RESET_TO_LOBBY' });
  }, []);

  useLayoutEffect(() => {
    setComposeFlowState({ phase, source: 'instant-ban-mount' });
  }, []);
  const [selectedUser, setSelectedUser] = useState<FriendCard | null>(null);
  const [banText, setBanText] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmEnterKey, setConfirmEnterKey] = useState(0);
  const [banSentSuccess, setBanSentSuccess] = useState(false);
  useEffect(() => {
    if (banSentSuccess) return;
    traceSuccessHide('ban-sent-success-cleared-effect');
    setSendSuccessCardMounted(false, { source: 'ban-sent-success-cleared' });
  }, [banSentSuccess, setSendSuccessCardMounted]);
  const [replySending, setReplySending] = useState(false);
  const sendSnapshotRef = useRef<{
    banText: string;
    selectedUser: FriendCard;
    durationMinutes: number;
    replyToBanId: string | null;
  } | null>(null);
  const lastSendSuccessBanIdRef = useRef<string | null>(null);
  const successExitAwaitingNotificationDrainRef = useRef(false);
  const postSuccessHandoffWaitingLoggedRef = useRef(false);
  const successCardSessionRef = useRef(0);
  const [successExitDraining, setSuccessExitDraining] = useState(false);
  /**
   * FIX A — synchronous SUCCESS presentation handoff latch.
   * Armed in the SUCCESS exit path BEFORE SUCCESS unmounts; survives
   * successExitDraining finally-clears until an explicit terminal release.
   */
  const [successPresentationHandoffArmed, setSuccessPresentationHandoffArmed] =
    useState(false);
  /** Explicit empty-chain release (drain missed + Lobby authorized). */
  const [successPresentationChainExplicitlyEmpty, setSuccessPresentationChainExplicitlyEmpty] =
    useState(false);
  /** FIX A bound — a stuck SUCCESS handoff must never strand an empty screen. */
  const [successEmptyShellHoldExpired, setSuccessEmptyShellHoldExpired] =
    useState(false);
  const successEmptyShellHoldStartedAtRef = useRef<number | null>(null);
  const successEmptyShellHoldPrevRef = useRef(false);
  const successEmptyShellHoldTraceRef =
    useRef<SuccessPresentationHandoffTraceFields | null>(null);
  const postSuccessHandoffActive = useSyncExternalStore(
    subscribePostSuccessHandoff,
    getPostSuccessHandoffSnapshot,
    () => false,
  );
  const postSuccessHandoffBlocking =
    postSuccessHandoffActive || isPostSuccessHandoffInProgress();
  const confirmSendContextRef = useRef<{
    payoffPhase: string;
    sendTriggered: boolean;
  }>({ payoffPhase: 'none', sendTriggered: false });
  const confirmAbortReleaseRef = useRef<(() => void) | null>(null);
  /** Blocks late success after INSUFFICIENT_ENERGY or stale send attempts. */
  const sendFailedRef = useRef(false);
  const flowSendAttemptRef = useRef(0);
  const sendStartedAtRef = useRef<number | null>(null);
  const returnToLobbyAfterLowEnergyRef = useRef<
    ((opts?: { source?: string; apiResult?: string }) => void) | null
  >(null);
  const returnToLobbyAfterDailyLimitRef = useRef<
    ((opts?: { source?: string; apiResult?: string }) => void) | null
  >(null);
  /** Phase to enter when sendStarted flips false→true (archive repeat / ban-more). */
  const sendEntryPhaseRef = useRef<SendFlowPhase | null>(null);
  /** Where Confirm was opened from — drives ← back navigation. */
  const confirmEntrySourceRef = useRef<ConfirmEntrySource>('send-flow');
  const lobbyOrbMountRef = useRef<HTMLDivElement>(null);
  const bootOrbInstanceId = useId();
  const lobbyOrbInstanceId = useId();
  const [composeExitProgress, setComposeExitProgress] = useState(0);
  const [composeDismissing, setComposeDismissing] = useState(false);
  const whoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [whoExitActive, setWhoExitActive] = useState(false);
  const [whoDismissProgress, setWhoDismissProgress] = useState(0);
  const [whoInviteToast, setWhoInviteToast] = useState<string | null>(null);
  const whoInviteToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [ctaState, setCtaStateRaw] = useState<LobbyCtaState>(() =>
    activeBanDeepLinkBanId || activeBanUiShellActive
      ? 'hidden'
      : resolveInitialCtaState(sendStarted),
  );
  const setCtaState = useCallback(
    (next: SetStateAction<LobbyCtaState>) => {
      setCtaStateRaw((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        if (prev !== resolved) {
          logOverboardV3WriterChange({
            field: 'ctaState',
            oldValue: prev,
            newValue: resolved,
            source: 'InstantBanFlow.setCtaState',
          });
        }
        return resolved;
      });
    },
    [],
  );
  const ctaStateForV3TraceRef = useRef(ctaState);
  ctaStateForV3TraceRef.current = ctaState;
  const [whoPanelEntering, setWhoPanelEntering] = useState(false);
  const ctaExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctaEnterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctaBootDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const whoPanelEnterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenTransitionRef = useRef<ScreenTransition>(null);
  const crossScreenAnimRef = useRef<number | null>(null);
  const crossScreenProgressRef = useRef(0);
  const crossScreenDragRef = useRef({
    active: false,
    decided: false,
    policy: 'normal' as ReturnType<typeof getCrossScreenTouchPolicy>,
    startX: 0,
    startY: 0,
    startProgress: 0,
    width: 1,
    lastMoveAt: 0,
    velocityProgressPerSec: 0,
  });
  const crossScreenInteractiveLockRef = useRef(false);
  const [screenTransition, setScreenTransition] = useState<ScreenTransition>(null);
  const [crossScreenProgress, setCrossScreenProgress] = useState(0);
  const lobbyCtaBootSpringRef = useRef(false);
  const postSuccessReplyDeeplinkBeforeRef = useRef<{
    lobbyOpen: boolean;
    sendStarted: boolean;
    ctaState: string;
  } | null>(null);
  const prevSendStartedRef = useRef(sendStarted);
  const skipActiveDeepLinkEntryRef = useRef(false);
  const activeBanRepeatComposeRef = useRef(false);
  const lastDeepLinkActiveBanIdRef = useRef<string | null>(null);
  const lastEarlyActiveBanIdRef = useRef<string | null>(null);
  const [bansOverlayOpen, setBansOverlayOpen] = useState(false);
  const bansOpenInFlightRef = useRef(false);
  const [settingsOverlayOpen, setSettingsOverlayOpen] = useState(false);
  const [settingsModeSaving, setSettingsModeSaving] = useState(false);
  /** Profile / Premium / Payment Sheet — a normal user section, not a notification overlay. */
  const [monetizationOpen, setMonetizationOpen] = useState(false);
  const [lowInfluenceRevealed, setLowInfluenceRevealed] = useState(false);
  const [lowEnergyBlockedSignal, setLowEnergyBlockedSignal] = useState(0);
  const [dailyLimitBlockedSignal, setDailyLimitBlockedSignal] = useState(0);
  const [lobbySendBlockReason, setLobbySendBlockReason] = useState<
    'low-energy' | 'daily-limit' | null
  >(null);
  /** Suppresses confirm inline error/retry during lobby redirect after send block. */
  const [lowEnergyRedirecting, setLowEnergyRedirecting] = useState(false);
  const [bansTab, setBansTab] = useState<BansTab>('yours');
  const [selectedBanForDetails, setSelectedBanForDetails] =
    useState<BanInteraction | null>(null);
  const [lobbyActiveBanOverlay, setLobbyActiveBanOverlay] =
    useState<BanInteraction | null>(null);
  const [successToActiveLobbyBlocked, setSuccessToActiveLobbyBlocked] =
    useState(false);
  const successToActiveLobbyBlockedRef = useRef(false);
  const [overlayHandoffFromActiveCard, setOverlayHandoffFromActiveCard] =
    useState(false);
  const prevOverlayHandoffSuppressedRef = useRef(false);
  const prevBansReturnToLobbyLatchRef = useRef(false);
  /** Set after result dismiss / "К запретам" so stale provider queue can be ignored locally. */
  const resultGoToBansDismissPathRef = useRef(false);
  const prevResultForDismissPathRef = useRef(result);
  const prevOverlayQueueLengthTraceRef = useRef(overlayQueueLength);
  const prevOverlayQueueHeadKindTraceRef = useRef<string | null>(null);
  const [historyBans, setHistoryBans] = useState<BanInteraction[]>([]);
  const [savedBans, setSavedBans] = useState<BanInteraction[]>([]);
  const [archiveToast, setArchiveToast] = useState<string | null>(null);
  const historyFetchGenRef = useRef(0);
  const savedFetchGenRef = useRef(0);
  const historyUserIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const banId = lobbyActiveBanOverlay?.id ?? null;
    if (!banId) {
      delete document.documentElement.dataset.replyParentActiveTimer;
      return;
    }
    document.documentElement.dataset.replyParentActiveTimer = banId;
    return () => {
      delete document.documentElement.dataset.replyParentActiveTimer;
    };
  }, [lobbyActiveBanOverlay?.id]);

  useEffect(() => {
    if (!lobbyActiveBanOverlay?.id) return;
    const banId = lobbyActiveBanOverlay.id;
    return installResultTimerHitTestProbe({
      banId,
      isTimerVisible: () =>
        document.documentElement.dataset.replyParentActiveTimer === banId,
    });
  }, [lobbyActiveBanOverlay?.id]);

  const legacyStep = legacyStepFromPhase(phase);
  const activeBanDeepLinkBooting =
    activeBanUiShellActive ||
    (activeBanDeepLinkBanId != null && !bansOverlayOpen);
  const sendFlowSurfaces = resolveSendFlowSurfaceExclusivity({
    ownerKind,
    phase,
    banSentSuccess,
  });
  const showWhoSurface = sendFlowSurfaces.who;
  const showWhatSurface = sendFlowSurfaces.what;
  const showCrossScreenPager =
    !activeBanDeepLinkBooting && (showWhoSurface || (showWhatSurface && selectedUser != null));
  const overlayOpen = showCrossScreenPager;
  const notificationOverlayActive =
    notificationOverlayVisible || incomingGateActive || checkGateActive || !!result;
  const overlayHandoffLobbySuppressed =
    lobbyActiveBanOverlay != null ||
    successToActiveLobbyBlocked ||
    overlayHandoffFromActiveCard ||
    notificationOverlayMounted ||
    (bansReturnToLobbyLatch && notificationOverlayMounted);
  const bansLayerUiOpen =
    !bansReturnToLobbyLatch &&
    (bansOverlayOpen || bansCtaQueueSuppress || resultCtaBansOverlayOpen);
  const orbOverlayDim =
    crossScreenProgress > 0.02 ||
    phase === 'composingBan' ||
    bansLayerUiOpen ||
    (notificationOverlayActive && !bansReturnToLobbyLatch);
  const orbOverlayDimForV3TraceRef = useRef(orbOverlayDim);
  useEffect(() => {
    const prev = orbOverlayDimForV3TraceRef.current;
    if (prev !== orbOverlayDim) {
      logOverboardV3WriterChange({
        field: 'orbOverlayDim',
        oldValue: prev,
        newValue: orbOverlayDim,
        source: 'InstantBanFlow.orbOverlayDim-derived',
      });
      orbOverlayDimForV3TraceRef.current = orbOverlayDim;
    }
  }, [orbOverlayDim]);
  /** Horizontal pager only on Who — no finger swipe What → Who. */
  const crossScreenDragEnabled =
    selectedUser != null && phase === 'selectingTarget';
  /** Fixed Who dismiss zone (z-index 11) must not cover What interactive layer. */
  const whoDismissGestureActive =
    phase === 'selectingTarget' && crossScreenProgress < 0.02;
  const replyComposeUiActive =
    replyComposeActive &&
    Boolean(replyToBanId ?? getPinnedReplyToBanId()) &&
    (phase === 'composingBan' || phase === 'confirming');
  const replyLobbyBlocked =
    !bansReturnToLobbyLatch &&
    !replyComposeUiActive &&
    (replyUiShellActive ||
      activeBanUiShellActive ||
      (incomingGateActive &&
        replyDeepLinkBanId != null &&
        activeOverlayKind === 'incoming'));
  /** Reply/incoming deeplink — block lobby pill until real incoming card is mounted. */
  const replyIncomingDeeplinkPending =
    !bansReturnToLobbyLatch &&
    !replyComposeActive &&
    !replyComposeUiActive &&
    !incomingCardFullyReady &&
    (deepLinkRouteBootPending ||
      deepLinkReplyBooting ||
      replyDeeplinkFastShell ||
      replyHandoffLock ||
      replyDeepLinkBanId != null ||
      deepLinkReplyBan != null ||
      incomingReplyBanId != null ||
      replyUiShellActive);
  const hasAnyOverlayForLobbyCta =
    notificationOverlayActive ||
    !!result ||
    incomingGateActive ||
    checkGateActive ||
    lobbyActiveBanOverlay != null ||
    sendFlowOpen;
  const onResultDismissPath =
    resultGoToBansDismissPathRef.current ||
    bansCtaQueueSuppress ||
    resultCtaBansOverlayOpen ||
    bansReturnToLobbyLatch;
  const staleResultQueueClaimActive =
    onResultDismissPath &&
    !hasAnyOverlayForLobbyCta &&
    !result &&
    activeOverlayKind === 'result' &&
    overlayQueueLength > 0;
  const effectiveOverlayQueueLengthForLobbyCta = staleResultQueueClaimActive
    ? 0
    : overlayQueueLength;
  // Diagnostic-only: keep queue-lobby-guard snapshot synced for mismatch logs.
  // Must not influence product chrome / screen claim (V1 single-owner).
  if (
    !staleResultQueueClaimActive &&
    shouldBlockLobbyForActiveQueue()
  ) {
    const ownerQueueDebug = getConfirmOrbQueueDebugSnapshot();
    const guardSnap = getQueueLobbyGuardSnapshot();
    const visualQueueDimSessionLive =
      getLastKnownVisualQueueDimSessionLive();
    if (
      overlayQueueLength === 0 &&
      ownerQueueDebug.queueLen === 0 &&
      ownerQueueDebug.pendingLen === 0
    ) {
      if (!result) {
        syncQueueLobbyGuardState({
          queueLen: 0,
          pendingLen: 0,
          overlayQueueLength: 0,
          ownerQueueLen: 0,
          ownerPendingLen: 0,
          resultOverlayMounted: false,
          visualQueueDimSessionLive,
          source: 'instant-ban-empty-overlay-empty-owner-stale-guard-release',
        });
      } else if (
        guardSnap.fromQueueResult &&
        visualQueueDimSessionLive !== true
      ) {
        syncQueueLobbyGuardState({
          queueLen: 0,
          pendingLen: 0,
          fromQueueResult: true,
          queueShellShowsResult: guardSnap.queueShellShowsResult,
          overlayQueueLength: 0,
          ownerQueueLen: 0,
          ownerPendingLen: 0,
          resultOverlayMounted: true,
          visualQueueDimSessionLive,
          source:
            'instant-ban-empty-owner-release-stale-from-queue-result',
        });
      }
    }
  }
  const legacyQueueLobbyGuardActive = shouldBlockLobbyForActiveQueue();
  const legacyQueueClaimsNotificationScreen =
    effectiveOverlayQueueLengthForLobbyCta > 0 || legacyQueueLobbyGuardActive;
  // V1 product authority — runtime overlay lifecycle only.
  const queueClaimsNotificationScreen = runtimeClaimsNotificationScreen;
  const queueLobbyGuardActive = runtimeClaimsNotificationScreen;
  const legacyLobbyOrbBlockers = buildRenderLobbyOrbBlockers({
    replyIncomingDeeplinkPending,
    checkDeeplinkDirectPending,
    replyLobbyBlocked,
    successToActiveLobbyBlocked,
    overlayHandoffLobbySuppressed,
    successExitDraining,
    postSuccessHandoffBlocking,
    notificationChainTransitioning,
    queueClaimsNotificationScreen,
    overlayQueueLength: 0,
    queueLobbyGuardActive: false,
  });
  /**
   * FIX A — SUCCESS presentation handoff hold:
   * latch armed synchronously before SUCCESS unmount; keep base Lobby
   * (orb + logo + chrome) hidden until an explicit terminal runtime outcome.
   * Does NOT require draining/pending/prefetch evidence to stay armed.
   */
  const runtimeDisplayPayload = notificationRuntimeState.display.payload;
  const expectedNextDisplayId =
    runtimeDisplayPayload?.kind === 'incoming'
      ? (runtimeDisplayPayload.ban.id ?? null)
      : runtimeDisplayPayload?.kind === 'check'
        ? (runtimeDisplayPayload.ban.id ?? null)
        : runtimeDisplayPayload?.kind === 'result'
          ? (runtimeDisplayPayload.result.id ?? null)
          : null;
  const incomingDomMountAck = useSyncExternalStore(
    subscribeIncomingDomMountAck,
    getIncomingDomMountAckSnapshot,
    getIncomingDomMountAckSnapshot,
  );
  // Primitive for handoff — avoid depending on object identity beyond stable snapshot.
  const nextDisplayDomMountedMatching =
    expectedNextDisplayId != null &&
    incomingDomMountAck.matchingDomMounted &&
    incomingDomMountAck.mountedDisplayId === expectedNextDisplayId;

  useLayoutEffect(() => {
    if (!successPresentationHandoffArmed) return;
    expectNextDisplayDomMount(expectedNextDisplayId);
  }, [successPresentationHandoffArmed, expectedNextDisplayId]);

  const successPresentationHandoffInput: SuccessPresentationHandoffHoldInput = {
    lobbyBootIntroPrimed,
    handoffArmed: successPresentationHandoffArmed,
    runtimeLifecycle: notificationRuntimeState.lifecycle.status,
    runtimeDisplayKind: notificationRuntimeState.display.kind,
    runtimeDisplayPayloadPresent:
      notificationRuntimeState.display.payload != null,
    runtimeQueueLength: notificationRuntimeState.items.queue.length,
    notificationPresentationClaimed: runtimeClaimsNotificationScreen,
    expectedDisplayId: expectedNextDisplayId,
    nextDisplayDomMounted: nextDisplayDomMountedMatching,
    chainExplicitlyEmpty: successPresentationChainExplicitlyEmpty,
    presentationOwnershipReleased:
      selectIsRecovering(notificationRuntimeState) ||
      notificationRuntimeState.recovery.status === 'failed',
    holdExpired: successEmptyShellHoldExpired,
  };
  const successPresentationHandoffDecision =
    evaluateSuccessPresentationHandoffHold(successPresentationHandoffInput);
  const successPresentationHandoffHold =
    successPresentationHandoffDecision.hold;
  /**
   * Stage 3A — sole SUCCESS→next handoff contract.
   * Retains local SUCCESS until matching next card DOM is mounted, explicit
   * empty, or recoverable failure (never Lobby from display null / host alone).
   */
  const successToNextHandoff = evaluateSuccessToNextHandoff({
    banSentSuccess,
    hasSuccessSnapshot: sendSnapshotRef.current != null,
    handoffArmed: successPresentationHandoffArmed,
    runtimeDisplayKind:
      notificationRuntimeState.display.kind === 'incoming' ||
      notificationRuntimeState.display.kind === 'check' ||
      notificationRuntimeState.display.kind === 'result'
        ? notificationRuntimeState.display.kind
        : null,
    runtimeDisplayPayloadPresent:
      notificationRuntimeState.display.payload != null,
    expectedDisplayId: expectedNextDisplayId,
    nextDisplayDomMounted: nextDisplayDomMountedMatching,
    notificationPresentationClaimed: runtimeClaimsNotificationScreen,
    chainExplicitlyEmpty: successPresentationChainExplicitlyEmpty,
    presentationOwnershipReleased:
      selectIsRecovering(notificationRuntimeState) ||
      notificationRuntimeState.recovery.status === 'failed',
  });
  /** Back-compat alias used by existing diagnostics / mount gates. */
  const successEmptyShellHold = successPresentationHandoffHold;
  const interactiveActionOwnsPresentation =
    notificationRuntimeState.lifecycle.status === 'submitting' ||
    notificationRuntimeState.action.status === 'pending' ||
    // Check-style / expected-result wait keeps the head while action=succeeded.
    notificationRuntimeState.action.status === 'succeeded';
  const transitionOwnsPresentation = notificationTransitionOwnsPresentation({
    // Stage 3A: while handoff is armed and Lobby is not the terminal release,
    // never paint Lobby base (closes SUCCESS → empty LOBBY → INCOMING gap).
    successPresentationHandoffHold:
      successPresentationHandoffHold ||
      (successPresentationHandoffArmed && !successToNextHandoff.allowLobbyBase),
    interactiveActionOwnsPresentation,
  });
  successEmptyShellHoldTraceRef.current =
    buildSuccessPresentationHandoffTraceFields(
      successPresentationHandoffInput,
      successPresentationHandoffDecision.releaseReason,
      {
        successVisible: banSentSuccess,
        elapsedMs: null,
      },
    );
  /** Base lobby layer: boot orb until primed + chrome-safe; then permanent lobby orb. */
  const { showBootOrb, showLobbyOrb } =
    resolveLobbyOrbLayersWithSuccessDrainHold({
      hold: transitionOwnsPresentation,
      lobbyBootIntroPrimed,
      holdLobbyOrbForBootstrap,
    });
  const lobbyOrbVisible = showBootOrb || showLobbyOrb;
  useEffect(() => {
    if (!successPresentationHandoffHold) return;
    const timer = setTimeout(() => {
      setSuccessEmptyShellHoldExpired(true);
    }, SUCCESS_PRESENTATION_HANDOFF_HOLD_MAX_MS);
    return () => clearTimeout(timer);
  }, [successPresentationHandoffHold]);
  useEffect(() => {
    if (successPresentationHandoffHold) return;
    setSuccessEmptyShellHoldExpired(false);
  }, [successPresentationHandoffHold]);
  // Clear the latch once a terminal release is observed (not merely display null).
  // Stage 3A: while SUCCESS is retained, the handoff contract owns disarm via mayClear.
  useEffect(() => {
    if (!successPresentationHandoffArmed) return;
    if (successToNextHandoff.retainSuccessPresentation) return;
    if (successPresentationHandoffHold) return;
    const reason = successPresentationHandoffDecision.releaseReason;
    if (
      reason === 'runtime-materialized-and-claimed' ||
      reason === 'chain-explicitly-empty' ||
      reason === 'presentation-ownership-released' ||
      reason === 'hold-expired'
    ) {
      setSuccessPresentationHandoffArmed(false);
      if (reason !== 'chain-explicitly-empty') {
        setSuccessPresentationChainExplicitlyEmpty(false);
      }
    }
  }, [
    successPresentationHandoffArmed,
    successPresentationHandoffHold,
    successPresentationHandoffDecision.releaseReason,
    successToNextHandoff.retainSuccessPresentation,
  ]);

  // Stage 3A: clear local SUCCESS only on explicit handoff terminal
  // (matching DOM mount or empty Lobby release) — never on display null.
  useLayoutEffect(() => {
    if (!successToNextHandoff.mayClearSuccessLocal) return;
    if (!banSentSuccess && sendSnapshotRef.current == null) {
      if (
        successPresentationHandoffArmed &&
        (successToNextHandoff.phase === 'NEXT_NOTIFICATION_VISIBLE' ||
          successToNextHandoff.phase === 'EMPTY_LOBBY_RELEASED')
      ) {
        setSuccessPresentationHandoffArmed(false);
        if (successToNextHandoff.phase !== 'EMPTY_LOBBY_RELEASED') {
          setSuccessPresentationChainExplicitlyEmpty(false);
        }
        resetIncomingDomMountAck();
      }
      return;
    }
    sendSnapshotRef.current = null;
    setBanSentSuccess(false);
    setSuccessPresentationHandoffArmed(false);
    if (successToNextHandoff.phase !== 'EMPTY_LOBBY_RELEASED') {
      setSuccessPresentationChainExplicitlyEmpty(false);
    }
    resetIncomingDomMountAck();
  }, [
    successToNextHandoff.mayClearSuccessLocal,
    successToNextHandoff.phase,
    banSentSuccess,
    successPresentationHandoffArmed,
  ]);

  useEffect(() => {
    const wasHolding = successEmptyShellHoldPrevRef.current;
    if (wasHolding === successPresentationHandoffHold) return;
    successEmptyShellHoldPrevRef.current = successPresentationHandoffHold;
    const fields = successEmptyShellHoldTraceRef.current;
    if (!fields) return;
    if (successPresentationHandoffHold) {
      successEmptyShellHoldStartedAtRef.current = performance.now();
      logSuccessPresentationHandoffArmed(fields);
      return;
    }
    const startedAt = successEmptyShellHoldStartedAtRef.current;
    successEmptyShellHoldStartedAtRef.current = null;
    logSuccessPresentationHandoffReleased({
      ...fields,
      elapsedMs:
        startedAt == null ? null : Math.round(performance.now() - startedAt),
    });
  }, [successPresentationHandoffHold]);
  const baseLobbyLayerMounted = lobbyBootIntroPrimed;
  const lobbyChromeHidden =
    replyLobbyBlocked ||
    deepLinkRouteBootPending ||
    checkDeeplinkDirectPending ||
    replyIncomingDeeplinkPending ||
    overlayHandoffLobbySuppressed ||
    successExitDraining ||
    postSuccessHandoffBlocking ||
    notificationChainTransitioning ||
    transitionOwnsPresentation ||
    !interactiveLobbyChromeMayShow;
  const showLobbyChrome = lobbyBootIntroPrimed && !lobbyChromeHidden;
  useLayoutEffect(() => {
    traceQueueClaimsNotificationScreenIfChanged('InstantBanFlow.render', {
      queueClaimsNotificationScreen,
      overlayQueueLength,
      effectiveOverlayQueueLength: effectiveOverlayQueueLengthForLobbyCta,
      queueLobbyGuardActive,
      guardSnapshot: getQueueLobbyGuardSnapshot(),
      staleResultQueueClaimActive,
      ownerQueueLen: getConfirmOrbQueueDebugSnapshot().queueLen,
      ownerPendingLen: getConfirmOrbQueueDebugSnapshot().pendingLen,
      activeOverlayKind,
      activeKind: activeOverlayKind,
      notificationOverlayVisible,
      resultOverlayMounted: Boolean(result),
      showLobbyOrb,
      lobbyChromeHidden,
      renderBranch: lobbyOrbVisible || showBootOrb ? 'lobby' : 'base-null',
    });
  }, [
    activeOverlayKind,
    effectiveOverlayQueueLengthForLobbyCta,
    lobbyChromeHidden,
    lobbyOrbVisible,
    notificationOverlayVisible,
    overlayQueueLength,
    queueClaimsNotificationScreen,
    queueLobbyGuardActive,
    result,
    showBootOrb,
    showLobbyOrb,
    staleResultQueueClaimActive,
  ]);
  const showLobbyCta =
    lobbyBootIntroPrimed &&
    !replyIncomingDeeplinkPending &&
    !checkDeeplinkDirectPending &&
    !successToActiveLobbyBlocked &&
    !overlayHandoffLobbySuppressed &&
    !successExitDraining &&
    !postSuccessHandoffBlocking &&
    // FIX A/orb-logo: one presentation predicate — hide CTA while handoff owns screen.
    !transitionOwnsPresentation &&
    // Safe chrome during empty bootstrap; strict idle still via selectLobbyMayShow for openLobby.
    interactiveLobbyChromeMayShow &&
    (!replyLobbyBlocked || bansReturnToLobbyLatch) &&
    !deepLinkRouteBootPending &&
    !deepLinkReplyBooting &&
    !incomingReplyBanId &&
    (!incomingGateActive || bansReturnToLobbyLatch) &&
    (ctaState === 'visible' ||
      ctaState === 'exiting' ||
      ctaState === 'entering');
  console.log('QUEUE_CLAIMS_MIN_TRACE', {
    queueClaimsNotificationScreen,
    overlayQueueLength: effectiveOverlayQueueLengthForLobbyCta,
    overlayQueueLengthRaw: overlayQueueLength,
    staleResultQueueClaimActive,
    queueLobbyGuardActive,
    legacyQueueLobbyGuardActive,
    legacyQueueClaimsNotificationScreen,
    runtimeClaimsNotificationScreen,
    runtimeLobbyMayShowStrict,
    interactiveLobbyChromeMayShow,
    activeKind: activeOverlayKind,
    activeOverlayKind,
    hasAnyOverlay: hasAnyOverlayForLobbyCta,
    hasResultOverlay: !!result,
    showLobby: lobbyOpen,
    isLobbyPhase: lobbyOpen,
    showLobbyCta,
    ctaState,
    reason: runtimeClaimsNotificationScreen
      ? 'runtime-selectOverlayVisible'
      : !interactiveLobbyChromeMayShow
        ? 'runtime-interactiveLobbyChromeMayShow-false'
        : null,
    queueLobbyGuardSnapshot: getQueueLobbyGuardSnapshot(),
  });
  console.log('SHOW_LOBBY_CTA_BREAKDOWN', {
    showLobbyCta,
    showLobby: lobbyOpen,
    isLobbyPhase: lobbyOpen,
    isIdlePhase: phase === 'idle',
    composeState: phase,
    ctaState,
    energyLoaded,
    energyReady: energyLoaded,
    canBan: canLobbySendBan(energyLoaded, influencePercent),
    lowEnergy: energyLoaded && !canLobbySendBan(energyLoaded, influencePercent),
    effectiveBansOverlayOpen: bansLayerUiOpen,
    notificationQueueUiLock: notificationOverlayMounted,
    notificationChainTransitioning,
    queueClaimsNotificationScreen,
    activeOverlayKind,
    activeKind: activeOverlayKind,
    overlayQueueLength,
    pendingStartupInteractions,
    hasAnyOverlay:
      notificationOverlayActive ||
      !!result ||
      incomingGateActive ||
      checkGateActive ||
      lobbyActiveBanOverlay != null ||
      sendFlowOpen,
    hasComposeOverlay:
      sendFlowOpen ||
      sendStarted ||
      phase === 'selectingTarget' ||
      phase === 'composingBan' ||
      phase === 'confirming',
    hasNotificationOverlay: notificationOverlayMounted,
    hasResultOverlay: !!result,
    hasIncomingOverlay: incomingGateActive,
    hasCheckOverlay: checkGateActive,
    hasActiveBanOverlay: lobbyActiveBanOverlay != null,
    lobbyBootIntroPrimed,
    replyIncomingDeeplinkPending,
    checkDeeplinkDirectPending,
    successToActiveLobbyBlocked,
    overlayHandoffLobbySuppressed,
    successExitDraining,
    postSuccessHandoffBlocking,
    replyLobbyBlocked,
    bansReturnToLobbyLatch,
    deepLinkRouteBootPending,
    deepLinkReplyBooting,
    incomingReplyBanId,
    incomingGateActive,
    ctaStateAllowsLobbyCta:
      ctaState === 'visible' ||
      ctaState === 'exiting' ||
      ctaState === 'entering',
    firstFalseGuard: !lobbyBootIntroPrimed
      ? 'lobbyBootIntroPrimed'
      : replyIncomingDeeplinkPending
        ? 'replyIncomingDeeplinkPending'
        : checkDeeplinkDirectPending
          ? 'checkDeeplinkDirectPending'
          : successToActiveLobbyBlocked
            ? 'successToActiveLobbyBlocked'
            : overlayHandoffLobbySuppressed
              ? 'overlayHandoffLobbySuppressed'
              : successExitDraining
                ? 'successExitDraining'
                : postSuccessHandoffBlocking
                  ? 'postSuccessHandoffBlocking'
                  : notificationChainTransitioning
                    ? 'notificationChainTransitioning'
                    : !interactiveLobbyChromeMayShow
                      ? 'interactiveLobbyChromeMayShow'
                      : replyLobbyBlocked && !bansReturnToLobbyLatch
                        ? 'replyLobbyBlocked'
                        : deepLinkRouteBootPending
                          ? 'deepLinkRouteBootPending'
                          : deepLinkReplyBooting
                            ? 'deepLinkReplyBooting'
                            : incomingReplyBanId
                              ? 'incomingReplyBanId'
                              : incomingGateActive && !bansReturnToLobbyLatch
                                ? 'incomingGateActive'
                                : ctaState !== 'visible' &&
                                    ctaState !== 'exiting' &&
                                    ctaState !== 'entering'
                                  ? 'ctaState'
                                  : null,
    reason: !lobbyBootIntroPrimed
      ? 'lobbyBootIntroPrimed'
      : replyIncomingDeeplinkPending
        ? 'replyIncomingDeeplinkPending'
        : checkDeeplinkDirectPending
          ? 'checkDeeplinkDirectPending'
          : successToActiveLobbyBlocked
            ? 'successToActiveLobbyBlocked'
            : overlayHandoffLobbySuppressed
              ? 'overlayHandoffLobbySuppressed'
              : successExitDraining
                ? 'successExitDraining'
                : postSuccessHandoffBlocking
                  ? 'postSuccessHandoffBlocking'
                  : notificationChainTransitioning
                    ? 'notificationChainTransitioning'
                    : !interactiveLobbyChromeMayShow
                      ? 'interactiveLobbyChromeMayShow'
                      : replyLobbyBlocked && !bansReturnToLobbyLatch
                        ? 'replyLobbyBlocked'
                        : deepLinkRouteBootPending
                          ? 'deepLinkRouteBootPending'
                          : deepLinkReplyBooting
                            ? 'deepLinkReplyBooting'
                            : incomingReplyBanId
                              ? 'incomingReplyBanId'
                              : incomingGateActive && !bansReturnToLobbyLatch
                                ? 'incomingGateActive'
                                : ctaState !== 'visible' &&
                                    ctaState !== 'exiting' &&
                                    ctaState !== 'entering'
                                  ? 'ctaState'
                                  : null,
  });
  type OverlayQueueMutationOperation =
    | 'enqueue'
    | 'dequeue'
    | 'clear'
    | 'replace'
    | 'prune'
    | 'remove';

  const readOverlayQueueTraceHead = useCallback(() => {
    const snap = getConfirmOrbQueueDebugSnapshot();
    const headKind =
      snap.selectedNextKind ?? snap.heldUserCardKind ?? activeOverlayKind;
    const banId = snap.selectedNextBanId ?? result?.id ?? null;
    return {
      headKind,
      banId,
      resultId: headKind === 'result' ? banId : null,
    };
  }, [activeOverlayKind, getConfirmOrbQueueDebugSnapshot, result?.id]);

  const logOverlayQueueMutationTrace = useCallback(
    (input: {
      operation: OverlayQueueMutationOperation;
      source: string;
      reason: string;
      phase: 'before' | 'after' | 'observe';
      itemKind?: string | null;
      itemBanId?: string | null;
      itemResultId?: string | null;
      prevLength?: number;
      nextLength?: number;
      prevHeadKind?: string | null;
      nextHeadKind?: string | null;
    }) => {
      const head = readOverlayQueueTraceHead();
      registerQueueHeadMutationContext({
        source: input.source,
        reason: `${input.reason}:${input.phase}`,
        operation: input.operation,
        prevLength: input.prevLength ?? null,
        nextLength: input.nextLength ?? null,
        prevHeadKind: input.prevHeadKind ?? null,
        nextHeadKind: input.nextHeadKind ?? null,
      });
      console.log('OVERLAY_QUEUE_MUTATION_TRACE', {
        operation: input.operation,
        source: input.source,
        reason: input.reason,
        phase: input.phase,
        itemKind: input.itemKind ?? head.headKind,
        itemBanId: input.itemBanId ?? head.banId,
        itemResultId: input.itemResultId ?? head.resultId,
        prevLength: input.prevLength ?? overlayQueueLength,
        nextLength: input.nextLength ?? overlayQueueLength,
        prevHeadKind: input.prevHeadKind ?? null,
        nextHeadKind: input.nextHeadKind ?? head.headKind,
        activeKind: activeOverlayKind,
        activeOverlayKind,
        hasAnyOverlay: hasAnyOverlayForLobbyCta,
        hasResultOverlay: !!result,
        isGoToBansPath:
          resultGoToBansDismissPathRef.current ||
          bansCtaQueueSuppress ||
          resultCtaBansOverlayOpen ||
          bansReturnToLobbyLatch,
      });
    },
    [
      activeOverlayKind,
      bansCtaQueueSuppress,
      bansReturnToLobbyLatch,
      hasAnyOverlayForLobbyCta,
      overlayQueueLength,
      readOverlayQueueTraceHead,
      result,
      resultCtaBansOverlayOpen,
    ],
  );

  const traceOverlayQueueMutationBefore = useCallback(
    (
      operation: OverlayQueueMutationOperation,
      source: string,
      reason: string,
      extras?: {
        itemKind?: string | null;
        itemBanId?: string | null;
        itemResultId?: string | null;
      },
    ) => {
      const head = readOverlayQueueTraceHead();
      logOverlayQueueMutationTrace({
        operation,
        source,
        reason,
        phase: 'before',
        prevLength: overlayQueueLength,
        nextLength: overlayQueueLength,
        prevHeadKind: head.headKind,
        nextHeadKind: head.headKind,
        ...extras,
      });
    },
    [logOverlayQueueMutationTrace, overlayQueueLength, readOverlayQueueTraceHead],
  );

  const ctaInteractive = phase === 'idle' && ctaState === 'visible';

  /** Stable viewport height for all send phases (Who/What/Confirm), including resume. */
  useInstantBanViewport(true);

  const clearCtaExitTimer = useCallback(() => {
    if (ctaExitTimerRef.current) {
      clearTimeout(ctaExitTimerRef.current);
      ctaExitTimerRef.current = null;
    }
  }, []);

  const clearCtaEnterTimer = useCallback(() => {
    if (ctaEnterTimerRef.current) {
      clearTimeout(ctaEnterTimerRef.current);
      ctaEnterTimerRef.current = null;
    }
  }, []);

  const clearCtaBootDelayTimer = useCallback(() => {
    if (ctaBootDelayTimerRef.current) {
      clearTimeout(ctaBootDelayTimerRef.current);
      ctaBootDelayTimerRef.current = null;
    }
  }, []);

  const clearWhoPanelEnterTimer = useCallback(() => {
    if (whoPanelEnterTimerRef.current) {
      clearTimeout(whoPanelEnterTimerRef.current);
      whoPanelEnterTimerRef.current = null;
    }
  }, []);

  const stopCrossScreenAnim = useCallback(() => {
    if (crossScreenAnimRef.current != null) {
      cancelAnimationFrame(crossScreenAnimRef.current);
      crossScreenAnimRef.current = null;
    }
  }, []);

  const setCrossScreenProgressImmediate = useCallback((value: number) => {
    const next = clamp01(value);
    crossScreenProgressRef.current = next;
    setCrossScreenProgress(next);
  }, []);

  useEffect(() => {
    crossScreenProgressRef.current = crossScreenProgress;
  }, [crossScreenProgress]);

  useEffect(() => {
    if (screenTransitionRef.current) return;
    if (phase === 'composingBan') {
      setCrossScreenProgressImmediate(1);
    } else if (phase === 'selectingTarget' || phase === 'idle') {
      setCrossScreenProgressImmediate(0);
    }
  }, [phase, screenTransition, setCrossScreenProgressImmediate]);

  const animateCrossScreenProgress = useCallback(
    (to: number, onComplete?: () => void) => {
      stopCrossScreenAnim();
      const from = crossScreenProgressRef.current;
      const target = clamp01(to);

      if (prefersReducedMotion() || Math.abs(target - from) < 0.001) {
        setCrossScreenProgressImmediate(target);
        onComplete?.();
        return;
      }

      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / SCREEN_TRANSITION_MS);
        const next = from + (target - from) * easeOutCubic(t);
        setCrossScreenProgressImmediate(next);
        if (t < 1) {
          crossScreenAnimRef.current = requestAnimationFrame(tick);
          return;
        }
        crossScreenAnimRef.current = null;
        onComplete?.();
      };
      crossScreenAnimRef.current = requestAnimationFrame(tick);
    },
    [setCrossScreenProgressImmediate, stopCrossScreenAnim],
  );

  const completeWhoToWhat = useCallback(() => {
    screenTransitionRef.current = null;
    setScreenTransition(null);
    // Owner enters WHAT; authorized projection writes composingBan in the same turn
    // so the pager does not close on an empty shell frame.
    leaveWhoForLegacyRef.current = false;
    dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHAT' });
    setPhase('composingBan', 'notification-owner-what-projection');
    setCrossScreenProgressImmediate(1);
  }, [setCrossScreenProgressImmediate, setPhase]);

  const completeWhatToWho = useCallback(() => {
    screenTransitionRef.current = null;
    setScreenTransition(null);
    leaveWhoForLegacyRef.current = false;
    // Make WHAT non-renderable *before* owner enters WHO (no WHAT flash over WHO).
    flushSync(() => {
      setPhase('selectingTarget', 'what-to-who-legacy');
      setCrossScreenProgressImmediate(0);
    });
    dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });
  }, [setCrossScreenProgressImmediate, setPhase]);

  const shouldCompleteWhoToWhat = useCallback(
    (progress: number, velocity: number) =>
      progress >= CROSS_SCREEN_COMMIT_THRESHOLD ||
      (progress >= CROSS_SCREEN_FLING_MIN_PROGRESS &&
        velocity >= CROSS_SCREEN_FLING_VELOCITY),
    [],
  );

  const shouldCompleteWhatToWho = useCallback(
    (progress: number, velocity: number) =>
      progress <= 1 - CROSS_SCREEN_COMMIT_THRESHOLD ||
      (progress <= 1 - CROSS_SCREEN_FLING_MIN_PROGRESS &&
        velocity <= -CROSS_SCREEN_FLING_VELOCITY),
    [],
  );

  const commitCrossScreenProgress = useCallback(
    (progress: number, velocityProgressPerSec: number) => {
      if (screenTransitionRef.current) return;
      const p = clamp01(progress);
      const v = velocityProgressPerSec;

      if (phase === 'selectingTarget' && selectedUser) {
        if (shouldCompleteWhoToWhat(p, v)) {
          screenTransitionRef.current = 'whoToWhat';
          setScreenTransition('whoToWhat');
          animateCrossScreenProgress(1, completeWhoToWhat);
        } else {
          animateCrossScreenProgress(0);
        }
        return;
      }

      if (phase === 'composingBan') {
        if (shouldCompleteWhatToWho(p, v)) {
          screenTransitionRef.current = 'whatToWho';
          setScreenTransition('whatToWho');
          animateCrossScreenProgress(0, completeWhatToWho);
        } else {
          animateCrossScreenProgress(1);
        }
      }
    },
    [
      animateCrossScreenProgress,
      completeWhatToWho,
      completeWhoToWhat,
      phase,
      selectedUser,
      shouldCompleteWhatToWho,
      shouldCompleteWhoToWhat,
    ],
  );

  const onCrossScreenTouchStartCapture = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      logPager('capture', {
        x: touch?.clientX,
        y: touch?.clientY,
        hit: touch
          ? describeHitTarget(touch.clientX, touch.clientY)
          : undefined,
        onInteractive: isWhatInteractiveTarget(e.target),
        defaultPrevented: e.defaultPrevented,
      });
      if (!crossScreenDragEnabled || screenTransitionRef.current) return;
      if (phase === 'composingBan') return;
      if (!touch) return;
      if (touch) {
        logDocumentHitTest('pager-capture', touch.clientX, touch.clientY, {
          onInteractive: isWhatInteractiveTarget(e.target),
        });
      }
      if (isWhatInteractiveTarget(e.target)) {
        crossScreenInteractiveLockRef.current = true;
        crossScreenDragRef.current.active = false;
        logPager('start', { skipped: 'what-interactive' });
        return;
      }
      crossScreenInteractiveLockRef.current = false;
      const policy = getCrossScreenTouchPolicy(e.target);
      logPager('start', { policy });
      const width =
        typeof window !== 'undefined'
          ? Math.max(window.innerWidth, 1)
          : 1;
      crossScreenDragRef.current = {
        active: false,
        decided: policy === 'exclude',
        policy,
        startX: touch.clientX,
        startY: touch.clientY,
        startProgress: crossScreenProgressRef.current,
        width,
        lastMoveAt: performance.now(),
        velocityProgressPerSec: 0,
      };
    },
    [crossScreenDragEnabled, phase],
  );

  const onCrossScreenTouchMoveCapture = useCallback(
    (e: React.TouchEvent) => {
      if (crossScreenInteractiveLockRef.current) return;
      const drag = crossScreenDragRef.current;
      const touch = e.touches[0];
      if (!touch) return;

      if (drag.policy === 'exclude') return;

      if (drag.active) {
        logPager('move', { active: true });
      }

      if (!drag.decided) {
        const dx = touch.clientX - drag.startX;
        const dy = touch.clientY - drag.startY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const axisLockMin =
          drag.policy === 'defer'
            ? CROSS_SCREEN_DEFER_AXIS_LOCK_MIN_PX
            : CROSS_SCREEN_AXIS_LOCK_MIN_PX;
        if (absDx < axisLockMin && absDy < axisLockMin) {
          return;
        }
        if (absDy > absDx * CROSS_SCREEN_HORIZONTAL_DX_DOMINANCE) {
          crossScreenDragRef.current = { ...drag, active: false, decided: true };
          return;
        }
        stopCrossScreenAnim();
        crossScreenDragRef.current = {
          ...drag,
          active: true,
          decided: true,
          lastMoveAt: performance.now(),
        };
      }

      if (!crossScreenDragRef.current.active) return;
      const { startX, startProgress, width } = crossScreenDragRef.current;
      const delta =
        ((startX - touch.clientX) / width) * CROSS_SCREEN_DRAG_SENSITIVITY;
      const prevProgress = crossScreenProgressRef.current;
      const nextProgress = clamp01(startProgress + delta);
      const now = performance.now();
      const lastMoveAt = crossScreenDragRef.current.lastMoveAt;
      let velocityProgressPerSec = crossScreenDragRef.current.velocityProgressPerSec;
      if (lastMoveAt > 0) {
        const dtSec = (now - lastMoveAt) / 1000;
        if (dtSec > 0 && dtSec < 0.12) {
          velocityProgressPerSec = (nextProgress - prevProgress) / dtSec;
        }
      }
      crossScreenDragRef.current = {
        ...crossScreenDragRef.current,
        lastMoveAt: now,
        velocityProgressPerSec,
      };
      setCrossScreenProgressImmediate(nextProgress);
    },
    [setCrossScreenProgressImmediate, stopCrossScreenAnim],
  );

  const onCrossScreenTouchEndCapture = useCallback(() => {
    logPager('end', {
      interactiveLock: crossScreenInteractiveLockRef.current,
      active: crossScreenDragRef.current.active,
    });
    if (crossScreenInteractiveLockRef.current) {
      crossScreenInteractiveLockRef.current = false;
      return;
    }
    if (!crossScreenDragRef.current.active) return;
    const { velocityProgressPerSec } = crossScreenDragRef.current;
    crossScreenDragRef.current.active = false;
    commitCrossScreenProgress(
      crossScreenProgressRef.current,
      velocityProgressPerSec,
    );
  }, [commitCrossScreenProgress]);

  const scheduleCtaBecomeVisible = useCallback(() => {
    clearCtaEnterTimer();
    ctaEnterTimerRef.current = setTimeout(() => {
      ctaEnterTimerRef.current = null;
      setCtaState('visible');
    }, CTA_ENTER_MS);
  }, [clearCtaEnterTimer]);

  const beginCtaSpringIn = useCallback(() => {
    if (shouldSuppressLobbyOpenDuringSuccessExit()) {
      if (isSuccessExitInstrumentationActive()) {
        logSuccessExitLobbyOpenAttempt({
          source: 'beginCtaSpringIn',
          via: 'beginCtaSpringIn',
          blocked: 'success-exit-in-progress',
        });
      }
      return;
    }
    if (isSuccessExitInstrumentationActive()) {
      logSuccessExitLobbyOpenAttempt({
        source: 'beginCtaSpringIn',
        via: 'beginCtaSpringIn',
      });
    }
    clearCtaEnterTimer();
    setCtaState('entering');
    scheduleCtaBecomeVisible();
  }, [clearCtaEnterTimer, scheduleCtaBecomeVisible]);

  const replyLobbyBlockedLoggedRef = useRef(false);
  useEffect(() => {
    if (!replyLobbyBlocked) {
      replyLobbyBlockedLoggedRef.current = false;
      return;
    }
    if (replyLobbyBlockedLoggedRef.current) return;
    replyLobbyBlockedLoggedRef.current = true;
    logReplyFlow('lobby-render-blocked', {
      banId: replyDeepLinkBanId,
      lockActive: true,
      phase,
    });
  }, [replyLobbyBlocked, replyDeepLinkBanId, phase]);

  useEffect(() => {
    if (!replyIncomingDeeplinkPending) return;
    clearCtaBootDelayTimer();
    clearCtaEnterTimer();
    clearCtaExitTimer();
    if (ctaState !== 'hidden') {
      setCtaState('hidden');
    }
  }, [
    replyIncomingDeeplinkPending,
    clearCtaBootDelayTimer,
    clearCtaEnterTimer,
    clearCtaExitTimer,
    ctaState,
  ]);

  /** First lobby open only — dismiss re-entry uses beginCtaSpringIn. */
  useEffect(() => {
    console.log('LOBBY_BOOT_PRIMED_GATE_TRACE', {
      willPrime: false,
      blockedBy: !lobbyBootIntroPrimed
        ? 'lobbyBootIntroPrimed-false'
        : replyIncomingDeeplinkPending
          ? 'replyIncomingDeeplinkPending'
          : replyUiShellActive
            ? 'replyUiShellActive'
            : lobbyCtaBootSpringRef.current
              ? 'lobbyCtaBootSpringRef-already-fired'
              : sendStarted
                ? 'sendStarted'
                : null,
      reason: 'lobby-cta-spring-after-primed-effect-entry',
      phase,
      showLobby: lobbyOpen,
      isIdlePhase: phase === 'idle',
      energyLoaded,
      energyReady: energyLoaded,
      lobbyBootIntroPrimed,
      activeOverlayKind,
      notificationChainTransitioning,
      queueLen: overlayQueueLength,
      pendingLen: pendingStartupInteractions,
    });
    if (!lobbyBootIntroPrimed) return;
    if (replyIncomingDeeplinkPending) return;
    if (replyUiShellActive) return;
    if (lobbyCtaBootSpringRef.current) return;
    if (sendStarted) return;
    lobbyCtaBootSpringRef.current = true;
    // First usable paint: CTA visible immediately (no cold-start delay).
    if (prefersReducedMotion() || LOBBY_CTA_COLD_START_DELAY_MS <= 0) {
      setCtaState('visible');
      return;
    }
    ctaBootDelayTimerRef.current = setTimeout(() => {
      ctaBootDelayTimerRef.current = null;
      setCtaState('entering');
      scheduleCtaBecomeVisible();
    }, LOBBY_CTA_COLD_START_DELAY_MS);
    return () => clearCtaBootDelayTimer();
  }, [
    clearCtaBootDelayTimer,
    scheduleCtaBecomeVisible,
    sendStarted,
    replyUiShellActive,
    replyIncomingDeeplinkPending,
    lobbyBootIntroPrimed,
  ]);

  /** Only enter who-step when send flow opens — not when user dismisses back to lobby idle. */
  useEffect(() => {
    if (bansCtaQueueSuppress) return;
    if (sendStarted && !prevSendStartedRef.current) {
      clearCtaBootDelayTimer();
      if (skipActiveDeepLinkEntryRef.current) {
        skipActiveDeepLinkEntryRef.current = false;
        setCtaState('hidden');
        prevSendStartedRef.current = sendStarted;
        return;
      }
      if (activeBanDeepLinkBooting || activeBanUiShellActive) {
        setCtaState('hidden');
        prevSendStartedRef.current = sendStarted;
        return;
      }
      const entryPhase = sendEntryPhaseRef.current;
      sendEntryPhaseRef.current = null;
      if (entryPhase) {
        if (entryPhase === 'selectingTarget') {
          leaveWhoForLegacyRef.current = false;
          dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });
        } else if (entryPhase === 'composingBan') {
          leaveWhoForLegacyRef.current = false;
          dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHAT' });
          setPhase('composingBan', 'notification-owner-what-projection');
          setCrossScreenProgressImmediate(1);
        } else if (entryPhase === 'confirming') {
          leaveWhoForLegacyRef.current = false;
          dispatchNotificationOwnerBootLobby({ type: 'OPEN_CONFIRM' });
          setPhase('confirming', 'notification-owner-confirm-projection');
        } else {
          setPhase(entryPhase);
        }
      } else if (incomingReplyBanId || replyComposeActive) {
        leaveWhoForLegacyRef.current = false;
        dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHAT' });
        if (phase !== 'composingBan') {
          setPhase('composingBan', 'notification-owner-what-projection');
        } else {
          logReplyFlowLoopGuard('skip already composingBan');
        }
        setCrossScreenProgressImmediate(1);
      } else {
        leaveWhoForLegacyRef.current = false;
        dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });
      }
      setCtaState('hidden');
    }
    prevSendStartedRef.current = sendStarted;
  }, [
    bansCtaQueueSuppress,
    clearCtaBootDelayTimer,
    incomingReplyBanId,
    replyComposeActive,
    phase,
    sendStarted,
    activeBanDeepLinkBooting,
    activeBanUiShellActive,
    setCrossScreenProgressImmediate,
  ]);

  useEffect(() => {
    if (phase === 'confirming' && ctaState !== 'hidden') {
      setCtaState('hidden');
    }
  }, [ctaState, phase]);

  useEffect(() => {
    instantBanDebug('flow-mount', { flowId });
    return () => {
      instantBanDebug('flow-unmount', { flowId });
    };
  }, [flowId]);

  useEffect(() => {
    instantBanDebug('flow-render', {
      flowId,
      phase,
      legacyStep,
      renderCount: renderCountRef.current,
    });
  });

  const safeFriends = useMemo(() => {
    try {
      const list = coerceFriendList(friends).filter(
        (f) => (f.username ?? '').toLowerCase() !== 'share',
      );
      return enrichFriendsForWho(list);
    } catch {
      return [];
    }
  }, [friends]);

  useLayoutEffect(() => {
    if (phase !== 'selectingTarget' || safeFriends.length === 0) return;
    syncSeedCachedFriendAvatars(safeFriends);
  }, [phase, safeFriends]);

  const savedBanIds = useMemo(
    () => new Set(savedBans.map((b) => b.id)),
    [savedBans],
  );

  const filteredBans = useMemo(
    () =>
      filterBansForTab(
        Array.isArray(activeBans) ? activeBans : [],
        historyBans,
        savedBans,
        bansTab,
        user?.id,
      ),
    [activeBans, historyBans, savedBans, bansTab, user?.id],
  );

  const notificationQueueUiLock = notificationOverlayMounted;
  const effectiveBansOverlayOpen = bansLayerUiOpen;
  const showLobbyTopNav =
    lobbyBootIntroPrimed &&
    !holdLobbyOrbForBootstrap &&
    interactiveLobbyChromeMayShow &&
    phase === 'idle' &&
    !banSentSuccess &&
    !successToActiveLobbyBlocked &&
    !overlayHandoffLobbySuppressed &&
    !successExitDraining &&
    !postSuccessHandoffBlocking &&
    (!notificationChainTransitioning || notificationOverlayMounted) &&
    !effectiveBansOverlayOpen &&
    !settingsOverlayOpen &&
    !monetizationOpen &&
    !notificationQueueUiLock &&
    !replyUiShellActive &&
    !deepLinkRouteBootPending &&
    !checkDeeplinkDirectPending;
  useEffect(() => {
    if (showLobbyCta && showLobbyTopNav) {
      logBootGate('BOOT_GATE_LOBBY_RELEASED', {
        userId: user?.id ?? null,
        runtimeLifecycle: notificationRuntimeState.lifecycle.status,
        bootstrapPhase: notificationRuntimeState.lifecycle.status,
        blockingGate: null,
      });
    } else if (lobbyBootIntroPrimed && !holdLobbyOrbForBootstrap) {
      logBootGate('BOOT_GATE_LOBBY_BLOCKED', {
        userId: user?.id ?? null,
        runtimeLifecycle: notificationRuntimeState.lifecycle.status,
        blockingGate: !interactiveLobbyChromeMayShow
          ? 'interactiveLobbyChromeMayShow-false'
          : !showLobbyCta
            ? 'showLobbyCta-false'
            : 'showLobbyTopNav-false',
      });
    }
  }, [
    showLobbyCta,
    showLobbyTopNav,
    lobbyBootIntroPrimed,
    holdLobbyOrbForBootstrap,
    interactiveLobbyChromeMayShow,
    notificationRuntimeState.lifecycle.status,
    user?.id,
  ]);
  const lobbyChromeBlockers = {
    replyLobbyBlocked,
    deepLinkRouteBootPending,
    checkDeeplinkDirectPending,
    replyIncomingDeeplinkPending,
    overlayHandoffLobbySuppressed,
    successExitDraining,
    postSuccessHandoffBlocking,
    notificationChainTransitioning,
    notificationOverlayMounted,
    notificationOverlayVisible,
    notificationSessionActive,
    notificationQueueUiLock,
    lobbyChromeHidden,
    phase,
    banSentSuccess,
    successToActiveLobbyBlocked,
    effectiveBansOverlayOpen,
    replyUiShellActive,
  };

  useEffect(() => {
    logLobbyIndicatorState({
      pendingStartupInteractions,
      queueLen: overlayQueueLength,
      hasIncoming: incomingGateActive,
      lobbyBansNeedAttention,
    });
  }, [
    incomingGateActive,
    lobbyBansNeedAttention,
    overlayQueueLength,
    pendingStartupInteractions,
  ]);

  const prevShowLobbyTopNavRef = useRef(showLobbyTopNav);
  useEffect(() => {
    const wasVisible = prevShowLobbyTopNavRef.current;
    prevShowLobbyTopNavRef.current = showLobbyTopNav;
    if (showLobbyTopNav) {
      logPostSuccessHandoffStartTooLateBug({
        reason: 'lobby-chrome-visible',
        showLobbyTopNav,
        showLobbyChrome,
        queueLen: overlayQueueLength,
        pendingStartup: pendingStartupInteractions,
      });
      logLobbyChromeVisible({
        showLobbyTopNav,
        showLobbyChrome,
        lobbyBansNeedAttention,
      });
      logLobbyMountHydrateTrace({
        t: performance.now(),
        pendingOverlaysCount: pendingStartupInteractions,
        queueLength: overlayQueueLength,
        ownerDisplayKind: null,
        ownerQueueHead: null,
        updateSource: 'bootstrap',
        lobbyBansNeedAttention,
        showLobbyTopNav,
      });
      return;
    }
    if (!wasVisible) return;
    const blockers = lobbyChromeBlockers;
    logLobbyChromeHidden({ reason: 'top-nav-hidden', blockers });
    if (
      lobbyOpen &&
      phase === 'idle' &&
      !notificationOverlayMounted &&
      (notificationOverlayVisible ||
        notificationSessionActive ||
        notificationChainTransitioning ||
        !!result)
    ) {
      logLobbyChromeHiddenBug({ blockers });
    }
  }, [
    showLobbyTopNav,
    showLobbyChrome,
    lobbyBansNeedAttention,
    lobbyOpen,
    overlayQueueLength,
    pendingStartupInteractions,
    phase,
    notificationOverlayMounted,
    notificationOverlayVisible,
    notificationSessionActive,
    notificationChainTransitioning,
    result,
  ]);

  const showBansLayer =
    effectiveBansOverlayOpen &&
    !replyComposeActive &&
    (bansCtaQueueSuppress ||
      resultCtaBansOverlayOpen ||
      (routeOverlayAboveBoot && phase === 'idle') ||
      activeBanDeepLinkBooting ||
      (phase === 'idle' && !notificationQueueUiLock));
  const bootBackgroundUnderRouteOverlay =
    routeOverlayAboveBoot &&
    !lobbyBootIntroPrimed &&
    !replyComposeActive &&
    phase === 'idle';

  useLayoutEffect(() => {
    patchBootHandoffDebug({
      introPrimed: lobbyBootIntroPrimed,
      showLobbyChrome,
      showLobbyCta,
      hasPlayedIntro: lobbyBootIntroPrimed,
    });
  }, [
    lobbyBootIntroPrimed,
    showLobbyChrome,
    showLobbyCta,
    overlayHandoffLobbySuppressed,
  ]);

  const checkHandoffFullLobbyPrevRef = useRef(false);
  const checkHandoffQueueClaimsPrevRef = useRef(false);
  useLayoutEffect(() => {
    const queueLobbyGuardActiveDiag = shouldBlockLobbyForActiveQueue();
    const queueClaimsNotificationScreen =
      selectOverlayVisible(notificationRuntimeState);
    const fullLobbyRenderActive =
      showLobbyCta && !effectiveBansOverlayOpen && !notificationQueueUiLock;

    updateCheckHandoffRenderMirror({
      showLobbyCta,
      queueClaimsNotificationScreen,
      effectiveBansOverlayOpen,
      notificationQueueUiLock,
      effectiveOverlayQueueLengthForLobbyCta,
      queueLobbyGuardActive: queueClaimsNotificationScreen,
    });

    const handoffId = getActiveCheckHandoffTraceId();
    const providers = getCheckHandoffProvidersMirror();
    const queueDebug = getConfirmOrbQueueDebugSnapshot();

    const prevFull = checkHandoffFullLobbyPrevRef.current;
    checkHandoffFullLobbyPrevRef.current = fullLobbyRenderActive;
    if (!prevFull && fullLobbyRenderActive && handoffId) {
      emitCheckHandoffStage('full-lobby-render-enter', {
        banId: providers.ownerPrimaryCheckBanForDisplayGuardsId,
        showLobbyCta,
        effectiveBansOverlayOpen,
        notificationQueueUiLock,
        notificationOverlayMounted,
        notificationChainTransitioning,
        queueClaimsNotificationScreen,
        effectiveOverlayQueueLengthForLobbyCta,
        overlayQueueLength,
        queueLobbyGuardActive: queueLobbyGuardActiveDiag,
        notificationQueueShellKind: providers.notificationQueueShellKind,
        ownerDisplayKind: providers.ownerDisplayKind,
        ownerQueueLength: providers.ownerQueueLength,
        ownerPendingLength: providers.ownerPendingLength,
        currentQueueHeadKind:
          providers.currentQueueHeadKind ?? queueDebug.overlayQueueHeadKind,
        currentQueueHeadIdentity: providers.currentQueueHeadIdentity,
        chainAdvanceWaiting: queueDebug.chainAdvanceWaiting,
        chainAdvancePlaceholderKind: providers.chainAdvancePlaceholderKind,
        checkOverlayMounted: providers.checkOverlayMounted,
        showCheckOverlayDirect: providers.showCheckOverlayDirect,
        ownerPrimaryCheckBanForDisplayGuardsId:
          providers.ownerPrimaryCheckBanForDisplayGuardsId,
        elapsedFromCheckAnswerMs: checkHandoffElapsedFromStartMs(),
        ...getCheckHandoffFlags(),
      });
    }

    const prevClaims = checkHandoffQueueClaimsPrevRef.current;
    checkHandoffQueueClaimsPrevRef.current = queueClaimsNotificationScreen;
    if (prevClaims && !queueClaimsNotificationScreen && handoffId) {
      const guardSnapshot = getQueueLobbyGuardSnapshot();
      emitCheckHandoffStage('queue-claim-fell-false', {
        effectiveOverlayQueueLengthForLobbyCta,
        overlayQueueLength,
        queueLobbyGuardActive: queueLobbyGuardActiveDiag,
        guardQueueLen: guardSnapshot.queueLen,
        guardFromQueueResult: guardSnapshot.fromQueueResult,
        guardQueueShellShowsResult: guardSnapshot.queueShellShowsResult,
        guardPhase: guardSnapshot.phase,
        ownerQueueLength: queueDebug.queueLen,
        ownerPendingLength: queueDebug.pendingLen,
        currentQueueHeadKind:
          providers.currentQueueHeadKind ?? queueDebug.overlayQueueHeadKind,
        currentQueueHeadIdentity: providers.currentQueueHeadIdentity,
        chainAdvanceWaiting: queueDebug.chainAdvanceWaiting,
        notificationChainTransitioning,
        notificationOverlayMounted,
        showLobbyCta,
        ...getCheckHandoffFlags(),
      });
    }
  });

  useLayoutEffect(() => {
    if (!lobbyOpen) return;

    const queueDebug = getConfirmOrbQueueDebugSnapshot();
    const queueClaimsNotificationScreenGuard =
      selectOverlayVisible(notificationRuntimeState);
    const legacyQueueClaimsDiag =
      overlayQueueLength > 0 || shouldBlockLobbyForActiveQueue();
    traceQueueClaimsNotificationScreenIfChanged(
      'InstantBanFlow.lobby-cta-guard-layout',
      {
        queueClaimsNotificationScreen: queueClaimsNotificationScreenGuard,
        overlayQueueLength,
        queueLobbyGuardActive: queueClaimsNotificationScreenGuard,
        guardSnapshot: getQueueLobbyGuardSnapshot(),
        activeOverlayKind,
        activeKind: activeOverlayKind,
        notificationOverlayVisible,
        resultOverlayMounted: Boolean(result),
        showLobbyOrb,
        lobbyChromeHidden,
        renderBranch: lobbyOrbVisible || showBootOrb ? 'lobby' : 'base-null',
        reason: legacyQueueClaimsDiag
          ? 'legacy-diag-still-true'
          : 'runtime-claim',
      },
    );
    const guardDecision = computeLobbyCtaGuardDecision({
      lobbyBootIntroPrimed,
      replyIncomingDeeplinkPending,
      checkDeeplinkDirectPending,
      successToActiveLobbyBlocked,
      overlayHandoffLobbySuppressed,
      successExitDraining,
      postSuccessHandoffBlocking,
      notificationChainTransitioning,
      queueClaimsNotificationScreen: queueClaimsNotificationScreenGuard,
      replyLobbyBlocked,
      bansReturnToLobbyLatch,
      deepLinkRouteBootPending,
      deepLinkReplyBooting,
      incomingReplyBanId,
      incomingGateActive,
      ctaState,
      effectiveBansOverlayOpen,
      notificationQueueUiLock,
    });
    const ctaJsxVisible =
      showLobbyCta &&
      !effectiveBansOverlayOpen &&
      !notificationQueueUiLock;
    const shellMode = sendStarted
      ? 'arena-send'
      : lobbyOpen
        ? 'arena-lobby'
        : 'arena-deep-link';
    const diagPayload = {
      ctaState,
      ctaVisible: ctaJsxVisible,
      showLobbyCta,
      lobbyOpen,
      lobbyReady: lobbyBootIntroPrimed,
      sendStarted,
      notificationOverlayActive,
      overlayQueueLength,
      pendingStartupInteractionsLen: queueDebug.pendingLen,
      shouldBlockLobbyForActiveQueue: shouldBlockLobbyForActiveQueue(),
      chainAdvanceWaiting: queueDebug.chainAdvanceWaiting,
      replyIncomingDeeplinkPending,
      queueClaimsNotificationScreen: queueClaimsNotificationScreenGuard,
      legacyQueueClaimsNotificationScreen: legacyQueueClaimsDiag,
      deepLinkReplyBooting,
      replyDeepLinkBanId,
      shellMode,
      stage: phase,
      activeOverlayKind,
      finalDecision: ctaJsxVisible ? 'render' : 'hide',
      primaryBlocker: guardDecision.primaryBlocker,
      blockReasons: guardDecision.blockers,
      queueGuard: getQueueLobbyGuardSnapshot(),
    };
    const diagSig = JSON.stringify(diagPayload);
    if (diagSig !== ctaRenderDecisionDiagSigRef.current) {
      ctaRenderDecisionDiagSigRef.current = diagSig;
      logCtaRenderDecisionDiag(diagPayload);
    }

    if (!lobbyBootIntroPrimed) return;

    const ctaHiddenReason = resolveLobbyCtaHiddenReason({
      ctaState,
      showLobbyCta,
      effectiveBansOverlayOpen,
      notificationQueueUiLock,
      lobbyBootIntroPrimed,
    });
    const ctaVisible =
      showLobbyCta &&
      !effectiveBansOverlayOpen &&
      !notificationQueueUiLock &&
      (ctaState === 'visible' ||
        ctaState === 'entering' ||
        ctaState === 'exiting');
    logLobbyCtaVisibilityState({
      phase,
      sectionOpen: showBansLayer,
      overlayOpen: effectiveBansOverlayOpen,
      ctaHiddenReason,
      ctaVisible,
    });

    const ctaShellVisible = ctaVisible;
    const emptyOverlayHostBlocked =
      notificationChainTransitioning && !notificationOverlayMounted;

    patchLobbyCtaDebugSnapshot({
      showLobbyChrome,
      showTopNav: showLobbyTopNav,
      ctaVisible: showLobbyCta,
      ctaShellVisible,
      ctaState,
      instantBanOpen: sendFlowOpen || sendStarted,
      phase,
    });

    const payload = {
      source: 'InstantBanFlow-lobbyCta',
      lobbyOpen,
      showLobbyChrome,
      showTopNav: showLobbyTopNav,
      ctaVisible: ctaShellVisible,
      ctaHiddenReason,
      instantBanOpen: sendFlowOpen || sendStarted,
      activeOverlayKind,
      notificationChainTransitioning,
      overlayQueueLen: overlayQueueLength,
      pendingLen: pendingStartupInteractions,
      pendingStartupInteractions,
      incomingLen: incomingGateActive ? 1 : 0,
      checkLen: checkGateActive ? 1 : 0,
      resultLen: result ? 1 : 0,
      hasRenderableOverlay: notificationOverlayMounted,
      emptyOverlayHostBlocked,
      lobbyIndicatorActive: lobbyBansNeedAttention,
      pendingStartupInteractions,
      ctaState,
      showLobbyCtaGuard: showLobbyCta,
      mountBlockers: ctaHiddenReason ? [ctaHiddenReason] : [],
      phase,
      notificationOverlayVisible,
      notificationSessionActive,
      notificationOverlayMounted,
    };

    const sig = JSON.stringify(payload);
    if (sig === lobbyCtaDiagSigRef.current) return;
    lobbyCtaDiagSigRef.current = sig;

    logLobbyCtaRenderCheck(payload);

    if (!ctaShellVisible && lobbyOpen && phase === 'idle') {
      logLobbyCtaReturnNull({
        reason: ctaHiddenReason || 'unknown',
        ...payload,
      });
    }
  }, [
    activeOverlayKind,
    bansReturnToLobbyLatch,
    checkDeeplinkDirectPending,
    checkGateActive,
    ctaState,
    deepLinkReplyBooting,
    deepLinkRouteBootPending,
    effectiveBansOverlayOpen,
    incomingGateActive,
    incomingReplyBanId,
    lobbyBansNeedAttention,
    lobbyBootIntroPrimed,
    lobbyOpen,
    notificationChainTransitioning,
    notificationOverlayActive,
    notificationOverlayMounted,
    notificationOverlayVisible,
    notificationQueueUiLock,
    notificationSessionActive,
    overlayHandoffLobbySuppressed,
    overlayQueueLength,
    pendingStartupInteractions,
    phase,
    postSuccessHandoffBlocking,
    replyIncomingDeeplinkPending,
    replyLobbyBlocked,
    result,
    sendFlowOpen,
    sendStarted,
    showBansLayer,
    showLobbyChrome,
    showLobbyCta,
    showLobbyTopNav,
    successExitDraining,
    successToActiveLobbyBlocked,
  ]);

  useEffect(() => {
    if (!overlayHandoffLobbySuppressed) return;
    if (
      overlayHandoffFromActiveCard ||
      (bansReturnToLobbyLatch && hasPendingNotificationChain())
    ) {
      console.log('[notification-chain-lobby-frame-blocked]', {
        source: overlayHandoffFromActiveCard
          ? 'active-card-close'
          : 'notification-chain',
        overlayQueueLength,
        pendingStartupInteractions,
      });
    }
  }, [
    bansReturnToLobbyLatch,
    hasPendingNotificationChain,
    overlayHandoffFromActiveCard,
    overlayHandoffLobbySuppressed,
    overlayQueueLength,
    pendingStartupInteractions,
  ]);

  useEffect(() => {
    const wasSuppressed = prevOverlayHandoffSuppressedRef.current;
    prevOverlayHandoffSuppressedRef.current = overlayHandoffLobbySuppressed;
    if (wasSuppressed && !overlayHandoffLobbySuppressed) {
      console.log('[overlay-handoff-lobby-visible]', {
        reason: 'handoff-suppress-cleared',
        bansReturnToLobbyLatch,
        overlayQueueLength,
        pendingStartupInteractions,
        lobbyActiveBanOverlayId: lobbyActiveBanOverlay?.id ?? null,
      });
    }
  }, [
    bansReturnToLobbyLatch,
    lobbyActiveBanOverlay?.id,
    overlayHandoffLobbySuppressed,
    overlayQueueLength,
    pendingStartupInteractions,
  ]);

  useEffect(() => {
    const wasLatch = prevBansReturnToLobbyLatchRef.current;
    prevBansReturnToLobbyLatchRef.current = bansReturnToLobbyLatch;
    if (
      wasLatch &&
      !bansReturnToLobbyLatch &&
      overlayQueueLength === 0 &&
      !pendingStartupInteractions
    ) {
      console.log('[overlay-handoff-queue-empty]', {
        overlayQueueLength,
        pendingStartupInteractions,
      });
    }
  }, [
    bansReturnToLobbyLatch,
    overlayQueueLength,
    pendingStartupInteractions,
  ]);

  useLayoutEffect(() => {
    if (prevResultForDismissPathRef.current && !result) {
      resultGoToBansDismissPathRef.current = true;
    }
    prevResultForDismissPathRef.current = result;
  }, [result]);

  useLayoutEffect(() => {
    const prevLen = prevOverlayQueueLengthTraceRef.current;
    const prevHead = prevOverlayQueueHeadKindTraceRef.current;
    const nextLen = overlayQueueLength;
    const nextHead = readOverlayQueueTraceHead().headKind;
    if (prevLen === nextLen && prevHead === nextHead) return;
    const operation: OverlayQueueMutationOperation =
      nextLen === 0
        ? 'clear'
        : nextLen < prevLen
          ? 'dequeue'
          : nextLen > prevLen
            ? 'enqueue'
            : 'replace';
    logOverlayQueueMutationTrace({
      operation,
      source: 'overlayQueueLength-react-state',
      reason: `providers-overlayQueue-length-change len:${prevLen}->${nextLen} head:${prevHead ?? 'null'}->${nextHead ?? 'null'}`,
      phase: 'observe',
      prevLength: prevLen,
      nextLength: nextLen,
      prevHeadKind: prevHead,
      nextHeadKind: nextHead,
    });
    prevOverlayQueueLengthTraceRef.current = nextLen;
    prevOverlayQueueHeadKindTraceRef.current = nextHead;
  }, [
    activeOverlayKind,
    logOverlayQueueMutationTrace,
    overlayQueueLength,
    readOverlayQueueTraceHead,
    result?.id,
  ]);

  useLayoutEffect(() => {
    if (!staleResultQueueClaimActive) {
      if (
        overlayQueueLength === 0 ||
        result ||
        hasAnyOverlayForLobbyCta ||
        (activeOverlayKind != null && activeOverlayKind !== 'result')
      ) {
        resultGoToBansDismissPathRef.current = false;
      }
      return;
    }
    syncQueueLobbyGuardState({
      queueLen: 0,
      pendingLen: pendingStartupInteractions,
      fromQueueResult: false,
      queueShellShowsResult: false,
      phase: 'idle',
      source: 'instant-ban-stale-result-queue-claim-clear',
    });
    traceOverlayQueueMutationBefore(
      'clear',
      'staleResultQueueClaimActive',
      'tryClearExplicitNotificationDrainGuarded:result-dismissed-visual-empty',
    );
    tryClearExplicitNotificationDrainGuarded(
      'instant-ban-stale-result-queue-claim-clear',
      'result-dismissed-visual-empty',
    );
  }, [
    activeOverlayKind,
    hasAnyOverlayForLobbyCta,
    overlayQueueLength,
    pendingStartupInteractions,
    result,
    staleResultQueueClaimActive,
    tryClearExplicitNotificationDrainGuarded,
    traceOverlayQueueMutationBefore,
  ]);

  useEffect(() => {
    if (!overlayHandoffFromActiveCard) return;
    if (
      notificationSessionActive ||
      incomingGateActive ||
      checkGateActive ||
      overlayQueueLength > 0 ||
      hasPendingNotificationChain()
    ) {
      setOverlayHandoffFromActiveCard(false);
      console.log('[overlay-handoff-complete]', {
        toOverlay: activeOverlayKind ?? 'notification-queue',
        overlayQueueLength,
      });
      return;
    }
    if (
      !bansReturnToLobbyLatch &&
      overlayQueueLength === 0 &&
      !pendingStartupInteractions &&
      !isNotificationQueueLocked()
    ) {
      setOverlayHandoffFromActiveCard(false);
      console.log('[overlay-handoff-complete]', {
        toOverlay: 'lobby',
        overlayQueueLength,
      });
    }
  }, [
    activeOverlayKind,
    bansReturnToLobbyLatch,
    checkGateActive,
    hasPendingNotificationChain,
    incomingGateActive,
    notificationSessionActive,
    overlayHandoffFromActiveCard,
    overlayQueueLength,
    pendingStartupInteractions,
  ]);

  useEffect(() => {
    console.log('[LOBBY NAV STATE]', {
      showLobbyTopNav,
      showBansLayer,
      phase,
      banSentSuccess,
      bansOverlayOpen,
      notificationSessionActive,
      notificationQueueUiLock,
      pendingStartupInteractions,
    });
  }, [
    showLobbyTopNav,
    showBansLayer,
    phase,
    banSentSuccess,
    bansOverlayOpen,
    notificationSessionActive,
    notificationQueueUiLock,
    pendingStartupInteractions,
  ]);

  const prevOrbDimRef = useRef(orbOverlayDim);
  useEffect(() => {
    if (prevOrbDimRef.current && !orbOverlayDim) {
      console.log('[LOBBY ORB VISUAL RESET]', {
        phase,
        crossScreenProgress,
        bansOverlayOpen,
        notificationOverlayActive,
      });
    }
    prevOrbDimRef.current = orbOverlayDim;
  }, [
    orbOverlayDim,
    phase,
    crossScreenProgress,
    bansOverlayOpen,
    notificationOverlayActive,
  ]);

  const prevNotificationOverlayRef = useRef(notificationOverlayActive);
  useEffect(() => {
    const wasActive = prevNotificationOverlayRef.current;
    prevNotificationOverlayRef.current = notificationOverlayActive;
    if (
      wasActive &&
      !notificationOverlayActive &&
      phase === 'idle' &&
      !banSentSuccess &&
      crossScreenProgressRef.current > 0.02
    ) {
      stopCrossScreenAnim();
      screenTransitionRef.current = null;
      setScreenTransition(null);
      setComposeExitProgress(0);
      setComposeDismissing(false);
      setCrossScreenProgressImmediate(0);
      console.log('[LOBBY ORB VISUAL RESET]', {
        phase,
        reason: 'notification-overlay-closed',
        crossScreenProgress: 0,
        bansOverlayOpen,
        notificationOverlayActive: false,
      });
    }
  }, [
    banSentSuccess,
    bansOverlayOpen,
    notificationOverlayActive,
    phase,
    setCrossScreenProgressImmediate,
    stopCrossScreenAnim,
  ]);

  const handleCloseBansOverlayRef = useRef<() => void>(() => {});
  const resetSendUiForBansCtaRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (phase === 'idle' || !bansOverlayOpen) return;
    console.log('[BANS CLOSE] phase-forced-close', {
      phase,
      origin: bansNavState.origin,
      returnTarget: bansNavState.returnTarget,
    });
    if (
      bansNavState.origin === 'result-cta' ||
      bansCtaQueueSuppress
    ) {
      resetSendUiForBansCtaRef.current();
      return;
    }
    setBansOverlayOpen(false);
    setSelectedBanForDetails(null);
  }, [
    bansCtaQueueSuppress,
    bansNavState.origin,
    bansNavState.returnTarget,
    bansOverlayOpen,
    phase,
  ]);

  useEffect(() => {
    const uid = user?.id ?? null;
    if (historyUserIdRef.current !== uid) {
      historyUserIdRef.current = uid;
      setHistoryBans([]);
      setSavedBans([]);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!bansOverlayOpen || !token || !user?.id) return;
    const fetchForUserId = user.id;
    const historyGen = ++historyFetchGenRef.current;
    void api<{ items: BanInteraction[] }>('/bans/history', { token })
      .then((res) => {
        if (historyFetchGenRef.current !== historyGen) return;
        if (historyUserIdRef.current !== fetchForUserId) return;
        setHistoryBans(Array.isArray(res.items) ? res.items : []);
      })
      .catch(() => {
        /* keep cached history on background refresh errors */
      });

    const savedGen = ++savedFetchGenRef.current;
    void getSavedBans(token)
      .then((items) => {
        if (savedFetchGenRef.current !== savedGen) return;
        if (historyUserIdRef.current !== fetchForUserId) return;
        setSavedBans(items);
      })
      .catch(() => {
        /* keep cached archive on background refresh errors */
      });
  }, [bansOverlayOpen, token, user?.id]);

  const handleToggleSave = useCallback(
    (ban: BanInteraction) => {
      if (!token || !ban.id) return;

      let wasSaved = false;
      setSavedBans((prev) => {
        wasSaved = prev.some((b) => b.id === ban.id);
        if (wasSaved) {
          return prev.filter((b) => b.id !== ban.id);
        }
        if (prev.some((b) => b.id === ban.id)) return prev;
        return [ban, ...prev];
      });

      setArchiveToast(
        wasSaved ? 'Удалено из архива' : 'Добавлено в архив',
      );
      haptic('light');
      hapticSuccess();

      void (async () => {
        try {
          if (wasSaved) {
            await unsaveBan(token, ban.id);
          } else {
            await saveBan(token, ban.id);
          }
        } catch {
          setSavedBans((prev) => {
            const isSaved = prev.some((b) => b.id === ban.id);
            if (wasSaved) {
              if (isSaved) return prev;
              return [ban, ...prev];
            }
            if (!isSaved) return prev;
            return prev.filter((b) => b.id !== ban.id);
          });
          setArchiveToast('Не удалось обновить архив');
        }
      })();
    },
    [haptic, hapticSuccess, token],
  );

  const handleRemoveFromArchive = useCallback(
    (ban: BanInteraction) => {
      if (!token || !ban.id) return;

      let wasSaved = false;
      setSavedBans((prev) => {
        wasSaved = prev.some((b) => b.id === ban.id);
        return prev.filter((b) => b.id !== ban.id);
      });
      if (!wasSaved) return;

      setArchiveToast('Удалено из архива');
      haptic('light');
      hapticSuccess();

      void (async () => {
        try {
          await unsaveBan(token, ban.id);
        } catch {
          setSavedBans((prev) => {
            if (prev.some((b) => b.id === ban.id)) return prev;
            return [ban, ...prev];
          });
          setArchiveToast('Не удалось обновить архив');
        }
      })();
    },
    [haptic, hapticSuccess, token],
  );

  const handleArchiveDeleteModeEnter = useCallback(() => {
    haptic('light');
  }, [haptic]);

  const beginRepeatBanFlow = useCallback(
    (
      ban: BanInteraction,
      options?: {
        goToConfirm?: boolean;
        fromArchive?: boolean;
        bansOverlayTab?: BansTab;
      },
    ) => {
      const logArchive = options?.fromArchive === true;

      lockNotificationQueue('repeat-ban-flow', ban.id);
      logOverlayPriority('repeat-flow-start', { banId: ban.id });

      if (!user?.id) {
        if (logArchive) {
          console.info('[98+] ARCHIVE REPEAT FALLBACK', { reason: 'no-user' });
        }
        return false;
      }

      const opponent = opponentForBan(ban, user.id);
      if (!opponent?.id) {
        if (logArchive) {
          console.info('[98+] ARCHIVE REPEAT FALLBACK', { reason: 'no-opponent' });
        }
        sendEntryPhaseRef.current = 'selectingTarget';
        setBansOverlayOpen(false);
        setSelectedBanForDetails(null);
        clearCtaExitTimer();
        clearWhoPanelEnterTimer();
        setCtaState('hidden');
        onStartSend();
        leaveWhoForLegacyRef.current = false;
        dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });
        return false;
      }

      const { card: friend, source } = resolveOpponentFriendCard(
        opponent,
        safeFriends,
      );
      const text = ban.text?.trim() ?? '';
      const duration = isValidDurationMinutes(ban.durationMinutes)
        ? ban.durationMinutes
        : DEFAULT_DURATION_MINUTES;
      const wantConfirm = options?.goToConfirm ?? true;
      const canConfirm = wantConfirm && text.length >= 3;
      const targetPhase: SendFlowPhase = canConfirm
        ? 'confirming'
        : text.length > 0
          ? 'composingBan'
          : 'selectingTarget';

      if (logArchive) {
        console.info('[98+] ARCHIVE REPEAT OPPONENT', {
          opponentId: opponent.id,
          username: opponent.username,
          source,
        });
        console.info('[98+] ARCHIVE REPEAT TARGET READY', {
          selectedUserId: friend.userId ?? friend.id,
        });
        if (targetPhase === 'confirming') {
          console.info('[98+] ARCHIVE REPEAT TO CONFIRM');
        } else {
          console.info('[98+] ARCHIVE REPEAT FALLBACK', {
            reason:
              text.length < 3
                ? 'short-text'
                : targetPhase === 'composingBan'
                  ? 'what-prefill'
                  : 'no-text',
          });
        }
      }

      sendEntryPhaseRef.current = targetPhase;

      setBansOverlayOpen(false);
      setSelectedBanForDetails(null);
      clearCtaExitTimer();
      clearWhoPanelEnterTimer();
      setCtaState('hidden');
      setSelectedUser(friend);
      setBanText(text);
      setDurationMinutes(duration);
      setSendError(null);
      setComposeExitProgress(0);
      setComposeDismissing(false);
      traceSuccessStateReset('beginRepeatBanFlow', { targetPhase });
      traceSuccessHide('beginRepeatBanFlow');
      setBanSentSuccess(false);
      traceSuccessSnapshotCleared('beginRepeatBanFlow');
      sendSnapshotRef.current = null;
      setCrossScreenProgressImmediate(1);

      if (targetPhase === 'confirming') {
        setConfirmEnterKey((k) => k + 1);
        confirmEntrySourceRef.current = options?.bansOverlayTab
          ? { type: 'bans-overlay', tab: options.bansOverlayTab }
          : 'send-flow';
      }

      onStartSend();
      if (targetPhase === 'selectingTarget') {
        leaveWhoForLegacyRef.current = false;
        dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });
      } else if (targetPhase === 'composingBan') {
        leaveWhoForLegacyRef.current = false;
        dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHAT' });
        setPhase('composingBan', 'notification-owner-what-projection');
      } else {
        // confirming — NotificationOwner CONFIRM
        leaveWhoForLegacyRef.current = false;
        dispatchNotificationOwnerBootLobby({ type: 'OPEN_CONFIRM' });
        setPhase('confirming', 'notification-owner-confirm-projection');
      }

      return true;
    },
    [
      clearCtaExitTimer,
      clearWhoPanelEnterTimer,
      onStartSend,
      safeFriends,
      setCrossScreenProgressImmediate,
      setPhase,
      user?.id,
    ],
  );

  const beginComposingBanForOpponent = useCallback(
    (
      opponent: UserPublic,
      options?: { skipLobbyStart?: boolean },
    ) => {
      if (!user?.id) return false;
      if (!opponent?.id && !opponent?.username) return false;

      const replyBanId = incomingReplyBanId ?? null;
      if (replyBanId) {
        const queueDebug = getConfirmOrbQueueDebugSnapshot();
        abortPostSuccessHandoffForReplyCompose(
          'beginComposingBanForOpponent',
          replyBanId,
          {
            pendingLen: queueDebug.pendingLen,
            queueLen: queueDebug.queueLen,
            flowMode: 'incoming-reply',
          },
        );
      }

      const { card: friend } = resolveOpponentFriendCard(opponent, safeFriends);
      const friendKey =
        friend.userId ?? friend.id ?? friend.username ?? null;

      sendEntryPhaseRef.current = 'composingBan';
      setBansOverlayOpen(false);
      setSelectedBanForDetails(null);
      clearCtaExitTimer();
      clearWhoPanelEnterTimer();
      setCtaState('hidden');
      setSelectedUser((prev) => {
        const prevKey = prev?.userId ?? prev?.id ?? prev?.username ?? null;
        if (prevKey && friendKey && prevKey === friendKey) return prev;
        return friend;
      });
      setBanText('');
      setDurationMinutes(DEFAULT_DURATION_MINUTES);
      setSendError(null);
      setComposeExitProgress(0);
      setComposeDismissing(false);
      traceSuccessStateReset('beginComposingBanForOpponent');
      traceSuccessHide('beginComposingBanForOpponent');
      setBanSentSuccess(false);
      traceSuccessSnapshotCleared('beginComposingBanForOpponent');
      sendSnapshotRef.current = null;
      leaveWhoForLegacyRef.current = false;
      dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHAT' });
      if (phase !== 'composingBan') {
        setPhase('composingBan', 'notification-owner-what-projection');
      } else {
        logReplyFlowLoopGuard('skip already composingBan');
      }
      setCrossScreenProgressImmediate(1);
      setCtaState('hidden');
      if (!options?.skipLobbyStart && !sendStarted) {
        onStartSend();
      }
      const holdDebug = getConfirmHoldDebugSnapshot();
      logBeginComposingReplyState({
        source: 'beginComposingBanForOpponent',
        banId: getPinnedReplyToBanId() ?? incomingReplyBanId ?? null,
        replyBanId: getPinnedReplyToBanId() ?? incomingReplyBanId ?? null,
        opponentId:
          friend.userId ?? friend.id ?? friend.username ?? null,
        text: '',
        duration: DEFAULT_DURATION_MINUTES,
        durationMinutes: DEFAULT_DURATION_MINUTES,
        successVisible: false,
        successSnapshotExists: false,
        activeUserCardHold: holdDebug.activeUserCardHold,
        activeOverlayKind,
        instantBanOpen: sendFlowOpen || sendStarted,
        confirmStep: 'composingBan',
        priorPhase: phase,
        overlayInputLocked: holdDebug.overlayInputLocked,
        overlayInputLockSource: holdDebug.overlayInputLockSource,
        notificationChainAwaitingUser: holdDebug.notificationChainAwaitingUser,
      });
      const queueDebug = getConfirmOrbQueueDebugSnapshot();
      if (queueDebug.isPostSuccessHandoffInProgress) {
        logPostSuccessHandoffStillActiveDuringReply({
          source: 'beginComposingBanForOpponent',
          phase: 'composingBan',
          priorPhase: phase,
          flowMode: 'incoming-reply',
          replyBanId: getPinnedReplyToBanId() ?? incomingReplyBanId ?? null,
          ...queueDebug,
        });
      }
      return true;
    },
    [
      activeOverlayKind,
      clearCtaExitTimer,
      clearWhoPanelEnterTimer,
      getConfirmHoldDebugSnapshot,
      getConfirmOrbQueueDebugSnapshot,
      getPinnedReplyToBanId,
      incomingReplyBanId,
      onStartSend,
      phase,
      safeFriends,
      sendFlowOpen,
      sendStarted,
      setCrossScreenProgressImmediate,
      user?.id,
    ],
  );

  const beginIncomingReplyFromDeepLink = useCallback(
    (ban: BanInteraction) => {
      if (!user?.id) return false;
      if (isReplyDeeplinkShellBan(ban)) return false;
      const opponent = opponentForBan(ban, user.id);
      if (!opponent?.id || opponent.id === user.id) {
        return false;
      }
      return beginComposingBanForOpponent(opponent, { skipLobbyStart: true });
    },
    [beginComposingBanForOpponent, user?.id],
  );

  const beginActiveBanFromDeepLink = useCallback(
    (ban: BanInteraction) => {
      logOpenActiveBanCard(ban.id, 'beginActiveBanFromDeepLink');
      resolvePendingDeepLinkRoute('active-ban', ban.id);
      setBansTab('yours');
      setSelectedBanForDetails(ban);
      setBansOverlayOpen(true);
      releaseOwnerWhoToLobby();
      setPhase('idle');
      setCtaState('hidden');
      onStartSend();
      return true;
    },
    [onStartSend, releaseOwnerWhoToLobby],
  );

  const prepareLobbyBaseAfterSuccess = useCallback(
    (
      source: string,
      opts?: { preserveActiveOverlay?: boolean; deferLobbyOpen?: boolean },
    ) => {
      const closedBansOverlay =
        bansOverlayOpen ||
        selectedBanForDetails != null ||
        (!opts?.preserveActiveOverlay && lobbyActiveBanOverlay != null) ||
        bansCtaQueueSuppress ||
        resultCtaBansOverlayOpen;
      if (closedBansOverlay) {
        console.log('[bans-overlay-force-close-after-success]', { reason: source });
      }
      setBansOverlayOpen(false);
      setSelectedBanForDetails(null);
      if (!opts?.preserveActiveOverlay) {
        setLobbyActiveBanOverlay(null);
      }
      if (bansCtaQueueSuppress) clearBansCtaQueueSuppress();
      if (resultCtaBansOverlayOpen) clearResultCtaBansOverlayOpen();
      resetBansNavState();
      setBansReturnToLobbyLatch(true, {
        source: `prepareLobbyBaseAfterSuccess:${source}`,
      });
      if (!opts?.deferLobbyOpen) {
        // V1: reject host lobby open only when runtime forbids (selectLobbyMayShow).
        // Legacy queue-lobby-guard / overlayQueueLength must not block.
        if (!runtimeLobbyMayShowStrict) {
          logLobbyOpenRejectedQueueActive({
            source: `prepareLobbyBaseAfterSuccess:${source}`,
            ...getQueueLobbyGuardSnapshot(),
            runtimeLobbyMayShow: runtimeLobbyMayShowStrict,
            runtimeOverlayVisible: selectOverlayVisible(
              notificationRuntimeState,
            ),
          });
          return;
        }
        if (isPostSuccessHandoffInProgress()) {
          logPostSuccessHandoffPreventBaseLobby({
            source,
            deferLobbyOpen: false,
            closedBansOverlay,
            queueLen: overlayQueueLength,
            pendingStartup: pendingStartupInteractions,
          });
          return;
        }
        logSuccessExitLobbyOpenAttempt({
          source: `prepareLobbyBaseAfterSuccess:${source}`,
          via: 'openLobby',
        });
        openLobby(`success-exit-${source}`);
        console.log('[success-exit-base-lobby]', {
          source,
          closedBansOverlay,
          lobbyOpen: true,
        });
        window.__debug98log?.('[success-exit-base-lobby]', {
          source,
          closedBansOverlay,
          lobbyOpen: true,
        });
      } else {
        if (isPostSuccessHandoffInProgress()) {
          logPostSuccessHandoffPreventBaseLobby({
            source,
            deferLobbyOpen: true,
            closedBansOverlay,
            queueLen: overlayQueueLength,
            pendingStartup: pendingStartupInteractions,
          });
        }
        console.log('[success-exit-base-lobby]', {
          source,
          closedBansOverlay,
          lobbyOpen: false,
          deferred: true,
        });
        window.__debug98log?.('[success-exit-base-lobby]', {
          source,
          closedBansOverlay,
          lobbyOpen: false,
          deferred: true,
        });
      }
    },
    [
      bansCtaQueueSuppress,
      bansOverlayOpen,
      clearBansCtaQueueSuppress,
      clearResultCtaBansOverlayOpen,
      hasPendingNotificationChain,
      lobbyActiveBanOverlay,
      notificationRuntimeState,
      openLobby,
      overlayQueueLength,
      pendingStartupInteractions,
      resetBansNavState,
      resultCtaBansOverlayOpen,
      runtimeLobbyMayShowStrict,
      selectedBanForDetails,
      setBansReturnToLobbyLatch,
    ],
  );

  const handleRepeatBanFromArchive = useCallback(
    (ban: BanInteraction) => {
      console.info('[98+] ARCHIVE REPEAT CLICK', { banId: ban.id });
      haptic('light');
      beginRepeatBanFlow(ban, {
        fromArchive: true,
        goToConfirm: true,
        bansOverlayTab: 'archive',
      });
    },
    [beginRepeatBanFlow, haptic],
  );

  const handleOpenBansOverlay = useCallback(() => {
    const queueDebug = getConfirmOrbQueueDebugSnapshot();
    const emitStartDrainEntryTrace = (
      source: string,
      extra: {
        willCallStartDrain?: boolean;
        willStartDrain?: boolean | null;
        earlyReturnReason?: string | null;
        skipReason?: string | null;
      } = {},
    ) => {
      logStartDrainEntryTrace({
        source,
        telegramUserId: user?.id ?? null,
        bansTab,
        lobbyOpen,
        showLobby: showLobbyTopNav,
        activeKind: activeOverlayKind ?? null,
        activeBanId:
          activeBanDeepLinkBanId ??
          queueDebug.incomingBanId ??
          result?.id ??
          null,
        queueLen: overlayQueueLength,
        pendingLen: pendingStartupInteractions,
        queueHeadKind: queueDebug.selectedNextKind,
        queueHeadBanId: queueDebug.selectedNextBanId,
        lobbyBansNeedAttention,
        indicatorVisible: lobbyBansNeedAttention,
        notificationSessionActive,
        notificationChainTransitioning,
        notificationQueueUiLock,
        queueClaimsNotificationScreen,
        overlayQueueLength,
        hasAnyOverlay: hasAnyOverlayForLobbyCta,
        hasIncomingOverlay: incomingGateActive,
        hasResultOverlay: Boolean(result),
        hasNotificationOverlay:
          notificationOverlayMounted || notificationOverlayVisible,
        effectiveBansOverlayOpen,
        ...extra,
      });
    };

    const plan = planLobbyBansOpenNavigation({
      phaseIsIdle: phase === 'idle',
      banSentSuccess,
      runtimeDraining: selectIsDraining(notificationRuntimeState),
      alreadyOpen: bansOverlayOpen || bansLayerUiOpen,
      openInFlight: bansOpenInFlightRef.current,
    });
    const blockedReason = plan.blockReason;
    const willOpen = plan.openImmediately;

    emitStartDrainEntryTrace('handleOpenBansOverlay:entry', {
      willCallStartDrain: willOpen,
      willStartDrain: willOpen,
      skipReason: blockedReason,
    });

    logLobbyBansCtaClickTrace({
      clickSurface: 'handleOpenBansOverlay',
      telegramUserId: user?.id ?? null,
      clicked: true,
      ctaState,
      showLobbyCta,
      showLobbyTopNav,
      bansNeedAttention: lobbyBansNeedAttention,
      lobbyOpen,
      instantBanOpen: sendFlowOpen || sendStarted,
      notificationChainTransitioning,
      notificationQueueUiLock,
      activeOverlayKind: activeOverlayKind ?? null,
      willCallStartLobbyBansNotificationDrain: false,
      blockedReason,
    });
    logQueueAppearanceReactionTrace({
      source: 'handleOpenBansOverlay:click',
      telegramUserId: user?.id ?? null,
      prevQueueLen: overlayQueueLength,
      nextQueueLen: overlayQueueLength,
      prevPendingLen: pendingStartupInteractions,
      nextPendingLen: pendingStartupInteractions,
      lobbyBansNeedAttention,
      indicatorVisible: lobbyBansNeedAttention,
      lobbyOpen,
      showLobby: showLobbyTopNav,
      notificationChainTransitioning,
      queueHeadKind: null,
      willStartOnClick: willOpen,
      willAutoStartDrain: false,
      skipReason: blockedReason,
    });
    logLobbyBansClick({
      phase: 'handleOpenBansOverlay-entry',
      lobbyBansNeedAttention,
      pendingStartupInteractionsLen: pendingStartupInteractions,
      refQueueLen: overlayQueueLength,
      selectedAction: willOpen ? 'sync-open-section' : 'ignored',
      reason: blockedReason ?? 'sync-open-then-background-prefetch',
      notificationDrainActive: notificationChainTransitioning,
    });
    logQueueSourceComparisonSnapshot('lobby-bans-cta-click');

    if (!willOpen) {
      emitStartDrainEntryTrace('handleOpenBansOverlay:early-return-blocked', {
        willCallStartDrain: false,
        willStartDrain: false,
        earlyReturnReason: blockedReason,
        skipReason: blockedReason,
      });
      logLobbyBansClickDecisionDiag({
        source: 'handleOpenBansOverlay',
        decision: 'ignored',
        reason: blockedReason ?? 'unknown',
        indicatorVisible: lobbyBansNeedAttention,
      });
      logLobbyBansDrainNotEntered({
        reason: blockedReason ?? 'unknown',
        telegramUserId: user?.id ?? null,
        source: 'handleOpenBansOverlay',
      });
      return;
    }

    bansOpenInFlightRef.current = true;
    clearActiveBanDeepLinkShell('lobby-bans-button');
    closeSendFlow();
    logLobbyBansClickDecisionDiag({
      source: 'handleOpenBansOverlay',
      decision: 'open-section-sync',
      reason: 'sync-navigation-before-prefetch',
      indicatorVisible: lobbyBansNeedAttention,
    });
    resetBansNavState();
    const targetTab = openBansOverlayTabRequest ?? 'yours';
    setBansTab(targetTab);
    setSelectedBanForDetails(null);
    setBansOverlayOpen(true);
    // Synchronous product-surface gate — must beat any in-flight bootstrap autoShow
    // before React useEffect would update arena refs (paint-after-showHead race).
    setArenaOverlayGuardState({ bansOverlayOpen: true });
    console.log('BANS_SECTION_STATE_SET', {
      t: performance.now(),
      bansOverlayOpen: true,
      presentationIntent: 'DATA_REFRESH_ONLY',
    });
    noteBansLayerOpenAllowed(
      'handleOpenBansOverlay',
      'lobby-explicit-click-commit-sync',
      'lobby-explicit',
    );

    // Background prefetch only — never mount notification cards over bans.
    if (plan.runBackgroundPrefetch) {
      clearSharedSkipResultsPrefetchForExplicitDrain(
        'handleOpenBansOverlay:after-sync-open',
      );
      void Promise.resolve(prefetchPendingAfterLobbyBansOpen())
        .catch(() => {
          /* keep bans overlay open on prefetch failure */
        })
        .finally(() => {
          bansOpenInFlightRef.current = false;
        });
    } else {
      bansOpenInFlightRef.current = false;
    }
  }, [
    activeBanDeepLinkBanId,
    activeOverlayKind,
    banSentSuccess,
    bansLayerUiOpen,
    bansOverlayOpen,
    bansTab,
    clearActiveBanDeepLinkShell,
    closeSendFlow,
    ctaState,
    effectiveBansOverlayOpen,
    getConfirmOrbQueueDebugSnapshot,
    hasAnyOverlayForLobbyCta,
    incomingGateActive,
    lobbyOpen,
    logQueueSourceComparisonSnapshot,
    logLobbyBansClickDecisionDiag,
    noteBansLayerOpenAllowed,
    notificationChainTransitioning,
    notificationOverlayMounted,
    notificationOverlayVisible,
    notificationQueueUiLock,
    notificationSessionActive,
    phase,
    queueClaimsNotificationScreen,
    resetBansNavState,
    sendFlowOpen,
    sendStarted,
    showLobbyCta,
    showLobbyTopNav,
    lobbyBansNeedAttention,
    setArenaOverlayGuardState,
    clearSharedSkipResultsPrefetchForExplicitDrain,
    prefetchPendingAfterLobbyBansOpen,
    openBansOverlayTabRequest,
    user?.id,
    pendingStartupInteractions,
    overlayQueueLength,
    notificationRuntimeState,
    result,
  ]);

  const handleOpenSettings = useCallback(() => {
    if (phase !== 'idle' || banSentSuccess) return;
    setSettingsOverlayOpen(true);
  }, [banSentSuccess, phase]);

  const handleCloseSettings = useCallback(() => {
    setSettingsOverlayOpen(false);
  }, []);

  // Profile section — same open rule as Settings (idle lobby only). Never touches
  // the notification queue / overlay owner. Opened from the lobby top nav.
  const handleOpenProfile = useCallback(() => {
    if (phase !== 'idle' || banSentSuccess) return;
    setMonetizationOpen(true);
  }, [banSentSuccess, phase]);

  const handleCloseProfile = useCallback(() => {
    setMonetizationOpen(false);
  }, []);

  /**
   * Relationship analytics START_BAN → WhatScreen (skip Who).
   *
   * Verified mapping in InstantBanFlow:
   * - selectingTarget + crossScreenProgress≈0 → WhoOverlay
   * - composingBan + crossScreenProgress=1 → WhatScreen
   * - handleSelectUser prep + animate → completeWhoToWhat() sets composingBan + progress=1
   *
   * From analytics (idle + monetization) we apply the completeWhoToWhat end-state
   * immediately (no Who flash), plus onStartSend like beginComposingBanForOpponent
   * when send is not already started.
   */
  const handleStartBanFromAnalytics = useCallback(
    (peer: {
      userId: string;
      displayName: string;
      avatarUrl?: string | null;
    }): boolean => {
      const peerUserId = peer.userId.trim();
      const friend = safeFriends.find(
        (item) => (item.userId ?? '').trim() === peerUserId,
      );

      if (!friend) {
        console.warn('[ANALYTICS_START_BAN_PEER_NOT_FOUND]', {
          peerUserId: peer.userId,
        });
        return false;
      }

      // Close analytics/monetization first — keep selectedUser/phase until friend resolved.
      setMonetizationOpen(false);

      // Same prep as handleSelectUser (after friend chosen on Who):
      setSelectedUser(friend);
      setBanText('');
      setDurationMinutes(DEFAULT_DURATION_MINUTES);
      setSendError(null);
      setComposeExitProgress(0);
      setComposeDismissing(false);

      // Same end-state as completeWhoToWhat (skip Who animation / flash):
      screenTransitionRef.current = null;
      setScreenTransition(null);
      sendEntryPhaseRef.current = 'composingBan';
      clearCtaExitTimer();
      clearWhoPanelEnterTimer();
      setCtaState('hidden');
      setCrossScreenProgressImmediate(1);
      leaveWhoForLegacyRef.current = false;
      dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHAT' });
      setPhase('composingBan', 'notification-owner-what-projection');

      // Opening send from outside Who (lobby was idle) — same gate as beginComposingBanForOpponent.
      if (!sendStarted) {
        onStartSend();
      }

      return true;
    },
    [
      clearCtaExitTimer,
      clearWhoPanelEnterTimer,
      onStartSend,
      safeFriends,
      sendStarted,
      setCrossScreenProgressImmediate,
    ],
  );

  const handleNotificationModeChange = useCallback(
    async (mode: NotificationMode) => {
      setSettingsModeSaving(true);
      await updateNotificationMode(mode);
      setSettingsModeSaving(false);
    },
    [updateNotificationMode],
  );

  useEffect(() => {
    setArenaOverlayGuardState({
      bansOverlayOpen: effectiveBansOverlayOpen,
      // Profile/Premium/Payment Sheet reuse the existing settings-section rule
      // so live-notification guards treat them like any other normal section.
      settingsOverlayOpen: settingsOverlayOpen || monetizationOpen,
    });
  }, [
    effectiveBansOverlayOpen,
    settingsOverlayOpen,
    monetizationOpen,
    setArenaOverlayGuardState,
  ]);

  const resetSendUiForBansCta = useCallback(() => {
    if (isReplyQueueHandoffSessionActive()) {
      logReplyQueueHandoffDiag('after-reply-success', 'resetSendUiForBansCta', {
        handoffBlockedReason: 'reset-send-ui-for-bans-cta',
      });
    }
    sendEntryPhaseRef.current = null;
    activeBanRepeatComposeRef.current = false;
    stopCrossScreenAnim();
    screenTransitionRef.current = null;
    setScreenTransition(null);
    setSelectedUser(null);
    setBanText('');
    setSendError(null);
    setWhoExitActive(false);
    setWhoDismissProgress(0);
    setComposeExitProgress(0);
    setComposeDismissing(false);
    setCrossScreenProgressImmediate(0);
    traceSuccessStateReset('resetSendUiForBansCta', { nextPhase: 'idle' });
    traceSuccessHide('resetSendUiForBansCta');
    setBanSentSuccess(false);
    traceSuccessSnapshotCleared('resetSendUiForBansCta');
    sendSnapshotRef.current = null;
    setCtaState('hidden');
    releaseOwnerWhoToLobby();
    setPhase('idle');
  }, [
    logReplyQueueHandoffDiag,
    releaseOwnerWhoToLobby,
    setCrossScreenProgressImmediate,
    stopCrossScreenAnim,
  ]);

  const resetSendUiForBansNavigation = useCallback(() => {
    const needsComposeReset =
      phase !== 'idle' ||
      sendStarted ||
      sendFlowOpen ||
      banSentSuccess ||
      replyComposeActive;
    if (!needsComposeReset) {
      return;
    }
    resetSendUiForBansCta();
  }, [
    banSentSuccess,
    phase,
    replyComposeActive,
    resetSendUiForBansCta,
    sendFlowOpen,
    sendStarted,
  ]);

  const restoreLobbyCtaAfterBansSectionClose = useCallback(
    (previousSection: string) => {
      if (phase !== 'idle' || banSentSuccess || replyComposeActive) {
        return;
      }
      beginCtaSpringIn();
      logLobbyCtaRestoreAfterSectionClose({
        previousSection,
        nextPhase: 'idle',
        ctaVisible: true,
      });
    },
    [banSentSuccess, beginCtaSpringIn, phase, replyComposeActive],
  );

  useLayoutEffect(() => {
    resetSendUiForBansCtaRef.current = resetSendUiForBansCta;
  }, [resetSendUiForBansCta]);

  useLayoutEffect(() => {
    registerResetSendUiForBansNavigation(resetSendUiForBansNavigation);
    return () => registerResetSendUiForBansNavigation(null);
  }, [registerResetSendUiForBansNavigation, resetSendUiForBansNavigation]);

  const handleOpenBansFromResultCta = useCallback((): boolean => {
    if (
      !canOpenBansLayerNow(
        'handleOpenBansFromResultCta',
        'result-cta-open',
        'result-cta-fallback',
      )
    ) {
      console.log('[BANS OVERLAY OPENED]', {
        ok: false,
        reason: 'bans-layer-gate-blocked',
      });
      return false;
    }
    if (hasPendingNotificationChain()) {
      console.log('[notification-chain-open-bans-deferred]', {
        source: 'handleOpenBansFromResultCta',
        reason: 'queue-not-empty',
      });
      return false;
    }
    if (banSentSuccess) {
      console.log('[BANS OVERLAY OPENED]', {
        ok: false,
        reason: 'ban-sent-success',
      });
      return false;
    }
    if (bansCtaQueueSuppress) {
      resetSendUiForBansCta();
    } else if (phase !== 'idle') {
      console.log('[open-bans-from-result-cta]', {
        action: 'blocked',
        phase,
        bansCtaQueueSuppress,
      });
      return false;
    }
    const targetTab = openBansOverlayTabRequest ?? 'yours';
    console.log('[go-to-bans-target-tab]', {
      source: 'handleOpenBansFromResultCta',
      targetTab,
      openBansOverlayTabRequest,
    });
    window.__debug98log?.('[go-to-bans-target-tab]', {
      source: 'handleOpenBansFromResultCta',
      targetTab,
      openBansOverlayTabRequest,
    });
    console.log('[open-bans-from-result-cta]', {
      action: 'open',
      direct: true,
      bansCtaQueueSuppress,
      phase,
      notificationQueueUiLock:
        notificationSessionActive || notificationOverlayActive,
      targetTab,
    });
    setBansTab(targetTab);
    setSelectedBanForDetails(null);
    setBansOverlayOpen(true);
    noteBansLayerOpenAllowed(
      'handleOpenBansFromResultCta',
      'result-cta-open-commit',
      'result-cta-fallback',
    );
    console.log('[notification-chain-open-bans-final]', {
      source: 'handleOpenBansFromResultCta',
      reason: 'queue-empty',
    });
    console.log('[BANS OVERLAY OPENED]', {
      ok: true,
      tab: targetTab,
      bansCtaQueueSuppress,
      phase,
    });
    resultGoToBansDismissPathRef.current = true;
    traceOverlayQueueMutationBefore(
      'prune',
      'handleOpenBansFromResultCta',
      'go-to-bans-open-bans-overlay',
      { itemKind: 'result', itemResultId: result?.id ?? null },
    );
    return true;
  }, [
    banSentSuccess,
    bansCtaQueueSuppress,
    canOpenBansLayerNow,
    hasPendingNotificationChain,
    noteBansLayerOpenAllowed,
    notificationSessionActive,
    notificationOverlayActive,
    openBansOverlayTabRequest,
    phase,
    resetSendUiForBansCta,
    result?.id,
    traceOverlayQueueMutationBefore,
  ]);

  const handleOpenBansFromResultCtaRef = useRef(handleOpenBansFromResultCta);
  handleOpenBansFromResultCtaRef.current = handleOpenBansFromResultCta;

  const scheduleLobbyVisibilityCheck = useCallback(
    (source: string) => {
      const readDomEl = (el: Element | null) => {
        if (!el) return null;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          zIndex: style.zIndex,
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          },
        };
      };

      const runCheck = () => {
        const lobbyRoot = document.querySelector(
          '.instant-ban-arena-send.instant-ban-flow',
        );
        const lobbyCta = document.querySelector('.instant-ban-lobby-cta');
        const orbRoot = document.querySelector('[data-orb-root]');
        const notificationLayer = document.querySelector(
          '[data-notification-layer]',
        );
        const directLayer = document.querySelector('[data-direct-overboard-result]');
        const check = {
          lobbyRootFound: lobbyRoot != null,
          orbFound: orbRoot != null,
          ctaFound: lobbyCta != null,
          lobbyRoot: readDomEl(lobbyRoot),
          orb: readDomEl(orbRoot),
          cta: readDomEl(lobbyCta),
          notificationLayerFound: notificationLayer != null,
          directOverboardLayerFound: directLayer != null,
          lobbyOpen,
          instantBanOpen: sendStarted,
          sendStarted,
          sendFlowOpen,
          phase,
          bansOverlayOpen: bansOverlayOpenRef.current,
          showBansLayer: showBansLayerRef.current,
          effectiveBansOverlayOpen: effectiveBansOverlayOpenRef.current,
          resultCtaBansOverlayOpen,
          bansCtaQueueSuppress,
          bansReturnToLobbyLatch,
          notificationQueueUiLock:
            notificationSessionActive || notificationOverlayActive,
          notificationOverlayActive,
          incomingGateActive,
          replyLobbyBlocked,
          replyUiShellActive,
          activeBanUiShellActive,
          replyDeepLinkBanId,
          incomingReplyBanId,
          resultReplyHandoffLock,
          activeOverlayKind,
          ctaState,
          banSentSuccess,
          showLobbyCta,
          source,
        };
        console.log('[LOBBY DOM CHECK]', check);
        markVisibleOverboardTrace('[LOBBY DOM CHECK]', check);
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(runCheck);
      });
    },
    [
      activeBanUiShellActive,
      activeOverlayKind,
      banSentSuccess,
      bansCtaQueueSuppress,
      bansReturnToLobbyLatch,
      ctaState,
      incomingGateActive,
      incomingReplyBanId,
      lobbyOpen,
      notificationOverlayActive,
      notificationSessionActive,
      phase,
      replyDeepLinkBanId,
      replyLobbyBlocked,
      replyUiShellActive,
      resultCtaBansOverlayOpen,
      resultReplyHandoffLock,
      sendFlowOpen,
      sendStarted,
      showLobbyCta,
    ],
  );

  const handleCloseBansOverlay = useCallback(
    (source = 'back-arrow') => {
      console.log('[BANS CLOSE]', { source });
      markVisibleOverboardTrace('[BANS CLOSE]', { source });

      const returnedToLobby = completeBansOverlayCloseFromResultCta(source);
      if (returnedToLobby) {
        flushSync(() => {
          setBansOverlayOpen(false);
          setSelectedBanForDetails(null);
          clearResultCtaBansOverlayOpen();
          resetSendUiForBansCta();
          setConfirmEnterKey((k) => k + 1);
          setCtaState('visible');
        });
        clearCtaEnterTimer();
        closeSendFlow();
        const logBansCloseFinalState = () => {
          const finalState = {
            lobbyOpen,
            bansOverlayOpen: false,
            effectiveBansOverlayOpen: false,
            showBansLayer: false,
            resultCtaBansOverlayOpen: false,
            bansCtaQueueSuppress,
            bansReturnToLobbyLatch,
            notificationQueueUiLock:
              notificationSessionActive || notificationOverlayActive,
            phase: 'idle' as const,
            sendStarted,
            sendFlowOpen,
            source,
          };
          console.log('[BANS CLOSE FINAL STATE]', finalState);
          markVisibleOverboardTrace('[BANS CLOSE FINAL STATE]', finalState);
        };
        logBansCloseFinalState();
        scheduleLobbyVisibilityCheck(source);
        requestAnimationFrame(logBansCloseFinalState);
        return;
      }

      setBansOverlayOpen(false);
      setSelectedBanForDetails(null);

      const wasBansCta = bansCtaQueueSuppress;
      if (wasBansCta) {
        clearBansCtaQueueSuppress();
      }
      if (isReplyParentActivePriorityActive()) {
        traceOverlayQueueMutationBefore(
          'dequeue',
          'handleCloseBansOverlay',
          'releaseNotificationQueueAfterReplyParentActive',
        );
        releaseNotificationQueueAfterReplyParentActive();
      } else if (isNotificationQueueLocked() || wasBansCta) {
        traceOverlayQueueMutationBefore(
          'dequeue',
          'handleCloseBansOverlay',
          wasBansCta
            ? 'unlockNotificationQueueAndFlush:result-cta-bans-closed'
            : 'unlockNotificationQueueAndFlush:target-flow-closed',
        );
        unlockNotificationQueueAndFlush(
          wasBansCta ? 'result-cta-bans-closed' : 'target-flow-closed',
        );
      }
      restoreLobbyCtaAfterBansSectionClose('bans-overlay');
    },
    [
      bansCtaQueueSuppress,
      bansReturnToLobbyLatch,
      clearBansCtaQueueSuppress,
      clearCtaEnterTimer,
      clearResultCtaBansOverlayOpen,
      completeBansOverlayCloseFromResultCta,
      isReplyParentActivePriorityActive,
      onClose,
      lobbyOpen,
      notificationOverlayActive,
      notificationSessionActive,
      releaseNotificationQueueAfterReplyParentActive,
      resetSendUiForBansCta,
      restoreLobbyCtaAfterBansSectionClose,
      scheduleCtaBecomeVisible,
      scheduleLobbyVisibilityCheck,
      sendFlowOpen,
      sendStarted,
      unlockNotificationQueueAndFlush,
      traceOverlayQueueMutationBefore,
    ],
  );

  useLayoutEffect(() => {
    handleCloseBansOverlayRef.current = handleCloseBansOverlay;
  }, [handleCloseBansOverlay]);

  const handleLobbyActiveBanOverlayBack = useCallback(() => {
    const banId = lobbyActiveBanOverlay?.id ?? null;
    if (!allowOverlayUserTap('result-timer-go-to-bans')) {
      logResultTimerInputBlockedBug({
        action: 'go-to-bans',
        banId,
        source: 'handleLobbyActiveBanOverlayBack',
      });
      return;
    }
    logResultTimerActionAllowed({
      action: 'go-to-bans',
      banId,
      source: 'handleLobbyActiveBanOverlayBack',
    });
    logResultTimerGoToBansClick({ banId, source: 'reply-parent-active-timer' });
    resultGoToBansDismissPathRef.current = true;
    markOverlayUserAction('result-timer-go-to-bans', banId ?? undefined);
    patchReplyQueueHandoffSession({
      queueLenAfterTimer: overlayQueueLength,
      pendingLenAfterTimer: pendingStartupInteractions,
    });
    logReplyQueueHandoffDiag('timer-card-dismissed', 'active-timer-card-close');
    clearStaleComposeStateBeforeBansNavigation('active-timer-card-close');
    const hasNext = hasPendingNotificationChain();
    logResultTimerDismissContinueQueue({
      banId,
      hasNext,
      queueLen: overlayQueueLength,
      pendingStartupInteractions,
    });
    console.log('[notification-chain-next-check]', {
      source: 'active-timer-card-close',
      hasNext,
      queueLen: overlayQueueLength,
      pendingStartupInteractions,
    });
    console.log('[overlay-handoff-start]', {
      fromOverlay: 'reply-parent-active',
      toOverlay: hasNext ? 'notification-queue' : 'lobby',
    });
    flushSync(() => {
      setOverlayHandoffFromActiveCard(true);
      setLobbyActiveBanOverlay(null);
    });
    traceOverlayQueueMutationBefore(
      'dequeue',
      'handleLobbyActiveBanOverlayBack',
      'releaseNotificationQueueAfterReplyParentActive:go-to-bans-timer',
      { itemBanId: banId, itemKind: 'result', itemResultId: banId },
    );
    releaseNotificationQueueAfterReplyParentActive();
  }, [
    clearStaleComposeStateBeforeBansNavigation,
    hasPendingNotificationChain,
    lobbyActiveBanOverlay?.id,
    logReplyQueueHandoffDiag,
    markOverlayUserAction,
    overlayQueueLength,
    pendingStartupInteractions,
    releaseNotificationQueueAfterReplyParentActive,
    traceOverlayQueueMutationBefore,
  ]);

  const handleActiveBanBackToBansList = useCallback(() => {
    if (lobbyActiveBanOverlay) {
      handleLobbyActiveBanOverlayBack();
      return;
    }
    if (isReplyParentActivePriorityActive()) {
      setSelectedBanForDetails(null);
      traceOverlayQueueMutationBefore(
        'dequeue',
        'handleActiveBanBackToBansList',
        'releaseNotificationQueueAfterReplyParentActive',
      );
      releaseNotificationQueueAfterReplyParentActive();
      return;
    }
    logOverlayPriority('explicit-bans-open-unlock', { source: 'active-ban-back' });
    traceOverlayQueueMutationBefore(
      'dequeue',
      'handleActiveBanBackToBansList',
      'unlockNotificationQueueAndFlush:explicit-bans-open-unlock',
    );
    unlockNotificationQueueAndFlush('explicit-bans-open-unlock');
    setSelectedBanForDetails(null);
  }, [
    handleLobbyActiveBanOverlayBack,
    isReplyParentActivePriorityActive,
    lobbyActiveBanOverlay,
    releaseNotificationQueueAfterReplyParentActive,
    unlockNotificationQueueAndFlush,
    traceOverlayQueueMutationBefore,
  ]);

  const handleBanShare = useCallback(
    (ban: BanInteraction) => {
      haptic('light');
      shareDeepLink(
        { type: 'ban', banId: ban.id },
        `Запрет в 98+\n«${ban.text?.trim() || ''}»`,
      );
    },
    [haptic],
  );

  const handleBanMore = useCallback(
    (ban: BanInteraction) => {
      if (!allowOverlayUserTap('result-timer-reply')) {
        logResultTimerInputBlockedBug({
          action: 'reply',
          banId: ban.id,
          source: 'handleBanMore',
        });
        return;
      }
      logResultTimerActionAllowed({
        action: 'reply',
        banId: ban.id,
        source: 'handleBanMore',
      });
      logResultTimerReplyClick({ banId: ban.id, source: 'reply-parent-active-timer' });
      markOverlayUserAction('result-timer-reply', ban.id);
      console.log('[active-repeat-debug] repeat clicked', {
        banId: ban.id,
        activeBanDeepLinkBanId,
      });
      activeBanRepeatComposeRef.current = true;
      lastEarlyActiveBanIdRef.current = ban.id;
      lastDeepLinkActiveBanIdRef.current = ban.id;
      clearActiveBanDeepLinkShell('repeat-clicked');
      beginRepeatBanFlow(ban, {
        goToConfirm: true,
        bansOverlayTab: bansTab,
      });
    },
    [
      activeBanDeepLinkBanId,
      beginRepeatBanFlow,
      bansTab,
      clearActiveBanDeepLinkShell,
      markOverlayUserAction,
    ],
  );

  const setSuccessToActiveLobbyBlockedState = useCallback(
    (blocked: boolean, reason?: string) => {
      successToActiveLobbyBlockedRef.current = blocked;
      setSuccessToActiveLobbyBlocked(blocked);
      if (blocked) {
        console.log('[success-to-active-lobby-frame-blocked]', {
          reason: reason ?? null,
        });
      }
    },
    [],
  );

  const startSendSuccessHandoffEarly = useCallback(() => {
    const armed = armPostSuccessHandoffEarlyIfPending('success-exit-early');
    if (!armed) return false;
    // FIX A: arm presentation hold synchronously with early handoff ownership.
    setSuccessPresentationChainExplicitlyEmpty(false);
    setSuccessEmptyShellHoldExpired(false);
    setSuccessPresentationHandoffArmed(true);
    setSuccessExitDraining(true);
    setCtaState('hidden');
    beginSuccessExitInProgress();
    if (hasPendingNotificationChain()) {
      setNotificationChainTransitioning(true);
    }
    return true;
  }, [
    armPostSuccessHandoffEarlyIfPending,
    hasPendingNotificationChain,
    setNotificationChainTransitioning,
  ]);

  const commitSendSuccessExit = useCallback(
    (opts: {
      parentActiveBan?: BanInteraction | null;
      lobbySource: 'send-success' | 'reply-parent-active';
      committedSameTick: boolean;
    }) => {
      logSuccessExitStart({
        phase: 'commit-send-success-exit',
        lobbySource: opts.lobbySource,
      });
      flushSync(() => {
        traceSuccessStateReset('commitSendSuccessExit', {
          lobbySource: opts.lobbySource,
          hasParentActive: !!opts.parentActiveBan,
        });
        traceSuccessSnapshotCleared('commitSendSuccessExit');
        traceSuccessHide('commitSendSuccessExit');
        clearActiveBanDeepLinkShell('success-exit');
        activeBanRepeatComposeRef.current = false;
        closeSendFlow();
        setBansOverlayOpen(false);
        setSelectedBanForDetails(null);
        // Stage 3A: for send-success → next notification, retain snapshot until
        // handoff terminal. reply-parent-active still clears immediately below.
        if (opts.lobbySource === 'reply-parent-active') {
          sendSnapshotRef.current = null;
        }
        confirmEntrySourceRef.current = 'send-flow';
        stopCrossScreenAnim();
        screenTransitionRef.current = null;
        setScreenTransition(null);
        setSelectedUser(null);
        setBanText('');
        setDurationMinutes(DEFAULT_DURATION_MINUTES);
        setSendError(null);
        setWhoExitActive(false);
        setWhoDismissProgress(0);
        setComposeExitProgress(0);
        setComposeDismissing(false);
        setCrossScreenProgressImmediate(0);
        releaseOwnerWhoToLobby();
        setPhase('idle');

        if (opts.lobbySource === 'reply-parent-active' && opts.parentActiveBan) {
          console.log('[overlay-handoff-start]', {
            fromOverlay: 'success',
            toOverlay: 'reply-parent-active',
          });
          prepareLobbyBaseAfterSuccess('reply-parent-active', {
            preserveActiveOverlay: true,
          });
          markReplyParentActivePriorityShown(opts.parentActiveBan.id);
          lockNotificationQueue('deep-link-active-ban', opts.parentActiveBan.id);
          setLobbyActiveBanOverlay(opts.parentActiveBan);
          logOpenActiveBanCard(
            opts.parentActiveBan.id,
            'reply-parent-active-on-lobby',
          );
        } else {
          setLobbyActiveBanOverlay(null);
          prepareLobbyBaseAfterSuccess('send-success', { deferLobbyOpen: true });
        }

        // FIX A + Stage 3A: arm presentation handoff BEFORE SUCCESS may clear
        // so base ArenaLobbyOrb cannot paint between SUCCESS and the next card /
        // Lobby. send-success retains banSentSuccess until mayClearSuccessLocal.
        setSuccessPresentationChainExplicitlyEmpty(false);
        setSuccessEmptyShellHoldExpired(false);
        setSuccessPresentationHandoffArmed(true);
        if (opts.lobbySource === 'reply-parent-active') {
          // Different transition (SUCCESS → active ban) — clear SUCCESS now.
          setBanSentSuccess(false);
        }
        // Stage 3A send-success: keep banSentSuccess + snapshot until
        // evaluateSuccessToNextHandoff.mayClearSuccessLocal.
        successToActiveLobbyBlockedRef.current = false;
        setSuccessToActiveLobbyBlocked(false);
      });

      traceOverlayQueueMutationBefore(
        'clear',
        'commitSendSuccessExit',
        `clearNotificationOverlayForEmptyQueueAfterSuccessExit:${opts.lobbySource === 'reply-parent-active' ? 'reply-parent-active' : 'send-success'}`,
      );
      clearNotificationOverlayForEmptyQueueAfterSuccessExit(
        opts.lobbySource === 'reply-parent-active'
          ? 'reply-parent-active'
          : 'send-success',
      );

      console.log('[success-to-active-atomic]', {
        hasParentActive: !!opts.parentActiveBan,
        activeBanId: opts.parentActiveBan?.id ?? null,
        committedSameTick: opts.committedSameTick,
      });
      if (opts.lobbySource === 'reply-parent-active' && opts.parentActiveBan) {
        console.log('[overlay-handoff-complete]', {
          toOverlay: 'reply-parent-active',
          activeBanId: opts.parentActiveBan.id,
        });
      }
    },
    [
      clearActiveBanDeepLinkShell,
      clearNotificationOverlayForEmptyQueueAfterSuccessExit,
      closeSendFlow,
      markReplyParentActivePriorityShown,
      prepareLobbyBaseAfterSuccess,
      setCrossScreenProgressImmediate,
      stopCrossScreenAnim,
      traceOverlayQueueMutationBefore,
    ],
  );

  const isReplyDeeplinkSendContext = useCallback(() => {
    return (
      isReplyQueueHandoffSessionActive() ||
      replyDeepLinkBanId != null ||
      deepLinkReplyBan != null ||
      Boolean(replyToBanId ?? getPinnedReplyToBanId())
    );
  }, [
    deepLinkReplyBan,
    getPinnedReplyToBanId,
    replyDeepLinkBanId,
    replyToBanId,
  ]);

  const logPostSuccessReplyDeeplinkLobbyStateDiag = useCallback(
    (source: string) => {
      if (!isReplyDeeplinkSendContext()) return;
      const before = postSuccessReplyDeeplinkBeforeRef.current;
      const queueDebug = getConfirmOrbQueueDebugSnapshot();
      const queueClaimsNotificationScreenGuard =
        selectOverlayVisible(notificationRuntimeState);
      traceQueueClaimsNotificationScreenIfChanged(
        `InstantBanFlow.post-success-reply-deeplink:${source}`,
        {
          queueClaimsNotificationScreen: queueClaimsNotificationScreenGuard,
          overlayQueueLength,
          queueLobbyGuardActive: queueClaimsNotificationScreenGuard,
          guardSnapshot: getQueueLobbyGuardSnapshot(),
          activeOverlayKind,
          activeKind: activeOverlayKind,
          notificationOverlayVisible,
          resultOverlayMounted: Boolean(result),
          showLobbyOrb,
          lobbyChromeHidden,
          renderBranch: lobbyOrbVisible || showBootOrb ? 'lobby' : 'base-null',
        },
      );
      const guardDecision = computeLobbyCtaGuardDecision({
        lobbyBootIntroPrimed,
        replyIncomingDeeplinkPending,
        checkDeeplinkDirectPending,
        successToActiveLobbyBlocked,
        overlayHandoffLobbySuppressed,
        successExitDraining,
        postSuccessHandoffBlocking,
        notificationChainTransitioning,
        queueClaimsNotificationScreen: queueClaimsNotificationScreenGuard,
        replyLobbyBlocked,
        bansReturnToLobbyLatch,
        deepLinkRouteBootPending,
        deepLinkReplyBooting,
        incomingReplyBanId,
        incomingGateActive,
        ctaState,
        effectiveBansOverlayOpen,
        notificationQueueUiLock,
      });
      const ctaJsxVisible =
        showLobbyCta &&
        !effectiveBansOverlayOpen &&
        !notificationQueueUiLock;
      logPostSuccessReplyDeeplinkLobbyState({
        source,
        parentIncomingBanId: getPinnedReplyToBanId() ?? replyToBanId,
        createdReplyBanId: lastSendSuccessBanIdRef.current,
        lobbyOpenBefore: before?.lobbyOpen ?? null,
        lobbyOpenAfter: lobbyOpen,
        sendStartedBefore: before?.sendStarted ?? null,
        sendStartedAfter: sendStarted,
        ctaStateBefore: before?.ctaState ?? null,
        ctaStateAfter: ctaState,
        showLobbyCta,
        ctaVisible: ctaJsxVisible,
        canShowCta: showLobbyCta,
        replyDeepLinkBanId,
        deepLinkReplyBanId: deepLinkReplyBan?.id ?? null,
        deepLinkReplyBooting,
        replyIncomingDeeplinkPending,
        queueClaimsNotificationScreen: queueClaimsNotificationScreenGuard,
        notificationOverlayActive,
        overlayQueueLength,
        pendingStartupInteractionsLen: queueDebug.pendingLen,
        chainAdvanceWaiting: queueDebug.chainAdvanceWaiting,
        shouldBlockLobbyForActiveQueue: shouldBlockLobbyForActiveQueue(),
        primaryBlocker: guardDecision.primaryBlocker,
        blockReasons: guardDecision.blockers,
        replyQueueHandoffActive: isReplyQueueHandoffSessionActive(),
        banSentSuccess,
        phase,
        activeOverlayKind,
      });
    },
    [
      activeOverlayKind,
      banSentSuccess,
      bansReturnToLobbyLatch,
      checkDeeplinkDirectPending,
      ctaState,
      deepLinkReplyBan,
      deepLinkReplyBooting,
      deepLinkRouteBootPending,
      effectiveBansOverlayOpen,
      getConfirmOrbQueueDebugSnapshot,
      getPinnedReplyToBanId,
      incomingGateActive,
      incomingReplyBanId,
      isReplyDeeplinkSendContext,
      lobbyBootIntroPrimed,
      lobbyOpen,
      notificationChainTransitioning,
      notificationOverlayActive,
      notificationQueueUiLock,
      overlayHandoffLobbySuppressed,
      overlayQueueLength,
      phase,
      postSuccessHandoffBlocking,
      replyDeepLinkBanId,
      replyIncomingDeeplinkPending,
      replyLobbyBlocked,
      replyToBanId,
      sendStarted,
      showLobbyCta,
      successExitDraining,
      successToActiveLobbyBlocked,
    ],
  );

  const finishSendSuccessLobbyExit = useCallback(
    async (banId: string | null) => {
      const logFinishSendSuccessLobbyExitDecision = (
        exit: string,
        decision:
          | 'mount-overlay'
          | 'preserve-pending'
          | 'stay-on-lobby'
          | 'early-abort',
        drained: boolean | null,
        drainDiagnostic?: ReturnType<typeof readLastSuccessExitDrainDiagnostic>,
      ) => {
        const overlayQueueRefLen = getConfirmOrbQueueDebugSnapshot().queueLen;
        const hasPending = hasPendingNotificationChain();
        const overlayQueueLengthVsRefMismatch =
          overlayQueueRefLen > 0 && overlayQueueLength === 0;
        const payload = {
          exit,
          decision,
          drained,
          overlayQueueLength,
          hasPendingNotificationChain: hasPending,
          overlayQueueRefLen,
          pendingVsEmptyMismatch:
            decision === 'stay-on-lobby' && hasPending,
          overlayQueueLengthVsRefMismatch,
          ...(drained === false && drainDiagnostic
            ? {
                drainedReason: drainDiagnostic.drainedReason,
                drainedReasonRaw: drainDiagnostic.drainedReasonRaw,
                drainedReasonDetail: drainDiagnostic.drainedReasonDetail,
              }
            : {}),
        };
        console.log('[FINISH SEND SUCCESS LOBBY EXIT]', payload);
        window.__debug98log?.('[FINISH SEND SUCCESS LOBBY EXIT]', payload);
      };

      // V5: SUCCESS_HANDOFF_REQUESTED owns post-success drain (no Legacy authorize gate).
      if (hasPendingNotificationChain()) {
        setNotificationChainTransitioning(true);
      }
      if (!isPostSuccessHandoffInProgress()) {
        // FIX A: keep the presentation latch armed across the async drain.
        setSuccessPresentationChainExplicitlyEmpty(false);
        setSuccessPresentationHandoffArmed(true);
        setSuccessExitDraining(true);
        setCtaState('hidden');
        beginSuccessExitInProgress();
      }
      try {
      console.log('[success-exit-start]', {
        banId,
        queueLen: overlayQueueLength,
        pendingStartupInteractions,
        notificationOverlayVisible,
      });
      window.__debug98log?.('[success-exit-start]', {
        banId,
        queueLen: overlayQueueLength,
        pendingStartupInteractions,
        notificationOverlayVisible,
      });
      // V5: do not releaseStartupInteractions / unlockNotificationQueueAndFlush as drain owners.
      // Runtime handoff clears hold + materializes; Legacy unlock would race showNext/continue.
      setBansReturnToLobbyLatch(false, {
        source: 'finishSendSuccessLobbyExit',
        banId,
      });

      console.log('[success-exit-drain-attempt]', {
        banId,
        queueLen: overlayQueueLength,
        pendingStartupInteractions,
      });
      window.__debug98log?.('[success-exit-drain-attempt]', {
        banId,
        queueLen: overlayQueueLength,
        pendingStartupInteractions,
      });

      // Deferred sync must run AFTER success handoff drain — never before.
      // Starting flushDeferredSync here previously called requestBootstrap
      // synchronously (lifecycle=booting) and rejected SUCCESS_HANDOFF_REQUESTED.

      traceOverlayQueueMutationBefore(
        'dequeue',
        'finishSendSuccessLobbyExit',
        'drainNextNotificationAfterSuccess',
        { itemBanId: banId },
      );
      const drained = await drainNextNotificationAfterSuccess(banId);
      logOverlayQueueMutationTrace({
        operation: drained ? 'dequeue' : 'remove',
        source: 'finishSendSuccessLobbyExit',
        reason: `drainNextNotificationAfterSuccess:drained=${drained}`,
        phase: 'after',
        prevLength: overlayQueueLength,
        nextLength: overlayQueueLength,
        itemBanId: banId,
      });
      if (drained) {
        console.log('[success-exit-drain-success]', {
          banId,
          notificationOverlayVisible,
        });
        window.__debug98log?.('[success-exit-drain-success]', {
          banId,
          notificationOverlayVisible,
        });
        successExitAwaitingNotificationDrainRef.current = true;
        logFinishSendSuccessLobbyExitDecision(
          'drain-ok',
          'mount-overlay',
          true,
        );
      } else {
        // V5: open lobby only when runtime idle → selectLobbyMayShow (never on reject/showing).
        const afterState =
          notificationRuntimeStore?.getState() ??
          createInitialNotificationRuntimeState();
        const lobbyMayShow = selectLobbyMayShow(afterState);
        successExitAwaitingNotificationDrainRef.current = false;
        endSuccessExitInstrumentation();
        if (!lobbyMayShow) {
          console.log('[success-exit-skip-lobby]', {
            banId,
            reason: 'runtime-not-idle',
            lifecycle: afterState.lifecycle.status,
          });
          window.__debug98log?.('[success-exit-skip-lobby]', {
            banId,
            reason: 'runtime-not-idle',
            lifecycle: afterState.lifecycle.status,
          });
          logFinishSendSuccessLobbyExitDecision(
            'drain-false-no-lobby',
            'early-abort',
            false,
            readLastSuccessExitDrainDiagnostic(),
          );
        } else {
        console.log('[success-exit-open-lobby]', {
          banId,
          reason: 'drain-missed',
        });
        window.__debug98log?.('[success-exit-open-lobby]', {
          banId,
          reason: 'drain-missed',
        });
        // V5: idle → selectLobbyMayShow; host opens lobby (TEMP adapters only).
        completePostSuccessHandoffEmptyOpenLobby({
          banId,
          reason: 'drain-missed',
          queueLen: overlayQueueLength,
          pendingLen: pendingStartupInteractions,
        });
        // FIX A terminal R2: runtime explicitly confirmed empty → release hold
        // and render complete Lobby once (orb + logo + chrome together).
        setSuccessPresentationChainExplicitlyEmpty(true);
        setNotificationChainTransitioning(false);
        clearNotificationOverlayForEmptyQueueAfterSuccessExit(
          'success-exit-empty-queue',
        );
        tryClearExplicitNotificationDrainGuarded(
          'finishSendSuccessLobbyExit',
          'success-exit-drain-missed',
        );
        allowSuccessExitLobbyOpen();
        openLobby('success-exit-empty-queue');
        beginCtaSpringIn();
        queueMicrotask(() =>
          logPostSuccessReplyDeeplinkLobbyStateDiag(
            'finish-send-success-lobby-exit-drain-missed',
          ),
        );
        logFinishSendSuccessLobbyExitDecision(
          'drain-false-open-lobby',
          'stay-on-lobby',
          false,
          readLastSuccessExitDrainDiagnostic(),
        );
        }
      }

      console.log('[success-exit-cleanup-state]', {
        successMounted: false,
        composeActive: false,
        drained,
        queueLen: overlayQueueLength,
      });
      } finally {
        endSuccessExitInProgress();
        setSuccessExitDraining(false);
        // After handoff settles: run deferred session sync without racing bootstrap.
        void (async () => {
          const timeoutMs = 5000;
          const startedAt = Date.now();
          window.__debug98log?.('[success-exit-deferred-sync-start]', {
            timeoutMs,
            handoffActive: false,
            phase: 'after-drain',
          });
          try {
            let timedOut = false;
            const timeout = new Promise<'timeout'>((resolve) => {
              window.setTimeout(() => {
                timedOut = true;
                resolve('timeout');
              }, timeoutMs);
            });
            const result = await Promise.race([
              flushDeferredSync().then(() => 'finished' as const),
              timeout,
            ]);
            if (result === 'finished' && !timedOut) {
              window.__debug98log?.('[success-exit-deferred-sync-finished]', {
                ms: Date.now() - startedAt,
              });
            } else if (result === 'timeout') {
              window.__debug98log?.('[success-exit-deferred-sync-timeout]', {
                ms: Date.now() - startedAt,
              });
            }
          } catch (err) {
            console.warn('[success-exit-deferred-sync-error]', err);
          }
        })();
      }
    },
    [
      beginCtaSpringIn,
      clearNotificationOverlayForEmptyQueueAfterSuccessExit,
      drainNextNotificationAfterSuccess,
      flushDeferredSync,
      hasPendingNotificationChain,
      notificationOverlayVisible,
      notificationRuntimeStore,
      openLobby,
      overlayQueueLength,
      pendingStartupInteractions,
      setBansReturnToLobbyLatch,
      setNotificationChainTransitioning,
      getConfirmOrbQueueDebugSnapshot,
      tryClearExplicitNotificationDrainGuarded,
      logPostSuccessReplyDeeplinkLobbyStateDiag,
      logOverlayQueueMutationTrace,
      traceOverlayQueueMutationBefore,
    ],
  );

  const handleSuccessExitComplete = useCallback(() => {
    traceSuccessExitHandler('handleSuccessExitComplete', {
      banId: lastSendSuccessBanIdRef.current,
    });
    if (!authorizeSuccessExitDrain(successCardSessionRef.current)) {
      return;
    }
    postSuccessReplyDeeplinkBeforeRef.current = {
      lobbyOpen,
      sendStarted,
      ctaState,
    };
    logSuccessExitStart({ phase: 'handle-success-exit-complete' });
    markPostSuccessExitWindowOpen({
      queueLen: overlayQueueLength,
      pendingStartup: pendingStartupInteractions,
    });
    const successExitStartedAt = performance.now();
    const successBanId = lastSendSuccessBanIdRef.current;
    console.log('[queue-debug] success exit', {
      fromActiveRepeat: activeBanRepeatComposeRef.current,
      pendingStartupInteractions,
      successBanId,
    });

    const parentBan = resolveReplyParentActiveBanImmediate();
    const parentBanIdPending =
      !parentBan && hasReplyParentActivePriorityPending()
        ? getReplyParentActiveBanId()
        : null;

    if (parentBanIdPending && !parentBan) {
      setSuccessToActiveLobbyBlockedState(true, 'pending-parent-active');
    }

    if (parentBan) {
      const delayMs = Math.round(performance.now() - successExitStartedAt);
      console.log('[success-to-active-after-user-action]', {
        parentBanId: parentBan.id,
      });
      setSendSuccessCardMounted(false, { source: 'user-close' });
      commitSendSuccessExit({
        parentActiveBan: parentBan,
        lobbySource: 'reply-parent-active',
        committedSameTick: true,
      });
      console.log('[reply-parent-active-show-immediate]', {
        parentBanId: parentBan.id,
        delayMs,
      });
      notifyActiveBanCardVisible(parentBan.id);
      beginCtaSpringIn();
      refreshReplyParentActiveBanInBackground(parentBan.id);
      queueMicrotask(() =>
        logPostSuccessReplyDeeplinkLobbyStateDiag(
          'reply-parent-active-immediate',
        ),
      );
      return;
    }

    if (parentBanIdPending) {
      void (async () => {
        const fetchedBan = await ensureReplyParentActiveBanForSuccess();
        const delayMs = Math.round(performance.now() - successExitStartedAt);
        if (!fetchedBan) {
          flushSync(() => {
            startSendSuccessHandoffEarly();
            setSendSuccessCardMounted(false, { source: 'user-close' });
          });
          commitSendSuccessExit({
            lobbySource: 'send-success',
            committedSameTick: false,
          });
          await finishSendSuccessLobbyExit(successBanId);
          return;
        }
        flushSync(() => {
          setSendSuccessCardMounted(false, { source: 'user-close' });
        });
        commitSendSuccessExit({
          parentActiveBan: fetchedBan,
          lobbySource: 'reply-parent-active',
          committedSameTick: false,
        });
        console.log('[success-to-active-after-user-action]', {
          parentBanId: fetchedBan.id,
        });
        console.log('[reply-parent-active-show-immediate]', {
          parentBanId: fetchedBan.id,
          delayMs,
        });
        notifyActiveBanCardVisible(fetchedBan.id);
        beginCtaSpringIn();
        queueMicrotask(() =>
          logPostSuccessReplyDeeplinkLobbyStateDiag(
            'reply-parent-active-fetched',
          ),
        );
      })();
      return;
    }

    flushSync(() => {
      startSendSuccessHandoffEarly();
      setSendSuccessCardMounted(false, { source: 'user-close' });
    });
    commitSendSuccessExit({
      lobbySource: 'send-success',
      committedSameTick: true,
    });
    void finishSendSuccessLobbyExit(successBanId);
  }, [
    beginCtaSpringIn,
    commitSendSuccessExit,
    ctaState,
    ensureReplyParentActiveBanForSuccess,
    finishSendSuccessLobbyExit,
    getReplyParentActiveBanId,
    hasReplyParentActivePriorityPending,
    lobbyOpen,
    logPostSuccessReplyDeeplinkLobbyStateDiag,
    notifyActiveBanCardVisible,
    overlayQueueLength,
    pendingStartupInteractions,
    refreshReplyParentActiveBanInBackground,
    resolveReplyParentActiveBanImmediate,
    sendStarted,
    setSuccessToActiveLobbyBlockedState,
    setSendSuccessCardMounted,
    startSendSuccessHandoffEarly,
  ]);

  useEffect(() => {
    if (!lobbyActiveBanOverlay?.id) return;
    const fresh = activeBans.find(
      (row) =>
        row.id === lobbyActiveBanOverlay.id && row.status === 'active',
    );
    if (!fresh) return;
    if (
      fresh.status === lobbyActiveBanOverlay.status &&
      fresh.expiresAt === lobbyActiveBanOverlay.expiresAt &&
      fresh.checkDueAt === lobbyActiveBanOverlay.checkDueAt &&
      fresh.remainingMs === lobbyActiveBanOverlay.remainingMs
    ) {
      return;
    }
    setLobbyActiveBanOverlay(fresh);
  }, [activeBans, lobbyActiveBanOverlay]);

  const openSuccess = useCallback(
    (banId: string, attemptId?: number) => {
      if (sendFailedRef.current) {
        logSendBanResponseTrace({
          source: 'InstantBanFlow:openSuccess:blocked-send-failed',
          banText: null,
          targetUserId: null,
          durationMinutes: null,
          httpStatus: 200,
          ok: true,
          createdBanId: banId,
          successCardWillOpen: false,
          thrownAfterCreate: true,
          failureReason: 'open-success-blocked-because-sendFailedRef',
        });
        logSendFlow('blocked-late-success', {
          banId,
          reason: 'send-failed',
          attemptId,
        });
        return;
      }
      const currentAttempt = flowSendAttemptRef.current;
      if (attemptId != null && attemptId !== currentAttempt) {
        logSendBanResponseTrace({
          source: 'InstantBanFlow:openSuccess:blocked-stale-attempt',
          banText: null,
          targetUserId: null,
          durationMinutes: null,
          httpStatus: 200,
          ok: true,
          createdBanId: banId,
          successCardWillOpen: false,
          thrownAfterCreate: true,
          failureReason: 'open-success-blocked-stale-attempt',
        });
        logSendFlow('blocked-late-success', {
          banId,
          reason: 'stale-attempt',
          attemptId,
          currentAttempt,
        });
        return;
      }
      if (!banId.trim()) return;

      logSendBanResponseTrace({
        source: 'InstantBanFlow:openSuccess:will-open',
        banText: banText,
        targetUserId:
          selectedUser?.userId ?? selectedUser?.id ?? null,
        durationMinutes,
        httpStatus: 200,
        ok: true,
        createdBanId: banId,
        successCardWillOpen: true,
        failureReason: null,
      });

      clearStaleSuccessExitLatch('open-success');
      successExitAwaitingNotificationDrainRef.current = false;
      setSuccessExitDraining(false);
      const sessionId = beginSendSuccessCardSession(banId);
      successCardSessionRef.current = sessionId;
      logSendSuccessCardShowRequired({ banId, sessionId });

      lastSendSuccessBanIdRef.current = banId;
      logSendFlow('open-success', { banId, attemptId: attemptId ?? currentAttempt });
      console.log('[send-success-open]', {
        banId,
        attemptId: attemptId ?? currentAttempt,
        elapsedSinceSendStartMs:
          sendStartedAtRef.current != null
            ? Math.round(performance.now() - sendStartedAtRef.current)
            : null,
      });
      window.__debug98log?.('[send-success-open]', {
        banId,
        attemptId: attemptId ?? currentAttempt,
        elapsedSinceSendStartMs:
          sendStartedAtRef.current != null
            ? Math.round(performance.now() - sendStartedAtRef.current)
            : null,
      });
      console.log('[active-repeat-debug] send success', {
        banId,
        fromActiveRepeat: activeBanRepeatComposeRef.current,
      });
      clearActiveBanDeepLinkShell('send-success');
      console.log('[active-repeat-debug] show success card', { banId });
      setSendError(null);
      markSessionBanSendSuccess();
      triggerConfirmHaptic();
      haptic('medium');
      instantBanSendSuccessDebug({
        banId,
        payoffPending: confirmSendContextRef.current.sendTriggered,
        payoffPhase: confirmSendContextRef.current.payoffPhase,
      });
      // Macro owner leaves CONFIRM atomically; paint remains banSentSuccess + snapshot.
      leaveWhoForLegacyRef.current = false;
      dispatchNotificationOwnerBootLobby({ type: 'OPEN_SUCCESS' });
      setBanSentSuccess(true);
      setSendSuccessCardMounted(true, { banId, source: 'open-success' });
      if (isReplyDeeplinkSendContext()) {
        const queueDebug = getConfirmOrbQueueDebugSnapshot();
        logReplyDeeplinkSuccessState({
          parentIncomingBanId: getPinnedReplyToBanId() ?? replyToBanId,
          createdReplyBanId: banId,
          sendStarted,
          successVisible: true,
          successStage: 'ban-sent-success',
          banSentSuccess: true,
          ctaState,
          replyDeepLinkBanId,
          deepLinkReplyBanId: deepLinkReplyBan?.id ?? null,
          deepLinkReplyBooting,
          replyIncomingDeeplinkPending,
          queueGuard: getQueueLobbyGuardSnapshot(),
          chainAdvanceWaiting: queueDebug.chainAdvanceWaiting,
          overlayQueueLength,
          pendingStartupInteractionsLen: queueDebug.pendingLen,
          replyQueueHandoffActive: isReplyQueueHandoffSessionActive(),
          phase,
        });
      }
      if (isReplyQueueHandoffSessionActive()) {
        patchReplyQueueHandoffSession({
          createdBanId: banId,
          queueLenAfterSuccess: overlayQueueLength,
          pendingLenAfterSuccess: pendingStartupInteractions,
        });
        logReplyQueueHandoffDiag('after-reply-success', 'openSuccess');
      }
    },
    [
      clearActiveBanDeepLinkShell,
      ctaState,
      deepLinkReplyBan,
      deepLinkReplyBooting,
      getConfirmOrbQueueDebugSnapshot,
      getPinnedReplyToBanId,
      haptic,
      isReplyDeeplinkSendContext,
      logReplyQueueHandoffDiag,
      markSessionBanSendSuccess,
      overlayQueueLength,
      pendingStartupInteractions,
      phase,
      replyDeepLinkBanId,
      replyIncomingDeeplinkPending,
      replyToBanId,
      sendStarted,
      setSendSuccessCardMounted,
    ],
  );

  const { send, inFlight, sharing } = useSendChallenge({
    token,
    friends: safeFriends,
    onSuccess: (banId) => openSuccess(banId, flowSendAttemptRef.current),
    onOptimisticApply: (p) => {
      applyOptimisticSend({
        username: p.username,
        firstName:
          findFriendByUsername(safeFriends, p.username)?.firstName ??
          p.username,
        banText: p.text,
        durationMinutes: p.durationMinutes,
      });
    },
    onConfirm: (p) => {
      confirmOptimisticSend(p.username);
    },
    onRequiresShare: () => {
      traceSuccessHide('send-hook-onRequiresShare');
      setBanSentSuccess(false);
      confirmAbortReleaseRef.current?.();
    },
    onFail: (p) => {
      if (sendFailedRef.current) {
        return;
      }
      logSendBanResponseTrace({
        source: 'InstantBanFlow:useSendChallenge:onFail',
        banText: p.text,
        targetUserId: p.receiverUserId ?? null,
        durationMinutes: p.durationMinutes,
        httpStatus: null,
        ok: false,
        errorMessage: p.message,
        successCardWillOpen: false,
        failureReason: 'send-hook-onFail',
      });
      if (isDailyBanLimitSendFailure(p.message)) {
        logSendFlow('suppress-confirm-error-for-daily-limit', {
          source: 'send-hook-on-fail',
          message: p.message,
        });
        returnToLobbyAfterDailyLimitRef.current?.({
          source: 'send-hook',
          apiResult: 'DAILY_BAN_LIMIT',
        });
        return;
      }
      if (isLowEnergySendFailure(p.message)) {
        logSendFlow('suppress-confirm-error-for-low-energy', {
          source: 'send-hook-on-fail',
          message: p.message,
        });
        returnToLobbyAfterLowEnergyRef.current?.({
          source: 'send-hook',
          apiResult: 'INSUFFICIENT_ENERGY',
        });
        return;
      }
      rollbackOptimisticSend({
        username: p.username,
        message: p.message,
      });
      traceSuccessHide('send-hook-onFail');
      setBanSentSuccess(false);
      confirmAbortReleaseRef.current?.();
      const message = p.message || 'Не получилось отправить запрет';
      instantBanSendErrorDebug({ message, error: p });
      setSendError(message);
    },
    onboard,
    refreshUser,
    reloadPending,
    reloadFriends,
    scheduleDeferredSync,
  });


  const handleLowEnergyAsk = useCallback(() => {
    if (pendingStartupInteractions) {
      console.log('[lobby-low-energy-ask]', {
        action: 'release-startup-interactions',
        pendingStartupInteractions: true,
      });
      logOverlayPriority('explicit-bans-open-unlock', {
        source: 'low-energy-ask',
      });
      traceOverlayQueueMutationBefore(
        'dequeue',
        'handleLowEnergyAsk',
        'unlockNotificationQueueAndFlush:explicit-bans-open-unlock',
      );
      unlockNotificationQueueAndFlush('explicit-bans-open-unlock');
      return;
    }
    if (notificationSessionActive) {
      console.log('[lobby-low-energy-ask]', {
        action: 'queue-already-active',
        notificationSessionActive: true,
      });
      return;
    }
    console.log('[lobby-low-energy-ask]', { action: 'telegram-share' });
    shareLobbyAskInvite(inviteUsername);
  }, [
    inviteUsername,
    notificationSessionActive,
    pendingStartupInteractions,
    unlockNotificationQueueAndFlush,
    traceOverlayQueueMutationBefore,
  ]);

  useEffect(() => {
    setSuccessExitDrainingForDebug(successExitDraining);
  }, [successExitDraining]);

  useEffect(() => {
    if (!postSuccessHandoffActive) {
      postSuccessHandoffWaitingLoggedRef.current = false;
      return;
    }
    if (notificationOverlayVisible) return;
    if (postSuccessHandoffWaitingLoggedRef.current) return;
    postSuccessHandoffWaitingLoggedRef.current = true;
    const queueDebug = getConfirmOrbQueueDebugSnapshot();
    logPostSuccessHandoffWaitingMount({
      queueLen: overlayQueueLength,
      pendingLen: pendingStartupInteractions,
      notificationSessionActive,
      successExitDraining,
      sendComposePhase: queueDebug.sendComposePhase,
      replyComposeActive: queueDebug.replyComposeActive,
    });
    if (
      queueDebug.replyComposeActive ||
      queueDebug.sendComposePhase === 'composingBan' ||
      queueDebug.sendComposePhase === 'confirming'
    ) {
      logPostSuccessHandoffStillActiveDuringReply({
        source: 'postSuccessHandoffWaitingMount-effect',
        sendComposePhase: queueDebug.sendComposePhase,
        ...queueDebug,
      });
    }
  }, [
    getConfirmOrbQueueDebugSnapshot,
    notificationOverlayVisible,
    notificationSessionActive,
    overlayQueueLength,
    pendingStartupInteractions,
    postSuccessHandoffActive,
    successExitDraining,
  ]);

  useEffect(() => {
    if (!successExitAwaitingNotificationDrainRef.current) return;
    if (isPostSuccessHandoffInProgress()) return;
    if (notificationOverlayVisible) {
      successExitAwaitingNotificationDrainRef.current = false;
      return;
    }

    const queueLen = overlayQueueLength;
    const hasPendingStartup = pendingStartupInteractions;
    const hasPending = hasPendingNotificationChain();
    const sessionActive = notificationSessionActive;

    if (hasPending && (queueLen > 0 || hasPendingStartup)) {
      logSuccessDrainResultLostBug({
        queueLen,
        pendingLen: hasPendingStartup ? 1 : 0,
        sessionActive,
        reason: 'overlay-lost-with-pending-queue',
      });
      return;
    }

    if (
      queueLen === 0 &&
      !hasPendingStartup &&
      !hasPending &&
      !sessionActive &&
      !isPostSuccessHandoffInProgress()
    ) {
      successExitAwaitingNotificationDrainRef.current = false;
      console.log('[success-exit-overlay-lost-recover-lobby]', {
        queueLen,
        pendingStartup: hasPendingStartup,
        notificationSessionActive: sessionActive,
      });
      allowSuccessExitLobbyOpen();
      openLobby('success-exit-overlay-lost');
      beginCtaSpringIn();
    }
  }, [
    beginCtaSpringIn,
    hasPendingNotificationChain,
    notificationOverlayVisible,
    notificationSessionActive,
    openLobby,
    overlayQueueLength,
    pendingStartupInteractions,
  ]);

  /**
   * V4: false→true edge on postNotificationPresentationFullyReleased.
   * V3 runtime-idle completion edge is bypassed — CTA restores only after host
   * result/status/dim/mount layers actually unmount. Uses canonical helpers only.
   */
  useEffect(() => {
    const snap = buildPostNotificationPresentationSnapshot(
      notificationRuntimeState,
      {
        notificationOverlayMounted,
        notificationQueueUiLock: notificationOverlayMounted,
        hostResultActive: Boolean(result),
        directOverboardActive: showDirectOverboardLayer,
        notificationChainTransitioning,
        visualQueueDimSession,
        orbOverlayDim,
        postSuccessHandoffBlocking,
        successExitDraining,
      },
    );
    const released = isPostNotificationPresentationFullyReleased(snap);
    const { edge, nextPrevious } = detectPostNotificationPresentationReleaseEdge(
      presentationFullyReleasedPrevRef.current,
      released,
    );
    presentationFullyReleasedPrevRef.current = nextPrevious;
    if (!edge) return;
    // Existing check/reply/close paths may already have restored CTA — do not
    // restart the spring when ctaState is already entering/visible.
    if (
      ctaState === 'visible' ||
      ctaState === 'entering' ||
      ctaState === 'exiting'
    ) {
      return;
    }
    if (phase !== 'idle') return;
    allowSuccessExitLobbyOpen();
    openLobby('post-notification-presentation-released');
    beginCtaSpringIn();
  }, [
    beginCtaSpringIn,
    ctaState,
    notificationChainTransitioning,
    notificationOverlayMounted,
    notificationRuntimeState,
    openLobby,
    orbOverlayDim,
    phase,
    postSuccessHandoffBlocking,
    result,
    showDirectOverboardLayer,
    successExitDraining,
    visualQueueDimSession,
  ]);

  useEffect(() => {
    if (!lobbyOpen || !lobbyBootIntroPrimed || showLobbyCta) return;
    if (notificationOverlayVisible || notificationSessionActive) return;
    logPostSuccessHandoffStartTooLateBug({
      reason: 'lobby-cta-hidden-bug',
      queueLen: overlayQueueLength,
      pendingStartup: pendingStartupInteractions,
      ctaState,
    });
    logLobbyCtaHiddenBug({
      blockers: {
        ctaState,
        phase,
        successExitDraining,
        postSuccessHandoffBlocking,
        successToActiveLobbyBlocked,
        notificationChainTransitioning,
        notificationOverlayMounted,
        replyLobbyBlocked,
        replyIncomingDeeplinkPending,
        overlayHandoffLobbySuppressed,
        deepLinkRouteBootPending,
        incomingGateActive,
        bansReturnToLobbyLatch,
      },
    });
  }, [
    bansReturnToLobbyLatch,
    ctaState,
    deepLinkRouteBootPending,
    incomingGateActive,
    lobbyBootIntroPrimed,
    lobbyOpen,
    notificationChainTransitioning,
    notificationOverlayMounted,
    notificationOverlayVisible,
    notificationSessionActive,
    overlayHandoffLobbySuppressed,
    overlayQueueLength,
    pendingStartupInteractions,
    phase,
    replyIncomingDeeplinkPending,
    replyLobbyBlocked,
    showLobbyCta,
    successExitDraining,
    postSuccessHandoffBlocking,
    successToActiveLobbyBlocked,
  ]);

  const handleBeginSend = useCallback(() => {
    console.log('[lobby-click-attempt]', { source: 'ban-cta' });

    if (phase !== 'idle' || ctaState !== 'visible') {
      console.log('[lobby-click-blocked]', {
        topLayer: 'lobby-cta',
        pointerEvents: 'cta-not-ready',
        reason: phase !== 'idle' ? 'phase-not-idle' : 'cta-not-visible',
        phase,
        ctaState,
      });
      return;
    }

    if (hasPendingNotificationChain() && notificationOverlayVisible) {
      console.log('[lobby-click-blocked]', {
        topLayer: 'notification-overlay',
        pointerEvents: 'auto',
        reason: 'visible-notification-overlay',
      });
      void flushDeferredSync().then(() => {
        traceOverlayQueueMutationBefore(
          'dequeue',
          'handleLobbyCtaClick',
          'releaseStartupInteractions:begin-send-drain',
        );
        releaseStartupInteractions({ force: true });
        traceOverlayQueueMutationBefore(
          'dequeue',
          'handleLobbyCtaClick',
          'unlockNotificationQueueAndFlush:begin-send-drain',
        );
        unlockNotificationQueueAndFlush('begin-send-drain');
      });
      return;
    }

    console.log('[lobby-cta-open-what]', { allowed: true });

    setLobbySendBlockReason(null);
    clearCtaExitTimer();
    clearWhoPanelEnterTimer();
    setCtaState('exiting');
    setWhoPanelEntering(true);
    onStartSend();
    leaveWhoForLegacyRef.current = false;
    dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });

    ctaExitTimerRef.current = setTimeout(() => {
      ctaExitTimerRef.current = null;
      setCtaState('hidden');
    }, CTA_EXIT_MS);

    whoPanelEnterTimerRef.current = setTimeout(() => {
      whoPanelEnterTimerRef.current = null;
      setWhoPanelEntering(false);
    }, WHO_PANEL_ENTER_MS);
  }, [
    clearCtaExitTimer,
    clearWhoPanelEnterTimer,
    ctaState,
    flushDeferredSync,
    hasPendingNotificationChain,
    onStartSend,
    phase,
    releaseStartupInteractions,
    unlockNotificationQueueAndFlush,
    notificationOverlayVisible,
    traceOverlayQueueMutationBefore,
  ]);

  const beginNewBanWhoFlow = useCallback(() => {
    clearBansCtaQueueSuppress();
    clearResultCtaBansOverlayOpen();
    if (hasPendingNotificationChain()) {
      console.log('[success-exit-open-what-blocked]', {
        reason: 'pending-notifications',
        source: 'beginNewBanWhoFlow',
      });
      void flushDeferredSync().then(() => {
        traceOverlayQueueMutationBefore(
          'dequeue',
          'beginNewBanWhoFlow',
          'releaseStartupInteractions:new-ban-who-drain',
        );
        releaseStartupInteractions({ force: true });
        traceOverlayQueueMutationBefore(
          'dequeue',
          'beginNewBanWhoFlow',
          'unlockNotificationQueueAndFlush:new-ban-who-drain',
        );
        unlockNotificationQueueAndFlush('new-ban-who-drain');
      });
      return;
    }
    sendEntryPhaseRef.current = 'selectingTarget';
    setBansOverlayOpen(false);
    setSelectedBanForDetails(null);
    clearCtaExitTimer();
    clearWhoPanelEnterTimer();
    setCtaState('hidden');
    setSelectedUser(null);
    setBanText('');
    setDurationMinutes(DEFAULT_DURATION_MINUTES);
    setSendError(null);
    setComposeExitProgress(0);
    setComposeDismissing(false);
    traceSuccessStateReset('beginNewBanWhoFlow', { nextPhase: 'selectingTarget' });
    traceSuccessHide('beginNewBanWhoFlow');
    setBanSentSuccess(false);
    traceSuccessSnapshotCleared('beginNewBanWhoFlow');
    sendSnapshotRef.current = null;
    setCrossScreenProgressImmediate(0);
    onStartSend();
    leaveWhoForLegacyRef.current = false;
    dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });
  }, [
    clearBansCtaQueueSuppress,
    clearCtaExitTimer,
    clearResultCtaBansOverlayOpen,
    clearWhoPanelEnterTimer,
    flushDeferredSync,
    hasPendingNotificationChain,
    onStartSend,
    releaseStartupInteractions,
    setCrossScreenProgressImmediate,
    unlockNotificationQueueAndFlush,
    traceOverlayQueueMutationBefore,
  ]);

  const lastNewBanWhoFlowRequestRef = useRef(0);
  const lastDeepLinkRepeatBanIdRef = useRef<string | null>(null);
  const lastDeepLinkInviteToBanInviterIdRef = useRef<string | null>(null);
  const lastDeepLinkReplyBanIdRef = useRef<string | null>(null);
  const phaseSetFromReplyRef = useRef<string | null>(null);
  const lockReleasedRef = useRef(false);
  const whatVisibleNotifiedRef = useRef(false);
  const resultReplyWhatNotifiedRef = useRef(false);
  const lastResultReplyRequestRef = useRef(0);

  useLayoutEffect(() => {
    if (deepLinkActiveBan?.id || !activeBanDeepLinkBanId || !user?.id) return;
    if (activeBanRepeatComposeRef.current || banSentSuccess) {
      console.log(
        '[active-repeat-debug] blocked restore active card after success',
        {
          reason: activeBanRepeatComposeRef.current
            ? 'repeat-compose'
            : 'success-visible',
          banId: activeBanDeepLinkBanId,
          phase,
        },
      );
      return;
    }
    if (
      selectedUser != null ||
      phase === 'confirming' ||
      phase === 'composingBan' ||
      phase === 'selectingTarget'
    ) {
      console.log(
        '[active-repeat-debug] blocked restore active card after success',
        {
          reason: 'send-flow-active',
          banId: activeBanDeepLinkBanId,
          phase,
        },
      );
      return;
    }
    if (lastEarlyActiveBanIdRef.current === activeBanDeepLinkBanId) return;
    const ban = activeBans.find((b) => b.id === activeBanDeepLinkBanId);
    if (!ban) return;
    lastEarlyActiveBanIdRef.current = activeBanDeepLinkBanId;
    lastDeepLinkActiveBanIdRef.current = activeBanDeepLinkBanId;
    console.log('[active-deeplink]', {
      banId: ban.id,
      action: 'early-open-from-session',
    });
    beginActiveBanFromDeepLink(ban);
    notifyActiveBanCardVisible(ban.id);
  }, [
    activeBanDeepLinkBanId,
    activeBans,
    banSentSuccess,
    beginActiveBanFromDeepLink,
    deepLinkActiveBan?.id,
    notifyActiveBanCardVisible,
    phase,
    selectedUser,
    user?.id,
  ]);

  useEffect(() => {
    if (newBanWhoFlowRequest === 0) return;
    if (lastNewBanWhoFlowRequestRef.current === newBanWhoFlowRequest) return;
    lastNewBanWhoFlowRequestRef.current = newBanWhoFlowRequest;
    beginNewBanWhoFlow();
  }, [newBanWhoFlowRequest, beginNewBanWhoFlow]);

  const lastOpenBansOverlayRequestRef = useRef(0);
  const resultCtaBansOpenTickRef = useRef(0);
  const bansOverlayOpenRef = useRef(bansOverlayOpen);
  const showBansLayerRef = useRef(showBansLayer);
  const effectiveBansOverlayOpenRef = useRef(effectiveBansOverlayOpen);
  bansOverlayOpenRef.current = bansOverlayOpen;
  showBansLayerRef.current = showBansLayer;
  effectiveBansOverlayOpenRef.current = effectiveBansOverlayOpen;

  const scheduleBansVisibleCheck = useCallback(
    (source: string) => {
      const runCheck = () => {
        const visibleCheck = {
          bansOverlayOpen: bansOverlayOpenRef.current,
          effectiveBansOverlayOpen: effectiveBansOverlayOpenRef.current,
          instantBanOpen: sendStarted,
          lobbyOpen,
          phase,
          showBansLayer: showBansLayerRef.current,
          resultActive: result != null,
          directActive: notificationSessionActive,
          bansCtaQueueSuppress,
          resultCtaBansOverlayOpen,
          notificationQueueUiLock:
            notificationSessionActive || notificationOverlayActive,
          source,
        };
        console.log('[BANS VISIBLE CHECK]', visibleCheck);
        markVisibleOverboardTrace('[BANS VISIBLE CHECK]', visibleCheck);

        if (
          effectiveBansOverlayOpenRef.current &&
          !showBansLayerRef.current
        ) {
          if (hasPendingNotificationChain() || notificationOverlayActive) {
            console.log('[chain-debug-final-lobby-blocked]', {
              source,
              reason: 'chain-active-or-overlay',
              notificationOverlayActive,
            });
            clearResultCtaBansOverlayOpen();
            clearBansCtaQueueSuppress();
            return;
          }
          console.log('[BANS OPEN FALLBACK LOBBY]', visibleCheck);
          markVisibleOverboardTrace('[BANS OPEN FALLBACK LOBBY]', visibleCheck);
          setBansOverlayOpen(false);
          openLobby('bans-open-fallback');
          beginCtaSpringIn();
        } else if (showBansLayerRef.current) {
          clearResultCtaBansOverlayOpen();
        }
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(runCheck);
      });
    },
    [
      beginCtaSpringIn,
      bansCtaQueueSuppress,
      clearBansCtaQueueSuppress,
      clearResultCtaBansOverlayOpen,
      hasPendingNotificationChain,
      lobbyOpen,
      notificationOverlayActive,
      notificationSessionActive,
      openBansOverlayRequest,
      openLobby,
      phase,
      result,
      resultCtaBansOverlayOpen,
      sendStarted,
    ],
  );

  const openBansFromResultCtaProviderRequest = useCallback(
    (source: string) => {
      if (banSentSuccess) {
        console.log('[queue-reply-debug] blocked by success card', { source });
        return false;
      }
      if (replyComposeActive || deepLinkReplyBan?.id) {
        console.log('[queue-reply-debug] blocked by bans overlay intent', {
          source,
          replyComposeActive,
          replyToBanId: deepLinkReplyBan?.id ?? null,
        });
        return false;
      }
      const tick = resultCtaBansOpenTickRef.current;
      const ok = handleOpenBansFromResultCtaRef.current();
      console.log('[BANS OVERLAY OPENED]', {
        ok,
        source,
        tick,
      });
      markVisibleOverboardTrace('[BANS OVERLAY OPENED]', {
        ok,
        source,
        tick,
      });
      if (ok) {
        scheduleBansVisibleCheck(source);
      }
      return ok;
    },
    [banSentSuccess, deepLinkReplyBan?.id, replyComposeActive, scheduleBansVisibleCheck],
  );

  useLayoutEffect(() => {
    if (closeBansOverlayRequest === 0) return;
    lastOpenBansOverlayRequestRef.current = 0;
    resultCtaBansOpenTickRef.current = 0;
    setBansOverlayOpen(false);
    setSelectedBanForDetails(null);
    restoreLobbyCtaAfterBansSectionClose('provider-close-bans-overlay-request');
    console.log('[queue-reply-debug] close local bans overlay', {
      closeBansOverlayRequest,
    });
  }, [closeBansOverlayRequest, restoreLobbyCtaAfterBansSectionClose]);

  useLayoutEffect(() => {
    if (!resultCtaBansOverlayOpen && openBansOverlayRequest === 0) return;
    const tick = openBansOverlayRequest;
    if (tick > 0 && lastOpenBansOverlayRequestRef.current === tick) return;
    if (tick > 0) {
      lastOpenBansOverlayRequestRef.current = tick;
    }
    resultCtaBansOpenTickRef.current = tick;
    openBansFromResultCtaProviderRequest(
      resultCtaBansOverlayOpen
        ? 'provider-resultCtaBansOverlayOpen'
        : 'provider-openBansOverlayRequest',
    );
  }, [
    openBansFromResultCtaProviderRequest,
    openBansOverlayRequest,
    resultCtaBansOverlayOpen,
  ]);

  useLayoutEffect(() => {
    if (!bansCtaQueueSuppress) return;
    if (result != null) return;
    if (hasPendingNotificationChain()) {
      console.log('[chain-debug-session-ended-blocked]', {
        source: 'direct-result-cleanup',
        reason: 'chain-active',
      });
      return;
    }
    scheduleBansVisibleCheck('direct-result-cleanup');
  }, [bansCtaQueueSuppress, hasPendingNotificationChain, result, scheduleBansVisibleCheck]);

  useLayoutEffect(() => {
    if (!deepLinkInviteToBanInviter?.id || !user?.id) return;
    if (
      lastDeepLinkInviteToBanInviterIdRef.current ===
      deepLinkInviteToBanInviter.id
    ) {
      return;
    }
    lastDeepLinkInviteToBanInviterIdRef.current = deepLinkInviteToBanInviter.id;
    console.log('[invite-to-ban-deeplink]', {
      inviterId: deepLinkInviteToBanInviter.id,
      action: 'begin-what',
    });
    const ok = beginComposingBanForOpponent(deepLinkInviteToBanInviter);
    if (ok) clearDeepLinkInviteToBan();
  }, [
    beginComposingBanForOpponent,
    clearDeepLinkInviteToBan,
    deepLinkInviteToBanInviter,
    user?.id,
  ]);

  useLayoutEffect(() => {
    if (!deepLinkRepeatBan?.id || !user?.id) return;
    if (lastDeepLinkRepeatBanIdRef.current === deepLinkRepeatBan.id) return;
    lastDeepLinkRepeatBanIdRef.current = deepLinkRepeatBan.id;
    console.log('[repeat-deeplink]', {
      banId: deepLinkRepeatBan.id,
      action: 'begin-flow',
      goToConfirm: deepLinkRepeatGoToConfirm,
    });
    const ok = beginRepeatBanFlow(deepLinkRepeatBan, {
      goToConfirm: deepLinkRepeatGoToConfirm,
    });
    logDeepLinkHandlerResult({
      type: 'repeat',
      banId: deepLinkRepeatBan.id,
      instantBanOpen: sendStarted,
      sendFlowOpen,
      phase: ok
        ? deepLinkRepeatGoToConfirm
          ? 'confirming'
          : 'composingBan'
        : 'idle',
      selectedUserId: selectedUser?.userId ?? selectedUser?.id ?? null,
      selectedBanId: deepLinkRepeatBan.id,
      overlayQueueLength,
      ok,
      reason: ok ? null : 'begin-repeat-failed',
    });
    if (ok) clearDeepLinkRepeatBan();
  }, [
    deepLinkRepeatBan,
    deepLinkRepeatGoToConfirm,
    user?.id,
    beginRepeatBanFlow,
    clearDeepLinkRepeatBan,
    sendStarted,
    sendFlowOpen,
    selectedUser?.id,
    selectedUser?.userId,
    overlayQueueLength,
  ]);

  useLayoutEffect(() => {
    if (!deepLinkReplyBan?.id || !user?.id) return;
    if (phaseSetFromReplyRef.current === deepLinkReplyBan.id) {
      logReplyFlowLoopGuard('skip already composingBan');
      return;
    }
    if (phase === 'composingBan' && selectedUser) {
      phaseSetFromReplyRef.current = deepLinkReplyBan.id;
      lastDeepLinkReplyBanIdRef.current = deepLinkReplyBan.id;
      logReplyFlowLoopGuard('skip already composingBan');
      return;
    }
    if (lastDeepLinkReplyBanIdRef.current === deepLinkReplyBan.id) return;
    lastDeepLinkReplyBanIdRef.current = deepLinkReplyBan.id;
    phaseSetFromReplyRef.current = deepLinkReplyBan.id;
    console.log('[reply-deeplink]', {
      banId: deepLinkReplyBan.id,
      action: 'card-reply-begin-what',
    });
    const ok = beginIncomingReplyFromDeepLink(deepLinkReplyBan);
    const opponent = user?.id
      ? opponentForBan(deepLinkReplyBan, user.id)
      : null;
    if (ok) {
      logReplyFlow('phase-set-composingBan', {
        banId: deepLinkReplyBan.id,
        lockActive: true,
        phase: 'composingBan',
        selectedUserId:
          opponent?.id ??
          selectedUser?.userId ??
          selectedUser?.id ??
          null,
      });
    }
    logDeepLinkHandlerResult({
      type: 'reply',
      banId: deepLinkReplyBan.id,
      instantBanOpen: sendStarted,
      sendFlowOpen,
      phase: ok ? 'composingBan' : 'idle',
      selectedUserId:
        opponent?.id ??
        selectedUser?.userId ??
        selectedUser?.id ??
        null,
      selectedBanId: deepLinkReplyBan.id,
      overlayQueueLength,
      ok,
      reason: ok ? 'card-reply-what' : 'begin-reply-failed',
    });
    if (!ok) releaseReplyHandoffLock();
  }, [
    deepLinkReplyBan,
    user?.id,
    phase,
    selectedUser,
    beginIncomingReplyFromDeepLink,
    releaseReplyHandoffLock,
    sendStarted,
    sendFlowOpen,
    selectedUser?.id,
    selectedUser?.userId,
    overlayQueueLength,
  ]);

  useLayoutEffect(() => {
    if (!resultReplyPending || resultReplyRequest === 0) return;
    if (lastResultReplyRequestRef.current === resultReplyRequest) return;
    lastResultReplyRequestRef.current = resultReplyRequest;
    resultReplyWhatNotifiedRef.current = false;

    const ok = beginComposingBanForOpponent(resultReplyPending.opponent);
    if (!ok) {
      notifyResultReplyWhatVisible(resultReplyPending.banId, null);
    }
  }, [
    resultReplyRequest,
    resultReplyPending,
    beginComposingBanForOpponent,
    notifyResultReplyWhatVisible,
  ]);

  useLayoutEffect(() => {
    if (resultReplyWhatNotifiedRef.current) return;
    if (!resultReplyHandoffLock) return;
    if (phase !== 'composingBan' || !selectedUser) return;
    const banId = resultReplyPending?.banId;
    if (!banId) return;
    resultReplyWhatNotifiedRef.current = true;
    const selectedUserId =
      selectedUser.userId ?? selectedUser.id ?? selectedUser.username ?? null;
    notifyResultReplyWhatVisible(banId, selectedUserId);
  }, [
    resultReplyHandoffLock,
    resultReplyPending?.banId,
    phase,
    selectedUser,
    notifyResultReplyWhatVisible,
  ]);

  useLayoutEffect(() => {
    if (lockReleasedRef.current || whatVisibleNotifiedRef.current) {
      logReplyFlowLoopGuard('skip already released');
      return;
    }
    if (!replyHandoffLock) return;
    if (phase !== 'composingBan' || !selectedUser) return;
    const banId =
      incomingReplyBanId ?? deepLinkReplyBan?.id ?? replyDeepLinkBanId;
    if (!banId) return;
    lockReleasedRef.current = true;
    whatVisibleNotifiedRef.current = true;
    logReplyFlowLoopGuard('release once');
    const selectedUserId =
      selectedUser.userId ?? selectedUser.id ?? selectedUser.username ?? null;
    notifyReplyWhatVisible(banId, selectedUserId);
  }, [
    replyHandoffLock,
    phase,
    selectedUser,
    incomingReplyBanId,
    deepLinkReplyBan,
    replyDeepLinkBanId,
    notifyReplyWhatVisible,
  ]);

  useLayoutEffect(() => {
    if (!deepLinkActiveBan?.id || !user?.id) return;
    if (activeBanRepeatComposeRef.current || banSentSuccess) {
      console.log(
        '[active-repeat-debug] blocked restore active card after success',
        {
          reason: 'repeat-compose-or-success',
          banId: deepLinkActiveBan.id,
        },
      );
      clearDeepLinkActiveBan();
      return;
    }
    if (lastDeepLinkActiveBanIdRef.current === deepLinkActiveBan.id) return;
    lastDeepLinkActiveBanIdRef.current = deepLinkActiveBan.id;
    skipActiveDeepLinkEntryRef.current = true;
    console.log('[active-deeplink]', {
      banId: deepLinkActiveBan.id,
      action: 'begin-flow',
    });
    const ok = beginActiveBanFromDeepLink(deepLinkActiveBan);
    if (ok) {
      logActiveBanDeeplink('active-card-visible', {
        banId: deepLinkActiveBan.id,
        cardVisible: true,
        bansOverlayOpen: true,
      });
      notifyActiveBanCardVisible(deepLinkActiveBan.id);
    }
    logDeepLinkHandlerResult({
      type: 'active',
      banId: deepLinkActiveBan.id,
      instantBanOpen: sendStarted,
      sendFlowOpen,
      phase: ok ? 'idle' : 'idle',
      selectedUserId: null,
      selectedBanId: deepLinkActiveBan.id,
      overlayQueueLength,
      ok,
      reason: ok ? 'active-ban-card' : 'begin-active-failed',
    });
    if (ok) clearDeepLinkActiveBan();
  }, [
    banSentSuccess,
    clearDeepLinkActiveBan,
    deepLinkActiveBan,
    user?.id,
    beginActiveBanFromDeepLink,
    notifyActiveBanCardVisible,
    sendStarted,
    sendFlowOpen,
    overlayQueueLength,
  ]);

  const finishWhoDismiss = useCallback(() => {
    if (whoDismissTimerRef.current) {
      clearTimeout(whoDismissTimerRef.current);
      whoDismissTimerRef.current = null;
    }
    stopCrossScreenAnim();
    screenTransitionRef.current = null;
    setScreenTransition(null);
    setCrossScreenProgressImmediate(0);
    setWhoExitActive(false);
    setWhoDismissProgress(0);
    setComposeExitProgress(0);
    setComposeDismissing(false);
    setSelectedUser(null);
    setBanText('');
    setDurationMinutes(DEFAULT_DURATION_MINUTES);
    setSendError(null);
    setPhase('idle', 'notification-owner-who-close-projection');
    beginCtaSpringIn();
    if (process.env.NODE_ENV === 'development') {
      console.log('[who-dismiss-set-phase-idle]');
    }
  }, [beginCtaSpringIn, setCrossScreenProgressImmediate, stopCrossScreenAnim, setPhase]);
  finishWhoDismissRef.current = finishWhoDismiss;

  const handleWhoDismissDragProgress = useCallback((progress: number) => {
    setWhoDismissProgress(progress);
  }, []);

  const handleWhoDismissExitStart = useCallback(() => {
    setWhoDismissProgress(1);
    setWhoExitActive(true);
  }, []);

  const handleWhoDismissToLobby = useCallback(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[who-dismiss-on-dismiss-call]', { phase });
    }
    if (screenTransitionRef.current) return;
    if (phase !== 'selectingTarget') return;
    leaveWhoForLegacyRef.current = false;
    dispatchNotificationOwnerBootLobby({ type: 'CLOSE_WHO' });
    if (process.env.NODE_ENV === 'development') {
      requestAnimationFrame(() => {
        console.log('[who-dismiss-phase-after]', {
          note: 'read on next render via flow-render log',
        });
      });
    }
  }, [phase]);


  useEffect(() => {
    return () => {
      if (whoDismissTimerRef.current) {
        clearTimeout(whoDismissTimerRef.current);
      }
      clearCtaExitTimer();
      clearCtaEnterTimer();
      clearCtaBootDelayTimer();
      clearWhoPanelEnterTimer();
      stopCrossScreenAnim();
    };
  }, [
    clearCtaBootDelayTimer,
    clearCtaEnterTimer,
    clearCtaExitTimer,
    clearWhoPanelEnterTimer,
    stopCrossScreenAnim,
  ]);

  const handleSelectUser = useCallback(
    (friend: FriendCard) => {
      if (screenTransitionRef.current) return;
      setSelectedUser(friend);
      setBanText('');
      setDurationMinutes(DEFAULT_DURATION_MINUTES);
      setSendError(null);
      setComposeExitProgress(0);
      setComposeDismissing(false);
      screenTransitionRef.current = 'whoToWhat';
      setScreenTransition('whoToWhat');
      setCrossScreenProgressImmediate(0);
      animateCrossScreenProgress(1, completeWhoToWhat);
    },
    [
      animateCrossScreenProgress,
      completeWhoToWhat,
      setCrossScreenProgressImmediate,
    ],
  );

  const handleComposeExitStart = useCallback(() => {
    setComposeDismissing(true);
    setConfirmEnterKey((k) => k + 1);
  }, []);

  const handleWhatSubmit = useCallback((text: string, duration: number) => {
    setComposeExitProgress(0);
    setComposeDismissing(false);
    setBanText(text);
    setDurationMinutes(duration);
    traceSuccessStateReset('handleWhatSubmit', { nextPhase: 'confirming' });
    traceSuccessHide('handleWhatSubmit');
    setBanSentSuccess(false);
    traceSuccessSnapshotCleared('handleWhatSubmit');
    sendSnapshotRef.current = null;
    confirmEntrySourceRef.current = 'send-flow';
    // Owner enters CONFIRM; authorized projection writes confirming in the same turn.
    leaveWhoForLegacyRef.current = false;
    dispatchNotificationOwnerBootLobby({ type: 'OPEN_CONFIRM' });
    setPhase('confirming', 'notification-owner-confirm-projection');
  }, []);

  const handleWhatBack = useCallback(() => {
    if (screenTransitionRef.current) return;
    setComposeExitProgress(0);
    setComposeDismissing(false);
    screenTransitionRef.current = 'whatToWho';
    setScreenTransition('whatToWho');
    animateCrossScreenProgress(0, completeWhatToWho);
  }, [animateCrossScreenProgress, completeWhatToWho]);

  const handleComposeExitProgress = useCallback((progress: number) => {
    setComposeExitProgress(progress);
  }, []);

  const handleConfirmBack = useCallback(() => {
    setComposeExitProgress(0);
    setComposeDismissing(false);
    traceSuccessStateReset('handleConfirmBack');
    traceSuccessHide('handleConfirmBack');
    setBanSentSuccess(false);
    setSendError(null);
    traceSuccessSnapshotCleared('handleConfirmBack');
    sendSnapshotRef.current = null;
    confirmAbortReleaseRef.current?.();

    const entrySource = confirmEntrySourceRef.current;
    if (isBansOverlayEntrySource(entrySource)) {
      confirmEntrySourceRef.current = 'send-flow';
      setBansTab(entrySource.tab);
      setSelectedBanForDetails(null);
      setSelectedUser(null);
      setBanText('');
      setDurationMinutes(DEFAULT_DURATION_MINUTES);
      releaseOwnerWhoToLobby();
      setPhase('idle');
      setBansOverlayOpen(true);
      setCrossScreenProgressImmediate(0);
      stopCrossScreenAnim();
      screenTransitionRef.current = null;
      setScreenTransition(null);
      return;
    }

    leaveWhoForLegacyRef.current = false;
    dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHAT' });
    setPhase('composingBan', 'notification-owner-what-projection');
  }, [setCrossScreenProgressImmediate, stopCrossScreenAnim]);

  const handleInviteMore = useCallback(() => {
    // WHO invite is Telegram share-to-add-friends — no owner/transition guards.
    // Temporary diagnostics for the pre-existing dead-button blocker.
    const ownerKind = getNotificationOwnerBootLobbyState().presentation.kind;
    const selectedIds = selectedUser
      ? [selectedUser.userId ?? selectedUser.id ?? selectedUser.username ?? null]
      : [];
    const diag = shareInstantBanInviteMore(user?.username ?? null);
    console.info('[98+] WHO_INVITE_HANDLER', {
      fired: true,
      earlyReturnGuard: null,
      phase,
      ownerKind,
      screenTransition: screenTransitionRef.current,
      selectedRecipientIds: selectedIds,
      selectedCount: selectedIds.length,
      actionPending: Boolean(screenTransitionRef.current),
      chainTransitioning: notificationChainTransitioning,
      shareApiCalled: true,
      shareApiResult: diag.shareMethod,
      primaryMethod: diag.primaryMethod,
      fallbackUsed: diag.fallbackUsed,
      finalOutcome: diag.finalOutcome,
      shareUsername: diag.username,
      linkPreview: diag.linkPreview,
      disabled: false,
    });
    if (diag.finalOutcome === 'opened') {
      haptic('light');
      return;
    }
    // Never fail silently — surface toast (copy recovery or hard failure).
    if (whoInviteToastTimerRef.current) {
      clearTimeout(whoInviteToastTimerRef.current);
      whoInviteToastTimerRef.current = null;
    }
    if (diag.finalOutcome === 'copied') {
      setWhoInviteToast('Ссылка скопирована — вставь в чат');
      haptic('medium');
    } else {
      setWhoInviteToast('Не удалось открыть приглашение');
      haptic('heavy');
    }
    whoInviteToastTimerRef.current = setTimeout(() => {
      whoInviteToastTimerRef.current = null;
      setWhoInviteToast(null);
    }, 3200);
  }, [
    user?.username,
    haptic,
    phase,
    selectedUser,
    notificationChainTransitioning,
  ]);

  const handleSendContextChange = useCallback(
    (ctx: { payoffPhase: string; sendTriggered: boolean }) => {
      confirmSendContextRef.current = ctx;
    },
    [],
  );

  const handleBindAbortRelease = useCallback((abort: () => void) => {
    confirmAbortReleaseRef.current = abort;
  }, []);

  const returnToLobbyAfterSendBlock = useCallback(
    (opts: {
      source?: string;
      apiResult?: string;
      blockReason: 'low-energy' | 'daily-limit';
    }) => {
      sendFailedRef.current = true;
      setLowEnergyRedirecting(true);
      setReplySending(false);
      setLobbySendBlockReason(opts.blockReason);
      if (opts.blockReason === 'daily-limit') {
        logSendFlow('daily-limit-redirect-to-lobby', {
          source: opts.source,
          apiResult: opts.apiResult,
        });
      } else {
        logSendFlow('insufficient-energy-stop', {
          source: opts.source,
          apiResult: opts.apiResult,
          attemptId: flowSendAttemptRef.current,
        });
        logSendFlow('insufficient-energy-redirect-to-lobby', {
          source: opts.source,
          apiResult: opts.apiResult,
        });
        logSendFlow('suppress-confirm-error-for-low-energy', {
          source: opts?.source,
        });
      }

      closeSendFlow();
      onClose?.();
      clearReplyDeepLinkState();
      clearIncomingReply();
      clearDeepLinkReplyBan();
      releaseReplyHandoffLock();
      setDeepLinkReplyBooting(false);

      confirmAbortReleaseRef.current?.();
      setConfirmEnterKey((k) => k + 1);
      traceSuccessStateReset('returnToLobbyAfterBlock', {
        blockReason: opts.blockReason,
        nextPhase: 'idle',
      });
      traceSuccessHide('returnToLobbyAfterBlock');
      setBanSentSuccess(false);
      setSendSuccessCardMounted(false, {
        source:
          opts.blockReason === 'daily-limit'
            ? 'daily-limit-redirect'
            : 'low-energy-redirect',
      });
      traceSuccessSnapshotCleared('returnToLobbyAfterBlock');
      sendSnapshotRef.current = null;
      confirmEntrySourceRef.current = 'send-flow';
      stopCrossScreenAnim();
      screenTransitionRef.current = null;
      setScreenTransition(null);
      setSelectedUser(null);
      setBanText('');
      setDurationMinutes(DEFAULT_DURATION_MINUTES);
      setSendError(null);
      setWhoExitActive(false);
      setWhoDismissProgress(0);
      setComposeExitProgress(0);
      setComposeDismissing(false);
      setCrossScreenProgressImmediate(0);
      setBansOverlayOpen(false);
      setSelectedBanForDetails(null);
      releaseOwnerWhoToLobby();
      setPhase('idle');
      setCtaState('hidden');
      setLowInfluenceRevealed(opts.blockReason === 'low-energy');
      if (opts.blockReason === 'daily-limit') {
        setDailyLimitBlockedSignal((n) => n + 1);
      } else {
        setLowEnergyBlockedSignal((n) => n + 1);
      }
      openLobby();
      triggerLobbyBlockedHaptic();
      logSendFlow('lobby-hint-shown', {
        source: opts.source,
        blockReason: opts.blockReason,
      });
      logEnergyGate('return-to-lobby', {
        phase: 'idle',
        incomingReplyBanId: null,
        sendFlowOpen: false,
        source: opts.source,
        apiResult: opts.apiResult,
        blockReason: opts.blockReason,
      });
      if (opts.blockReason === 'daily-limit') {
        logEnergyGate('dailyLimitRedirect', {
          source: opts.source,
          apiResult: opts.apiResult,
        });
        logEnergyGate('daily-limit-hint-visible', {});
      } else {
        logEnergyGate('low-energy-hint-visible', {});
      }
      lockNotificationQueue('low-energy-gate');
      logOverlayPriority('low-energy-keep-locked', {});
      beginCtaSpringIn();
      window.setTimeout(() => setLowEnergyRedirecting(false), 0);
    },
    [
      beginCtaSpringIn,
      clearDeepLinkReplyBan,
      clearIncomingReply,
      clearReplyDeepLinkState,
      closeSendFlow,
      onClose,
      openLobby,
      releaseReplyHandoffLock,
      setCrossScreenProgressImmediate,
      setDeepLinkReplyBooting,
      setSendSuccessCardMounted,
      stopCrossScreenAnim,
    ],
  );

  const returnToLobbyAfterLowEnergy = useCallback(
    (opts?: { source?: string; apiResult?: string }) => {
      returnToLobbyAfterSendBlock({
        ...opts,
        blockReason: 'low-energy',
      });
    },
    [returnToLobbyAfterSendBlock],
  );

  const returnToLobbyAfterDailyLimit = useCallback(
    (opts?: { source?: string; apiResult?: string }) => {
      returnToLobbyAfterSendBlock({
        ...opts,
        blockReason: 'daily-limit',
      });
    },
    [returnToLobbyAfterSendBlock],
  );

  returnToLobbyAfterLowEnergyRef.current = returnToLobbyAfterLowEnergy;
  returnToLobbyAfterDailyLimitRef.current = returnToLobbyAfterDailyLimit;

  const executeSend = useCallback(async (): Promise<'started' | 'skipped' | 'rejected'> => {
    logHoldDebug('entered executeSend', {
      phase,
      sendStarted,
      sendFlowOpen,
      replyComposeActive,
      replyToBanId,
      pinnedReplyToBanId: getPinnedReplyToBanId(),
      selectedUserId:
        selectedUser?.userId ?? selectedUser?.id ?? selectedUser?.username ?? null,
      currentUserId: user?.id ?? null,
      banTextLen: banText.trim().length,
      durationMinutes,
      activeOverlayKind,
      inFlight,
      sharing,
      replySending,
    });

    const snap = sendSnapshotRef.current;
    if (!snap) {
      logHoldBlocked('no-snapshot');
      instantBanDebug('send-skipped', { reason: 'no-snapshot' });
      return 'rejected';
    }

    sendFailedRef.current = false;
    setLowEnergyRedirecting(false);
    const attemptId = ++flowSendAttemptRef.current;

    const { banText: snapText, selectedUser: snapUser, durationMinutes: snapDuration } =
      snap;

    const username = (snapUser.username ?? '').replace(/^@/, '').trim();
    const resolved = safeResolveReceiverTarget(username, safeFriends, {
      receiverUserId: snapUser.userId ?? null,
      receiverTelegramId: snapUser.telegramId ?? null,
    });
    const devTarget = resolveDevSendTarget(safeFriends, `@${username}`, {
      username: user?.username,
      userId: user?.id,
    });

    const sendTarget = devTarget ?? {
      receiverUsername: `@${username}`,
      receiverUserId: resolved.receiverUserId ?? snapUser.userId ?? null,
      receiverTelegramId:
        resolved.receiverTelegramId ?? snapUser.telegramId ?? null,
    };

    const hasReceiverTarget = Boolean(
      username || sendTarget.receiverUserId || sendTarget.receiverTelegramId,
    );
    const instantDirectSend =
      hasReceiverTarget &&
      (resolved.isRegistered ||
        Boolean(sendTarget.receiverUserId || sendTarget.receiverTelegramId));

    const receiverUsernameForApi = (() => {
      if (username) {
        return sendTarget.receiverUsername.startsWith('@')
          ? sendTarget.receiverUsername
          : `@${sendTarget.receiverUsername.replace(/^@/, '')}`;
      }
      if (sendTarget.receiverUserId) {
        return `@${sendTarget.receiverUserId}`;
      }
      const name = snapUser.firstName?.trim().replace(/\s+/g, '');
      if (name) return `@${name}`;
      return '@receiver';
    })();

    if (typeof window !== 'undefined') {
      console.info('[98+] send API target', {
        getApiUrl: getApiUrl(),
        localStorage: localStorage.getItem('98plus_api_url'),
        configApiUrl: window.__98_CONFIG__?.apiUrl,
      });
    }

    const logSendRejected = (reason: string, extra?: Record<string, unknown>) => {
      console.info('[98+] sendBan failed', {
        stage: 'pre-flight',
        reason,
        textLength: snapText.trim().length,
        durationMinutes: snapDuration,
        selectedUserId: snapUser.userId ?? snapUser.id ?? null,
        selectedUsername: snapUser.username ?? null,
        receiverUserId: sendTarget.receiverUserId,
        receiverTelegramId: sendTarget.receiverTelegramId,
        receiverUsernameForApi,
        hasToken: Boolean(token),
        ...extra,
      });
    };

    instantBanSendBeforeDebug({
      banText: snapText,
      selectedUserId: snapUser.id ?? snapUser.userId ?? null,
      selectedUsername: snapUser.username ?? null,
      durationMinutes: snapDuration,
      senderUserId: user?.id ?? null,
      currentUserId: user?.id ?? null,
      payoffPhase: confirmSendContextRef.current.payoffPhase,
      sendTriggered: confirmSendContextRef.current.sendTriggered,
      inFlight,
      sharing,
      hasToken: Boolean(token),
      receiverUserId: sendTarget.receiverUserId,
      receiverTelegramId: sendTarget.receiverTelegramId,
      devAuth: isClientDevAuthEnabled(),
      devPeerResolved: Boolean(devTarget?.receiverUserId),
      instantDirectSend,
      isRegistered: resolved.isRegistered,
    });

    if (!token) {
      logHoldBlocked('no-token');
      logSendRejected('no-token');
      setSendError('Не получилось отправить запрет');
      return 'rejected';
    }

    const text = snapText.trim();
    if (text.length < 3) {
      logHoldBlocked('text-too-short', { textLength: text.length });
      logSendRejected('text-too-short', { textLength: text.length });
      setSendError('Не получилось отправить запрет');
      return 'rejected';
    }

    if (!hasReceiverTarget) {
      logHoldBlocked('no-receiver', {
        selectedUserId: snapUser.userId ?? snapUser.id ?? null,
        username,
      });
      logSendRejected('no-receiver');
      setSendError('Не получилось отправить запрет');
      return 'rejected';
    }

    if (
      snapUser.userId &&
      user?.id &&
      snapUser.userId === user.id
    ) {
      logHoldBlocked('receiver-is-self', {
        selectedUserId: snapUser.userId,
        currentUserId: user.id,
      });
      setSendError('Не получилось отправить запрет');
      return 'rejected';
    }

    if (isClientDevAuthEnabled() && !sendTarget.receiverUserId) {
      logHoldBlocked('dev-peer-missing');
      logSendRejected('dev-peer-missing');
      setSendError('Выбери Dev Peer в списке людей');
      return 'rejected';
    }

    const pinnedReplyToBanId =
      snap.replyToBanId ??
      getPinnedReplyToBanId() ??
      replyToBanId ??
      incomingReplyBanId ??
      deepLinkReplyBan?.id ??
      replyDeepLinkBanId ??
      getReplyParentActiveBanId() ??
      null;
    const source = resolveSendFlowSource({
      replyToBanId: pinnedReplyToBanId,
      incomingReplyBanId: incomingReplyBanId ?? getReplyParentActiveBanId(),
      deepLinkReplyBanId: deepLinkReplyBan?.id ?? null,
      replyDeepLinkBanId,
    });
    const isReplyFlow = source === 'reply_from_bot';
    const effectiveReplyBanId = pinnedReplyToBanId;
    const receiverId =
      sendTarget.receiverUserId ?? snapUser.userId ?? snapUser.id ?? null;
    const selectedUserId = snapUser.userId ?? snapUser.id ?? null;
    const replyEndpoint = effectiveReplyBanId
      ? `/bans/${effectiveReplyBanId}/reply`
      : null;

    console.log('[reply-context-snapshot]', {
      parentBanId: effectiveReplyBanId,
      replyToBanId,
      incomingReplyBanId,
      selectedTargetId: selectedUserId,
      recipientId: receiverId,
      pinnedReplyToBanId: getPinnedReplyToBanId(),
      replyDeepLinkBanId,
      deepLinkReplyBanId: deepLinkReplyBan?.id ?? null,
    });

    console.log('[reply-send-debug] endpoint', replyEndpoint ?? '/bans/send');
    console.log('[reply-send-debug] replyToBanId', pinnedReplyToBanId);
    console.log('[reply-send-debug] selectedUser.id', selectedUserId);
    console.log('[reply-send-debug] currentUser.id', user?.id ?? null);
    console.log('[reply-send-debug] payload', {
      text: snapText,
      durationMinutes: snapDuration,
    });
    console.log('[reply-send-debug] currentUser', user?.id ?? null);
    console.log('[reply-send-debug] selectedUser', snapUser);
    console.log('[reply-send-debug] receiverId', receiverId);
    console.log('[reply-send-debug] originalBanId', pinnedReplyToBanId);
    console.log('[reply-send-debug] banText', snapText);
    console.log('[reply-send-debug] duration', snapDuration);

    logSendFlow('hold-start', {
      source,
      isReplyFlow,
      effectiveReplyBanId,
      attemptId,
    });

    if ((isReplyFlow || pinnedReplyToBanId) && !effectiveReplyBanId) {
      logHoldBlocked('reply-ban-id-missing', {
        pinnedReplyToBanId,
        isReplyFlow,
        source,
      });
      console.error('[reply-send-debug] WRONG_ENDPOINT', {
        reason: 'reply-ban-id-missing',
        pinnedReplyToBanId,
        isReplyFlow,
        source,
      });
      logSendRejected('reply-ban-id-missing', { source, attemptId });
      setSendError('Не получилось отправить запрет');
      confirmAbortReleaseRef.current?.();
      return 'rejected';
    }

    logEnergyGate('confirm-hold', {
      source,
      incomingReplyBanId,
      selectedUserId: snapUser.userId ?? snapUser.id ?? null,
      influencePercent,
      energyLoaded,
    });

    const canUseCachedEnergyGate =
      energyLoaded && canLobbySendBan(energyLoaded, influencePercent);
    let energyGate: ConfirmSubmitEnergyDecision;
    if (canUseCachedEnergyGate) {
      energyGate = {
        allowed: true,
        influencePercent,
        energyLoaded: true,
        energyBefore: influencePercent,
      };
      void evaluateConfirmSubmitEnergy(token, {
        energyLoaded,
        influencePercent,
      }).catch(() => {});
    } else {
      energyGate = await evaluateConfirmSubmitEnergy(token, {
        energyLoaded,
        influencePercent,
      });
    }
    void refreshUser().catch(() => {});

    logEnergyGate('confirm-hold', {
      source,
      energyBefore: energyGate.energyBefore,
      canSend: energyGate.allowed,
      influencePercent: energyGate.influencePercent,
      energyLoaded: energyGate.energyLoaded,
    });

    if (!energyGate.allowed) {
      logEnergyGate('low-energy-block-submit', {
        source,
        energyBefore: energyGate.energyBefore,
        canSend: false,
        influencePercent: energyGate.influencePercent,
        energyLoaded: energyGate.energyLoaded,
        incomingReplyBanId,
      });
      returnToLobbyAfterLowEnergy({ source, apiResult: 'client-gate' });
      return 'rejected';
    }

    logEnergyGate('enough-energy', {
      source,
      energyBefore: energyGate.energyBefore,
      canSend: true,
      influencePercent: energyGate.influencePercent,
      energyLoaded: energyGate.energyLoaded,
    });

    if (!banSentSuccess) {
      setSendError(null);
    }

    console.log('[send-ban-start]', {
      attemptId,
      replyMode: effectiveReplyBanId ? 'reply' : 'normal',
      parentBanId: effectiveReplyBanId,
      recipientId: receiverId,
      text,
      duration: snapDuration,
    });

    if (effectiveReplyBanId && (!receiverId || text.length < 3)) {
      console.log('[send-ban-error]', {
        attemptId,
        parentBanId: effectiveReplyBanId,
        error: 'invalid-reply-payload',
        recipientId: receiverId,
        textLength: text.length,
      });
      setSendError('Не получилось отправить запрет');
      confirmAbortReleaseRef.current?.();
      return 'rejected';
    }

    console.info('[98+] sendBan payload', {
      textLength: text.length,
      durationMinutes: snapDuration,
      receiverUserId: sendTarget.receiverUserId,
      receiverTelegramId: sendTarget.receiverTelegramId,
      receiverUsername: receiverUsernameForApi,
      selectedUserId: snapUser.userId ?? snapUser.id ?? null,
    });

    const openedSendFlowForReplyPost =
      Boolean(pinnedReplyToBanId) && !sendFlowOpen;
    if (openedSendFlowForReplyPost) {
      openSendFlow();
    }

    if (effectiveReplyBanId && replySending) {
      logHoldBlocked('reply-in-flight');
      instantBanDebug('send-skipped', { reason: 'reply-in-flight' });
      return 'skipped';
    }
    if (!effectiveReplyBanId && inFlight) {
      logHoldBlocked('send-in-flight');
      instantBanDebug('send-skipped', { reason: 'hook-in-flight' });
      return 'skipped';
    }

    logSendFlow('await-api-success', { attemptId });
    sendStartedAtRef.current = performance.now();
    console.log('[send-start]', {
      attemptId,
      replyMode: effectiveReplyBanId ? 'reply' : 'normal',
      endpoint: effectiveReplyBanId
        ? `/bans/${effectiveReplyBanId}/reply`
        : '/bans/send',
      cachedEnergyGate: canUseCachedEnergyGate,
    });
    window.__debug98log?.('[send-start]', {
      attemptId,
      replyMode: effectiveReplyBanId ? 'reply' : 'normal',
      endpoint: effectiveReplyBanId
        ? `/bans/${effectiveReplyBanId}/reply`
        : '/bans/send',
      cachedEnergyGate: canUseCachedEnergyGate,
    });

    void (async () => {
      try {
        if (effectiveReplyBanId) {
          setReplySending(true);
          const endpoint = `/bans/${effectiveReplyBanId}/reply`;
          const replyPayload = {
            text,
            durationMinutes: snapDuration,
          };
          console.log('[send-ban-payload]', {
            attemptId,
            payload: replyPayload,
            endpoint,
            parentBanId: effectiveReplyBanId,
          });
          console.log('[reply-send-debug] send payload', {
            endpoint,
            payload: replyPayload,
          });
          logSendFlow('api-request', { endpoint, attemptId });
          try {
            const res = await api<{
              parentId: string;
              replyBan: BanInteraction;
              session: SessionState;
            }>(endpoint, {
              method: 'POST',
              token,
              body: JSON.stringify(replyPayload),
              retries: 0,
              timeoutMs: DEFAULT_SEND_TIMEOUT_MS,
            });
            logSendBanResponseTrace({
              source: 'InstantBanFlow:executeSend:reply-api-ok',
              banText: text,
              targetUserId: receiverId,
              durationMinutes: snapDuration,
              httpStatus: 200,
              ok: true,
              responseJson: {
                parentId: res.parentId ?? null,
                replyBanId: res.replyBan?.id ?? null,
                hasSession: Boolean(res.session),
              },
              createdBanId: res.replyBan?.id ?? null,
              successCardWillOpen: Boolean(res.replyBan?.id),
              failureReason: null,
            });
            logSendFlow('api-response', {
              status: 'ok',
              banId: res.replyBan?.id ?? null,
              attemptId,
            });
            console.log('[send-response]', {
              attemptId,
              banId: res.replyBan?.id ?? null,
              elapsedMs:
                sendStartedAtRef.current != null
                  ? Math.round(performance.now() - sendStartedAtRef.current)
                  : null,
              endpoint: 'reply',
            });
            window.__debug98log?.('[send-response]', {
              attemptId,
              banId: res.replyBan?.id ?? null,
              elapsedMs:
                sendStartedAtRef.current != null
                  ? Math.round(performance.now() - sendStartedAtRef.current)
                  : null,
              endpoint: 'reply',
            });
            console.log('[send-ban-success]', {
              attemptId,
              banId: res.replyBan?.id ?? null,
              parentBanId: effectiveReplyBanId,
            });
            if (!res.replyBan?.id) {
              logSendBanResponseTrace({
                source: 'InstantBanFlow:executeSend:reply-missing-ban-id',
                banText: text,
                targetUserId: receiverId,
                durationMinutes: snapDuration,
                httpStatus: 200,
                ok: true,
                responseJson: {
                  parentId: res.parentId ?? null,
                  replyBanId: null,
                },
                createdBanId: null,
                successCardWillOpen: false,
                failureReason: 'reply-response-ok-but-ban-id-missing',
              });
              throw new Error('Сервер не подтвердил запрет');
            }
            if (res.session) applySession(res.session);
            scheduleDeferredSync();
            const parentBanIdForStorage =
              res.parentId?.trim() || effectiveReplyBanId;
            clearIncomingReply({ finalizeBanId: parentBanIdForStorage });
            openSuccess(res.replyBan.id, attemptId);
          } finally {
            setReplySending(false);
            if (openedSendFlowForReplyPost) {
              closeSendFlow();
            }
          }
          return;
        }

        if (pinnedReplyToBanId || isReplyFlow) {
          if (openedSendFlowForReplyPost) {
            closeSendFlow();
          }
          logHoldBlocked('reply-context-fell-through-to-normal-send', {
            pinnedReplyToBanId,
            effectiveReplyBanId,
            isReplyFlow,
            source,
          });
          console.error('[reply-send-debug] WRONG_ENDPOINT', {
            reason: 'reply-context-fell-through-to-normal-send',
            pinnedReplyToBanId,
            effectiveReplyBanId,
            isReplyFlow,
            source,
          });
          setSendError('Не получилось отправить запрет');
          traceSuccessHide('executeSend-reply-fell-through');
          setBanSentSuccess(false);
          confirmAbortReleaseRef.current?.();
          return;
        }

        logSendFlow('api-request', { endpoint: '/bans/send', attemptId });
        const outcome = await send({
          text,
          receiverUsername: receiverUsernameForApi,
          receiverUserId: sendTarget.receiverUserId,
          receiverTelegramId: sendTarget.receiverTelegramId,
          durationMinutes: snapDuration,
        });
        logSendBanResponseTrace({
          source: 'InstantBanFlow:executeSend:after-send-hook',
          banText: text,
          targetUserId: sendTarget.receiverUserId ?? receiverId,
          durationMinutes: snapDuration,
          httpStatus: null,
          ok: outcome !== 'skipped',
          successCardWillOpen: outcome !== 'skipped',
          failureReason:
            outcome === 'skipped' ? 'send-hook-returned-skipped' : null,
        });
        if (outcome === 'skipped') {
          instantBanDebug('send-skipped', { reason: 'hook-in-flight' });
        }
      } catch (e) {
        logSendFlow('api-error', {
          status: (e as { status?: number }).status,
          message: e instanceof Error ? e.message : String(e),
          attemptId,
        });
        if (isDailyBanLimitSendFailure(e)) {
          logEnergyGate('dailyLimitRedirect', {
            source,
            energyBefore: energyGate.influencePercent,
            canSend: false,
            apiResult: 'DAILY_BAN_LIMIT',
          });
          returnToLobbyAfterDailyLimit({
            source,
            apiResult: 'DAILY_BAN_LIMIT',
          });
          return;
        }
        if (isLowEnergySendFailure(e)) {
          logEnergyGate('insufficientEnergyRedirect', {
            source,
            energyBefore: energyGate.influencePercent,
            canSend: false,
            apiResult: 'INSUFFICIENT_ENERGY',
          });
          returnToLobbyAfterLowEnergy({
            source,
            apiResult: 'INSUFFICIENT_ENERGY',
          });
          return;
        }
        const message =
          e instanceof Error ? e.message : 'Не получилось отправить запрет';
        logSendBanResponseTrace({
          source: 'InstantBanFlow:executeSend:catch',
          banText: text,
          targetUserId: sendTarget.receiverUserId ?? receiverId,
          durationMinutes: snapDuration,
          httpStatus: (e as { status?: number }).status ?? null,
          ok: false,
          errorName: e instanceof Error ? e.name : typeof e,
          errorMessage: message,
          successCardWillOpen: false,
          failureReason: 'executeSend-catch',
        });
        console.log('[send-ban-error]', {
          attemptId,
          parentBanId: effectiveReplyBanId,
          error: message,
          status: (e as { status?: number }).status,
          responseBody: message,
        });
        console.log('[reply-send-debug] send error response', {
          message,
          status: (e as { status?: number }).status,
          error: e,
          source,
          isReplyFlow,
          effectiveReplyBanId,
          pinnedReplyToBanId: snap.replyToBanId ?? getPinnedReplyToBanId(),
        });
        console.info('[98+] sendBan failed', {
          stage: 'request',
          message,
          error: e instanceof Error ? e.name : typeof e,
          status: (e as { status?: number }).status,
          source,
        });
        instantBanSendErrorDebug({ message, error: e });
        setSendError(message);
        traceSuccessHide('executeSend-catch');
        setBanSentSuccess(false);
        confirmAbortReleaseRef.current?.();
      }
    })();

    return 'started';
  }, [
    token,
    safeFriends,
    user?.username,
    user?.id,
    send,
    banSentSuccess,
    incomingReplyBanId,
    replyToBanId,
    replyComposeActive,
    getPinnedReplyToBanId,
    getReplyParentActiveBanId,
    replySending,
    openSendFlow,
    closeSendFlow,
    sendFlowOpen,
    phase,
    selectedUser,
    banText,
    activeOverlayKind,
    inFlight,
    sharing,
    applySession,
    scheduleDeferredSync,
    clearIncomingReply,
    openSuccess,
    energyLoaded,
    influencePercent,
    refreshUser,
    returnToLobbyAfterLowEnergy,
    returnToLobbyAfterDailyLimit,
    deepLinkReplyBan,
    replyDeepLinkBanId,
    clearDeepLinkReplyBan,
    releaseReplyHandoffLock,
    setDeepLinkReplyBooting,
  ]);

  const captureSendSnapshot = useCallback(() => {
    logHoldDebug('snapshot-attempt', {
      phase,
      sendStarted,
      sendFlowOpen,
      replyComposeActive,
      replyToBanId,
      pinnedReplyToBanId: getPinnedReplyToBanId(),
      selectedUser,
      currentUserId: user?.id ?? null,
      banText,
      durationMinutes,
      activeOverlayKind,
    });
    if (!selectedUser) {
      logHoldBlocked('no-selectedUser');
      return false;
    }
    const pinnedReplyId =
      getPinnedReplyToBanId() ??
      replyToBanId ??
      incomingReplyBanId ??
      deepLinkReplyBan?.id ??
      replyDeepLinkBanId ??
      getReplyParentActiveBanId() ??
      null;
    sendSnapshotRef.current = {
      banText,
      selectedUser,
      durationMinutes,
      replyToBanId: pinnedReplyId,
    };
    console.log('[reply-send-debug] snapshot-captured', {
      replyToBanId: pinnedReplyId,
      selectedUserId:
        selectedUser.userId ?? selectedUser.id ?? selectedUser.username ?? null,
    });
    return true;
  }, [
    banText,
    selectedUser,
    durationMinutes,
    getPinnedReplyToBanId,
    getReplyParentActiveBanId,
    replyToBanId,
    incomingReplyBanId,
    deepLinkReplyBan?.id,
    replyDeepLinkBanId,
    phase,
    sendStarted,
    sendFlowOpen,
    replyComposeActive,
    user?.id,
    activeOverlayKind,
  ]);

  const handleConfirmRelease = useCallback(async () => {
    logHoldDebug('entered', {
      phase,
      sendStarted,
      sendFlowOpen,
      replyComposeActive,
      replyToBanId,
      pinnedReplyToBanId: getPinnedReplyToBanId(),
      selectedUser,
      currentUserId: user?.id ?? null,
      banText,
      durationMinutes,
      activeOverlayKind,
      replyLobbyBlocked,
      confirmActive:
        phase === 'confirming' && selectedUser != null && !banSentSuccess,
      inFlight,
      sharing,
      replySending,
    });
    instantBanDebug('confirm-release', {
      payoffPending: confirmSendContextRef.current.sendTriggered,
    });
    if (!captureSendSnapshot()) {
      logHoldBlocked('captureSendSnapshot-failed');
      confirmAbortReleaseRef.current?.();
      return;
    }

    const outcome = await executeSend();
    if (outcome === 'rejected') {
      instantBanDebug('send-abort-release', { reason: 'send-rejected' });
      if (!sendFailedRef.current) {
        confirmAbortReleaseRef.current?.();
      }
    }
  }, [
    captureSendSnapshot,
    executeSend,
    phase,
    sendStarted,
    sendFlowOpen,
    replyComposeActive,
    replyToBanId,
    getPinnedReplyToBanId,
    selectedUser,
    user?.id,
    banText,
    durationMinutes,
    activeOverlayKind,
    replyLobbyBlocked,
    banSentSuccess,
    inFlight,
    sharing,
    replySending,
  ]);

  const handleRetrySend = useCallback(async () => {
    if (!captureSendSnapshot()) return;
    await executeSend();
  }, [captureSendSnapshot, executeSend]);

  const lobbyInfluencePercent = useMemo(
    () => Math.min(100, Math.max(0, influencePercent)),
    [influencePercent],
  );

  const liteMode = isInstantBanLiteMode();
  /** What layout in pager — from friend pick, not from phase commit (avoids vertical jump). */
  const whatMobileSafe = Boolean(selectedUser) && showCrossScreenPager;

  const composeOverlayStyle = useMemo(
    () =>
      ({
        '--compose-exit-progress': String(composeExitProgress),
      }) as CSSProperties,
    [composeExitProgress],
  );

  const arenaOverlayStyle = useMemo((): CSSProperties | undefined => {
    if (phase === 'composingBan' || composeExitProgress > 0) {
      return composeOverlayStyle;
    }
    return undefined;
  }, [composeExitProgress, composeOverlayStyle, phase]);

  const whoDimStyle = useMemo(
    () =>
      ({
        '--who-dismiss-progress': String(whoDismissProgress),
      }) as CSSProperties,
    [whoDismissProgress],
  );

  const crossScreenStyle = useMemo(
    () =>
      ({
        '--cross-screen-progress': String(crossScreenProgress),
      }) as CSSProperties,
    [crossScreenProgress],
  );

  const confirmActive =
    sendFlowSurfaces.confirm && selectedUser != null && !banSentSuccess;
  const orbCompressActive =
    !banSentSuccess &&
    (composeDismissing || (phase === 'confirming' && selectedUser != null));
  const hideLobbyBootLogoOnly = shouldHideLobbyBootLogoOnly({
    phase,
    replyComposeActive,
  });
  const confirmLayoutActive = orbCompressActive;
  const successSnapshot = sendSnapshotRef.current;

  useLayoutEffect(() => {
    if (banSentSuccess && !successSnapshot) {
      logSuccessCardSkippedBug({
        reason: 'missing-snapshot',
        sessionId: successCardSessionRef.current,
        lastSendSuccessBanId: lastSendSuccessBanIdRef.current,
      });
    }
  }, [banSentSuccess, successSnapshot]);

  const confirmSendError =
    sendError && !lowEnergyRedirecting && !sendFailedRef.current
      ? sendError
      : null;

  const confirmOrb = useConfirmOrbController({
    active: confirmActive,
    compressActive: orbCompressActive,
    enterKey: confirmEnterKey,
    influencePercent: lobbyInfluencePercent,
    sending: inFlight || sharing || replySending,
    error: confirmSendError,
    orbWrapRef: lobbyOrbMountRef,
    onConfirm: () => void handleConfirmRelease(),
    onSendContextChange: handleSendContextChange,
    onBindAbortRelease: handleBindAbortRelease,
  });

  const {
    launchStage,
    logoScaleActive: bootLogoScaleActive,
    ringScaleActive: bootRingScaleActive,
    fillActive: bootFillActive,
    logoLocked: bootLogoLocked,
    ringScaleLocked: bootRingScaleLocked,
    bootIntroActive,
    fillTargetPercent,
    onLogoScaleEnd: onBootLogoScaleEnd,
    onRingScaleEnd: onBootRingScaleEnd,
    onFillEnd: onBootFillEnd,
    logoScaleMs: bootLogoScaleMs,
    logoScaleDelayMs: bootLogoScaleDelayMs,
    ringScaleMs: bootRingScaleMs,
    fillMs: bootFillMs,
  } = bootIntro;

  useEffect(() => {
    const prev = lobbyBootIntroPrimedPrevRef.current;
    if (prev === lobbyBootIntroPrimed) return;
    console.log('LOBBY_BOOT_PRIMED_STATE_TRACE', {
      from: prev,
      to: lobbyBootIntroPrimed,
      reason: 'subscribeLobbyBootIntroSession-change',
      phase,
      showLobby: lobbyOpen,
      isIdlePhase: phase === 'idle',
      energyLoaded,
      energyReady: energyLoaded,
      activeOverlayKind,
      notificationChainTransitioning,
      queueLen: overlayQueueLength,
      pendingLen: pendingStartupInteractions,
    });
    lobbyBootIntroPrimedPrevRef.current = lobbyBootIntroPrimed;
  }, [
    lobbyBootIntroPrimed,
    phase,
    lobbyOpen,
    energyLoaded,
    activeOverlayKind,
    notificationChainTransitioning,
    overlayQueueLength,
    pendingStartupInteractions,
  ]);

  useEffect(() => {
    if (lobbyBootIntroPrimed) {
      console.log('LOBBY_BOOT_PRIMED_GATE_TRACE', {
        willPrime: false,
        blockedBy: 'already-primed',
        reason: 'boot-prime-watch',
        phase,
        showLobby: lobbyOpen,
        isIdlePhase: phase === 'idle',
        energyLoaded,
        energyReady: energyLoaded,
        lobbyBootIntroPrimed,
        activeOverlayKind,
        notificationChainTransitioning,
        queueLen: overlayQueueLength,
        pendingLen: pendingStartupInteractions,
        launchStage,
        bootIntroActive,
        bootFillActive,
        fillTargetPercent,
      });
      return;
    }
    const blockedBy =
      launchStage === 'logoEnter'
        ? 'launchStage-logoEnter'
        : launchStage === 'ringAndFill' && !bootFillActive && fillTargetPercent === 0
          ? energyLoaded
            ? 'ringAndFill-zero-target'
            : 'ringAndFill-no-energy-no-fill-target'
          : launchStage === 'ringAndFill' && bootFillActive
            ? 'ringAndFill-waiting-fill-end'
            : launchStage === 'ringAndFill'
              ? 'ringAndFill-waiting-ring-or-fill'
              : launchStage === 'done'
                ? 'launchStage-done-session-not-primed'
                : `launchStage-${launchStage}`;
    const willPrime =
      launchStage === 'ringAndFill' &&
      (bootFillActive || fillTargetPercent > 0 || !energyLoaded);
    console.log('LOBBY_BOOT_PRIMED_GATE_TRACE', {
      willPrime,
      blockedBy,
      reason: 'boot-prime-watch',
      phase,
      showLobby: lobbyOpen,
      isIdlePhase: phase === 'idle',
      energyLoaded,
      energyReady: energyLoaded,
      lobbyBootIntroPrimed,
      activeOverlayKind,
      notificationChainTransitioning,
      queueLen: overlayQueueLength,
      pendingLen: pendingStartupInteractions,
      launchStage,
      bootIntroActive,
      bootFillActive,
      fillTargetPercent,
    });
  }, [
    lobbyBootIntroPrimed,
    launchStage,
    bootIntroActive,
    bootFillActive,
    fillTargetPercent,
    energyLoaded,
    phase,
    lobbyOpen,
    activeOverlayKind,
    notificationChainTransitioning,
    overlayQueueLength,
    pendingStartupInteractions,
  ]);

  const onBootLogoScaleEndTraced = () => {
    console.log('LOBBY_BOOT_PRIMED_GATE_TRACE', {
      willPrime: false,
      blockedBy: 'onBootLogoScaleEnd-advances-to-ring-not-prime',
      reason: 'onBootLogoScaleEnd-before',
      phase,
      showLobby: lobbyOpen,
      isIdlePhase: phase === 'idle',
      energyLoaded,
      energyReady: energyLoaded,
      lobbyBootIntroPrimed,
      activeOverlayKind,
      notificationChainTransitioning,
      queueLen: overlayQueueLength,
      pendingLen: pendingStartupInteractions,
      launchStage,
      bootIntroActive,
      bootFillActive,
      fillTargetPercent,
    });
    onBootLogoScaleEnd();
  };

  const onBootRingScaleEndTraced = () => {
    const fromPrimed = isLobbyBootIntroPrimed();
    const willPrime =
      !fromPrimed && launchStage === 'ringAndFill' && fillTargetPercent === 0;
    console.log('LOBBY_BOOT_PRIMED_GATE_TRACE', {
      willPrime,
      blockedBy: fromPrimed
        ? 'already-primed'
        : launchStage !== 'ringAndFill'
          ? `launchStage-${launchStage}`
          : fillTargetPercent !== 0
            ? 'fill-target-still-pending'
            : null,
      reason: 'onBootRingScaleEnd-before-finishPrimed',
      phase,
      showLobby: lobbyOpen,
      isIdlePhase: phase === 'idle',
      energyLoaded,
      energyReady: energyLoaded,
      lobbyBootIntroPrimed: fromPrimed,
      activeOverlayKind,
      notificationChainTransitioning,
      queueLen: overlayQueueLength,
      pendingLen: pendingStartupInteractions,
      launchStage,
      bootIntroActive,
      bootFillActive,
      fillTargetPercent,
    });
    if (willPrime) {
      console.log('LOBBY_BOOT_PRIMED_STATE_TRACE', {
        from: fromPrimed,
        to: true,
        reason: 'onBootRingScaleEnd-finishPrimed',
        phase,
        showLobby: lobbyOpen,
        isIdlePhase: phase === 'idle',
        energyLoaded,
        energyReady: energyLoaded,
        activeOverlayKind,
        notificationChainTransitioning,
        queueLen: overlayQueueLength,
        pendingLen: pendingStartupInteractions,
      });
    }
    onBootRingScaleEnd();
  };

  const onBootFillEndTraced = () => {
    const fromPrimed = isLobbyBootIntroPrimed();
    const willPrime = !fromPrimed && launchStage === 'ringAndFill';
    console.log('LOBBY_BOOT_PRIMED_GATE_TRACE', {
      willPrime,
      blockedBy: fromPrimed
        ? 'already-primed'
        : launchStage !== 'ringAndFill'
          ? `launchStage-${launchStage}`
          : fillTargetPercent === 0
            ? 'fill-target-zero'
            : null,
      reason: 'onBootFillEnd-before-finishPrimed',
      phase,
      showLobby: lobbyOpen,
      isIdlePhase: phase === 'idle',
      energyLoaded,
      energyReady: energyLoaded,
      lobbyBootIntroPrimed: fromPrimed,
      activeOverlayKind,
      notificationChainTransitioning,
      queueLen: overlayQueueLength,
      pendingLen: pendingStartupInteractions,
      launchStage,
      bootIntroActive,
      bootFillActive,
      fillTargetPercent,
    });
    if (willPrime) {
      console.log('LOBBY_BOOT_PRIMED_STATE_TRACE', {
        from: fromPrimed,
        to: true,
        reason: 'onBootFillEnd-finishPrimed',
        phase,
        showLobby: lobbyOpen,
        isIdlePhase: phase === 'idle',
        energyLoaded,
        energyReady: energyLoaded,
        activeOverlayKind,
        notificationChainTransitioning,
        queueLen: overlayQueueLength,
        pendingLen: pendingStartupInteractions,
      });
    }
    onBootFillEnd();
  };

  const legacyLobbyOrbBlockersKey = legacyLobbyOrbBlockers.join('|');

  const confirmStripOrbMountBlockedReason = resolveOrbMountBlockedReason({
    lobbyOrbVisible,
    showLobbyOrb,
    lobbyBootIntroPrimed,
    renderOrbBlockers: legacyLobbyOrbBlockers,
    mountPrimaryBlocker: null,
  });
  const persistentLobbyLogoActive = !confirmActive && !orbCompressActive;
  const persistentLogoVisible =
    persistentLobbyLogoActive &&
    !hideLobbyBootLogoOnly &&
    // FIX A: suppress logo together with base orb while transition owns presentation.
    !transitionOwnsPresentation;

  // Stage 1 — read-only presentation mirror. Telemetry only: never gates JSX,
  // never remounts InstantBanFlow, never writes runtime / portals / displays.
  useEffect(() => {
    const observedOverlayKind =
      activeOverlayKind === 'incoming' ||
      activeOverlayKind === 'check' ||
      activeOverlayKind === 'result'
        ? activeOverlayKind
        : null;
    const runtimePayload = notificationRuntimeState.display.payload;
    const overlayDisplayId =
      runtimePayload?.kind === 'incoming'
        ? (runtimePayload.ban.id ?? null)
        : runtimePayload?.kind === 'check'
          ? (runtimePayload.ban.id ?? null)
          : runtimePayload?.kind === 'result'
            ? (runtimePayload.result.id ?? null)
            : null;
    publishObservedPresentation(
      observePresentationState({
        phase,
        banSentSuccess,
        successSnapshot: successSnapshot
          ? {
              selectedUserId:
                successSnapshot.selectedUser.userId ??
                successSnapshot.selectedUser.id ??
                null,
              banText: successSnapshot.banText,
              durationMinutes: successSnapshot.durationMinutes,
              replyToBanId: successSnapshot.replyToBanId,
            }
          : null,
        inFlight,
        sharing,
        replySending,
        confirmActive,
        lobbyBootIntroPrimed,
        holdLobbyOrbForBootstrap,
        showBootOrb,
        showLobbyOrb,
        persistentLogoVisible,
        showLobbyChrome,
        activeOverlayKind: observedOverlayKind,
        overlayHostActive: notificationOverlayMounted,
        notificationOverlayVisible,
        showDirectOverboardLayer,
        directOverboardResultId: showDirectOverboardLayer
          ? (result?.id ?? null)
          : null,
        queueResultId:
          observedOverlayKind === 'result' ? (result?.id ?? null) : null,
        overlayDisplayId,
        successHandoffArmed: successPresentationHandoffArmed,
      }),
    );
  }, [
    phase,
    banSentSuccess,
    successSnapshot,
    inFlight,
    sharing,
    replySending,
    confirmActive,
    lobbyBootIntroPrimed,
    holdLobbyOrbForBootstrap,
    showBootOrb,
    showLobbyOrb,
    persistentLogoVisible,
    showLobbyChrome,
    activeOverlayKind,
    notificationOverlayMounted,
    notificationOverlayVisible,
    showDirectOverboardLayer,
    result?.id,
    notificationRuntimeState.display.payload,
    successPresentationHandoffArmed,
  ]);

  useLayoutEffect(() => {
    if (!confirmActive && phase !== 'confirming') return;

    const queueDebug = getConfirmOrbQueueDebugSnapshot();
    const holdDebug = getConfirmHoldDebugSnapshot();
    const trimmedBanText = banText.trim();
    const selectedReceiverId =
      selectedUser?.userId ?? selectedUser?.id ?? null;
    const selectedReceiverLabel =
      selectedUser?.firstName ?? selectedUser?.username ?? null;
    const sending = inFlight || sharing || replySending;

    let holdBlockReason: string | null = null;
    if (!confirmActive) {
      if (phase !== 'confirming') holdBlockReason = `phase:${phase}`;
      else if (!selectedUser) holdBlockReason = 'selectedUser-null';
      else if (banSentSuccess) holdBlockReason = 'banSentSuccess';
    } else if (sending) {
      holdBlockReason = 'sending';
    } else if (!confirmOrb.enterComplete) {
      holdBlockReason = `enterPhase:${confirmOrb.enterPhase}`;
    } else if (holdDebug.overlayInputLocked) {
      holdBlockReason = `overlay-input-lock:${holdDebug.overlayInputLockSource ?? 'unknown'}`;
    }

    const holdOrbMountBranch: 'confirm' | 'showLobbyOrb' | 'showBootOrb' | 'none' =
      showLobbyOrb
        ? confirmActive
          ? 'confirm'
          : 'showLobbyOrb'
        : showBootOrb
          ? 'showBootOrb'
          : 'none';

    logConfirmRenderState({
      source: 'InstantBanFlow-confirm-hold-render',
      phase,
      screen: confirmActive
        ? 'confirm-active'
        : phase === 'confirming'
          ? 'confirm-phase-partial'
          : `phase:${phase}`,
      sendComposePhase: queueDebug.sendComposePhase,
      confirmActive,
      orbCompressActive,
      composeDismissing,
      selectedReceiverId,
      selectedReceiverLabel,
      selectedBanText: trimmedBanText,
      customTextLen: trimmedBanText.length,
      durationMinutes,
      sendStarted,
      sending,
      success: banSentSuccess,
      error: confirmSendError,
      lowEnergyRedirecting,
      lowEnergyBlockedSignal,
      energyLoaded,
      influencePercent: lobbyInfluencePercent,
      canLobbySendBan: canLobbySendBan(energyLoaded, lobbyInfluencePercent),
      replyComposeActive,
      replySending,
      inFlight,
      sharing,
      banSentSuccess,
      lobbyBootIntroPrimed,
      lobbyOrbVisible,
      showLobbyOrb,
      showBootOrb,
      queueClaimsNotificationScreen,
      overlayQueueLength,
      queueLen: queueDebug.queueLen,
      pendingLen: queueDebug.pendingLen,
      statusLabel: confirmOrb.statusLabel,
      enterPhase: confirmOrb.enterPhase,
      holdPhase: confirmOrb.holdPhase,
      enterComplete: confirmOrb.enterComplete,
      holdButtonDisabled: confirmOrb.buttonDisabled,
      renderOrbBlockers: legacyLobbyOrbBlockers,
      orbMountBlockedReason: confirmStripOrbMountBlockedReason,
    });

    logConfirmHoldButtonDecision({
      source: 'InstantBanFlow-confirm-hold-render',
      willRenderLobbyOrbWrap: showLobbyOrb,
      willRenderConfirmHoldOrb: showLobbyOrb && confirmActive,
      willRenderBootOrbWrap: showBootOrb,
      willRenderArenaLobbyOrb: showLobbyOrb,
      willRenderHoldStrip: confirmActive,
      willRenderHoldTextZazhmi:
        confirmActive && (confirmOrb.statusLabel?.includes('Зажми') ?? false),
      holdOrbMountBranch,
      lobbyOrbVisible,
      showLobbyOrb,
      showBootOrb,
      lobbyBootIntroPrimed,
      queueClaimsNotificationScreen,
      renderOrbBlockers: legacyLobbyOrbBlockers,
      orbMountBlockedReason: confirmStripOrbMountBlockedReason,
      confirmActive,
      persistentLogoVisible,
      confirmLayoutActive,
      orbOverlayDim,
      enterPhase: confirmOrb.enterPhase,
      holdDisabled: confirmOrb.buttonDisabled,
      holdBlockReason,
    });

    if (confirmActive && !showLobbyOrb) {
      logConfirmHoldComponentReturnNull({
        source: 'InstantBanFlow-confirm-hold-render',
        reason: 'confirmActive-but-showLobbyOrb-false',
        component: 'LobbyOrbWrap/ArenaLobbyOrb',
        confirmActive,
        phase,
        showLobbyOrb,
        showBootOrb,
        lobbyOrbVisible,
        renderOrbBlockers: legacyLobbyOrbBlockers,
        orbMountBlockedReason: confirmStripOrbMountBlockedReason,
        statusLabel: confirmOrb.statusLabel,
      });
    }

    const mountEl = lobbyOrbMountRef.current;
    requestAnimationFrame(() => {
      const collected = collectConfirmOrbContainerMeasures(mountEl);
      logConfirmOrbContainerMeasure({
        source: 'InstantBanFlow-confirm-hold-render',
        confirmActive,
        showLobbyOrb,
        showBootOrb,
        lobbyOrbMountRefAttached: mountEl != null,
        measures: collected.measures,
        title98PlusCount: collected.title98PlusCount,
        zeroSizeTitle98Count: collected.zeroSizeTitle98Count,
      });
    });
  }, [
    banSentSuccess,
    banText,
    composeDismissing,
    confirmActive,
    confirmLayoutActive,
    confirmOrb.buttonDisabled,
    confirmOrb.enterComplete,
    confirmOrb.enterPhase,
    confirmOrb.holdPhase,
    confirmOrb.showOrbFace,
    confirmOrb.statusLabel,
    confirmSendError,
    confirmStripOrbMountBlockedReason,
    legacyLobbyOrbBlockersKey,
    durationMinutes,
    energyLoaded,
    getConfirmHoldDebugSnapshot,
    getConfirmOrbQueueDebugSnapshot,
    inFlight,
    lobbyBootIntroPrimed,
    lobbyInfluencePercent,
    lobbyOrbVisible,
    lowEnergyBlockedSignal,
    lowEnergyRedirecting,
    orbCompressActive,
    orbOverlayDim,
    overlayQueueLength,
    persistentLogoVisible,
    phase,
    queueClaimsNotificationScreen,
    replyComposeActive,
    replySending,
    selectedUser,
    sendStarted,
    sharing,
    showBootOrb,
    showLobbyOrb,
    successSnapshot,
  ]);

  const prevConfirmingPhaseRef = useRef(false);

  useLayoutEffect(() => {
    const shouldDiag =
      phase === 'confirming' ||
      confirmActive ||
      (orbCompressActive && selectedUser != null) ||
      (replyComposeActive &&
        (phase === 'composingBan' || phase === 'confirming'));
    if (!shouldDiag) return;

    const useLobbyRingDisplay = !confirmActive && !orbCompressActive;
    const hideOrbFaceTitle = persistentLogoVisible || useLobbyRingDisplay;
    const overlayHandoffBreakdown = {
      lobbyActiveBanOverlay: lobbyActiveBanOverlay != null,
      successToActiveLobbyBlocked,
      overlayHandoffFromActiveCard,
      notificationOverlayMounted,
      bansReturnToLobbyLatchWithOverlay:
        bansReturnToLobbyLatch && notificationOverlayMounted,
    };
    const replyIncomingDeeplinkBreakdown = {
      bansReturnToLobbyLatch,
      replyComposeActive,
      replyComposeUiActive,
      incomingCardFullyReady,
      deepLinkRouteBootPending,
      deepLinkReplyBooting,
      replyDeeplinkFastShell,
      replyHandoffLock,
      hasReplyDeepLinkBanId: replyDeepLinkBanId != null,
      hasDeepLinkReplyBan: deepLinkReplyBan != null,
      hasIncomingReplyBanId: incomingReplyBanId != null,
      replyUiShellActive,
    };
    const replyLobbyBlockedBreakdown = {
      bansReturnToLobbyLatch,
      replyComposeUiActive,
      replyUiShellActive,
      activeBanUiShellActive,
      incomingGateIncomingReply:
        incomingGateActive &&
        replyDeepLinkBanId != null &&
        activeOverlayKind === 'incoming',
    };
    const mountDecision = computeLobbyOrbMountDecisionWithDiag({
      replyIncomingDeeplinkPending,
      checkDeeplinkDirectPending,
      replyLobbyBlocked,
      successToActiveLobbyBlocked,
      overlayHandoffLobbySuppressed,
      overlayHandoffBreakdown,
      replyIncomingDeeplinkBreakdown,
      replyLobbyBlockedBreakdown,
      successExitDraining,
      postSuccessHandoffBlocking,
      postSuccessHandoffActive,
      notificationChainTransitioning,
      lobbyBootIntroPrimed,
      diagSource: shouldDiag ? 'InstantBanFlow-mount' : null,
    });
    const queueState = getConfirmOrbQueueDebugSnapshot();
    const flowMode = replyComposeActive
      ? incomingReplyBanId || replyToBanId
        ? 'incoming-reply'
        : 'reply'
      : deepLinkReplyBan?.id
        ? 'deeplink-reply'
        : 'standard';
    const incomingOverlayVisibleDiag =
      notificationOverlayVisible &&
      (activeOverlayKind === 'incoming' || incomingGateActive);

    const mountPayload = {
      source: 'InstantBanFlow-lobbyOrbVisible',
      confirmActive,
      instantBanOpen: sendFlowOpen || sendStarted,
      flowMode,
      replyBanId: getPinnedReplyToBanId() ?? incomingReplyBanId ?? null,
      activeOverlayKind,
      incomingOverlayVisible: incomingOverlayVisibleDiag,
      notificationChainTransitioning,
      isPostSuccessHandoffInProgress: queueState.isPostSuccessHandoffInProgress,
      pendingLen: queueState.pendingLen,
      queueLen: queueState.queueLen,
      selectedNextKind: queueState.selectedNextKind,
      selectedNextBanId: queueState.selectedNextBanId,
      lobbyOrbVisible: mountDecision.lobbyOrbVisible,
      showLobbyOrb: mountDecision.showLobbyOrb,
      showBootOrb: mountDecision.showBootOrb,
      mountBlockers: mountDecision.blockers,
      primaryBlocker: mountDecision.primaryBlocker,
      persistentLogoVisible,
      hideOrbFaceTitle,
      suppressOrbFaceTitle: persistentLogoVisible,
      useLobbyRingDisplay,
      orbCompressActive,
      postSuccessHandoffBlocking,
      postSuccessHandoffActive,
      replyComposeUiActive,
      replyIncomingDeeplinkPending,
      replyLobbyBlocked,
      notificationOverlayMounted,
      overlayHandoffLobbySuppressed,
      overlayHandoffBreakdown,
      replyIncomingDeeplinkBreakdown,
      replyLobbyBlockedBreakdown,
      sendComposePhase: queueState.sendComposePhase,
      phase,
    };

    const mountSig = JSON.stringify(mountPayload);
    if (mountSig !== confirmOrbMountDiagSigRef.current) {
      confirmOrbMountDiagSigRef.current = mountSig;
      logConfirmOrbMountDecision(mountPayload);

      if (confirmActive && !mountDecision.lobbyOrbVisible) {
        logConfirmOrbBlockedByQueueState({
          ...mountPayload,
          queueHandoffBlocker: mountDecision.blockers.some(isQueueHandoffOrbBlocker),
        });
      }
    }

    if (confirmActive) {
      const queuePayload = {
        source: 'InstantBanFlow-confirm',
        confirmActive,
        flowMode,
        phase,
        replyBanId: getPinnedReplyToBanId() ?? incomingReplyBanId ?? null,
        activeOverlayKind,
        incomingOverlayVisible: incomingOverlayVisibleDiag,
        notificationChainTransitioning,
        lobbyOrbVisible: mountDecision.lobbyOrbVisible,
        primaryBlocker: mountDecision.primaryBlocker,
        ...queueState,
      };
      const queueSig = JSON.stringify(queuePayload);
      if (queueSig !== confirmQueueStateDiagSigRef.current) {
        confirmQueueStateDiagSigRef.current = queueSig;
        logQueueStateDuringConfirm(queuePayload);
      }
    }

    if (
      queueState.isPostSuccessHandoffInProgress &&
      (replyComposeActive ||
        phase === 'composingBan' ||
        phase === 'confirming' ||
        confirmActive)
    ) {
      const handoffPayload = {
        source: 'InstantBanFlow-mount-decision',
        confirmActive,
        phase,
        flowMode,
        replyBanId: getPinnedReplyToBanId() ?? incomingReplyBanId ?? null,
        lobbyOrbVisible: mountDecision.lobbyOrbVisible,
        primaryBlocker: mountDecision.primaryBlocker,
        ...queueState,
      };
      const handoffSig = JSON.stringify(handoffPayload);
      if (handoffSig !== postSuccessHandoffDuringReplySigRef.current) {
        postSuccessHandoffDuringReplySigRef.current = handoffSig;
        logPostSuccessHandoffStillActiveDuringReply(handoffPayload);
      }
    }

    patchConfirmOrbDebugSnapshot({
      lobbyOrbVisible: mountDecision.lobbyOrbVisible,
      primaryBlocker: mountDecision.primaryBlocker,
      showLobbyOrb: mountDecision.showLobbyOrb,
      showBootOrb: mountDecision.showBootOrb,
      postSuccessHandoffBlocking,
      postSuccessHandoffActive,
      notificationChainTransitioning,
      overlayHandoffLobbySuppressed,
      successExitDraining,
      confirmActive,
      phase,
      sendComposePhase: queueState.sendComposePhase,
    });
    patchZazhmiDomProbeFields({
      phase,
      confirmActive,
      showLobbyOrb,
      lobbyOrbVisible,
      overlayQueueLength,
      queueClaimsNotificationScreen,
      queueLen: queueState.queueLen,
      pendingLen: queueState.pendingLen,
      sendComposePhase: queueState.sendComposePhase,
    });

    const enteringConfirming =
      phase === 'confirming' && !prevConfirmingPhaseRef.current;
    if (phase === 'confirming') {
      prevConfirmingPhaseRef.current = true;
    } else {
      prevConfirmingPhaseRef.current = false;
    }

    const renderOrbBlockers = legacyLobbyOrbBlockers;
    const shouldRenderConfirmOrb = showLobbyOrb && confirmActive;
    const shouldRenderHoldOrb = showLobbyOrb && confirmOrb.showOrbFace;
    const orbMountBlockedReason = resolveOrbMountBlockedReason({
      lobbyOrbVisible,
      showLobbyOrb,
      lobbyBootIntroPrimed,
      renderOrbBlockers,
      mountPrimaryBlocker: mountDecision.primaryBlocker,
    });
    const shouldEmitMissingDiag =
      (confirmActive && !showLobbyOrb) ||
      (confirmOrb.statusLabel === 'Зажми' && !showLobbyOrb) ||
      (mountDecision.lobbyOrbVisible === false &&
        showLobbyOrb &&
        lobbyBootIntroPrimed);

    if (shouldEmitMissingDiag) {
      const missingSource = enteringConfirming
        ? 'phase-enter-confirming'
        : confirmOrb.statusLabel === 'Зажми' && !showLobbyOrb
          ? 'zazhmi-text-without-orb'
          : !mountDecision.lobbyOrbVisible
            ? 'compute-lobby-orb-false'
            : mountDecision.lobbyOrbVisible && !lobbyOrbVisible
              ? 'render-vs-mount-decision-mismatch'
              : 'confirm-mount-decision';
      const missingPayload = {
        source: missingSource,
        phase,
        sendComposePhase: queueState.sendComposePhase,
        confirmActive,
        lobbyOrbVisible,
        shouldRenderConfirmOrb,
        shouldRenderHoldOrb,
        confirmHoldReady:
          confirmActive &&
          confirmOrb.enterComplete &&
          shouldRenderHoldOrb,
        orbMountBlockedReason,
        notificationChainTransitioning:
          queueState.notificationChainTransitioning,
        notificationChainAwaitingUser:
          queueState.notificationChainAwaitingUser,
        pendingLen: queueState.pendingLen,
        queueLen: queueState.queueLen,
        hasIncoming:
          incomingGateActive ||
          queueState.selectedNextKind === 'incoming' ||
          queueState.incomingBanId != null,
        activeKind: activeOverlayKind,
        activeBanId:
          getPinnedReplyToBanId() ?? incomingReplyBanId ?? replyToBanId ?? null,
        overlayVisible: notificationOverlayVisible,
        notificationOverlayVisible,
        lobbyIndicatorVisible: lobbyBansNeedAttention,
        mountDecisionLobbyOrbVisible: mountDecision.lobbyOrbVisible,
        mountDecisionPrimaryBlocker: mountDecision.primaryBlocker,
        renderOrbBlockers,
        mountDecisionBlockers: mountDecision.blockers,
        queueClaimsNotificationScreen,
        statusLabel: confirmOrb.statusLabel,
        showLobbyOrb,
        showBootOrb,
        lobbyBootIntroPrimed,
      };
      const missingSig = JSON.stringify(missingPayload);
      if (missingSig !== confirmOrbMissingDiagSigRef.current) {
        confirmOrbMissingDiagSigRef.current = missingSig;
        logConfirmOrbMissingDiag(missingPayload);
      }
    }
  }, [
    activeOverlayKind,
    bansReturnToLobbyLatch,
    checkDeeplinkDirectPending,
    confirmActive,
    confirmOrb.enterComplete,
    confirmOrb.showOrbFace,
    confirmOrb.statusLabel,
    deepLinkReplyBan,
    deepLinkReplyBooting,
    deepLinkRouteBootPending,
    getConfirmOrbQueueDebugSnapshot,
    getPinnedReplyToBanId,
    incomingCardFullyReady,
    incomingGateActive,
    incomingReplyBanId,
    lobbyActiveBanOverlay,
    lobbyBansNeedAttention,
    lobbyBootIntroPrimed,
    lobbyOrbVisible,
    notificationChainTransitioning,
    notificationOverlayMounted,
    notificationOverlayVisible,
    orbCompressActive,
    overlayHandoffFromActiveCard,
    overlayHandoffLobbySuppressed,
    overlayQueueLength,
    persistentLogoVisible,
    phase,
    postSuccessHandoffActive,
    postSuccessHandoffBlocking,
    queueClaimsNotificationScreen,
    replyComposeActive,
    replyComposeUiActive,
    replyDeepLinkBanId,
    replyDeeplinkFastShell,
    replyHandoffLock,
    replyIncomingDeeplinkPending,
    replyLobbyBlocked,
    replyToBanId,
    replyUiShellActive,
    selectedUser,
    sendFlowOpen,
    sendStarted,
    showBootOrb,
    showLobbyOrb,
    successExitDraining,
    successToActiveLobbyBlocked,
  ]);

  useLayoutEffect(() => {
    const shouldDiag =
      phase === 'confirming' ||
      confirmActive ||
      (orbCompressActive && selectedUser != null) ||
      (replyComposeActive &&
        (phase === 'composingBan' || phase === 'confirming'));
    if (!shouldDiag) return;

    const useLobbyRingDisplay = !confirmActive && !orbCompressActive;
    const hideOrbFaceTitle = persistentLogoVisible || useLobbyRingDisplay;
    const confirmHoldOrbMounted = showLobbyOrb;
    const title98Visible =
      confirmHoldOrbMounted && confirmOrb.showOrbFace && !hideOrbFaceTitle;
    const holdButtonVisible = confirmHoldOrbMounted && confirmOrb.showOrbFace;

    let holdBlockReason: string | null = null;
    if (!confirmActive) {
      if (phase !== 'confirming') holdBlockReason = `phase:${phase}`;
    } else if (inFlight || sharing || replySending) {
      holdBlockReason = 'sending';
    } else if (!confirmOrb.enterComplete) {
      holdBlockReason = `enterPhase:${confirmOrb.enterPhase}`;
    }

    const holdDebug = getConfirmHoldDebugSnapshot();
    if (holdDebug.overlayInputLocked && confirmActive) {
      holdBlockReason =
        holdBlockReason ??
        `overlay-input-lock:${holdDebug.overlayInputLockSource ?? 'unknown'}`;
    }

    const opponentId =
      selectedUser?.userId ?? selectedUser?.id ?? selectedUser?.username ?? null;
    const flowMode = replyComposeActive
      ? incomingReplyBanId || replyToBanId
        ? 'incoming-reply'
        : 'reply'
      : deepLinkReplyBan?.id
        ? 'deeplink-reply'
        : 'standard';

    const payload = {
      source: 'InstantBanFlow-layout',
      flowMode,
      replyBanId: getPinnedReplyToBanId() ?? incomingReplyBanId ?? null,
      opponentId,
      hasOpponent: selectedUser != null,
      hasText: banText.trim().length > 0,
      durationMinutes,
      confirmVisible: confirmActive,
      successVisible: banSentSuccess,
      successSnapshotExists: successSnapshot != null,
      holdButtonVisible,
      holdDisabled: confirmOrb.buttonDisabled,
      holdBlockReason,
      activeUserCardHold: holdDebug.activeUserCardHold,
      incomingOverlayVisible:
        notificationOverlayVisible &&
        (activeOverlayKind === 'incoming' || incomingGateActive),
      activeOverlayKind,
      isComposingReply:
        replyComposeActive &&
        (phase === 'composingBan' || phase === 'confirming'),
      isTransitioningFromIncoming:
        replyHandoffLock || notificationChainTransitioning,
      renderedOrb: title98Visible
        ? '98+'
        : showBootOrb
          ? 'boot-orb-hide-title'
          : showLobbyOrb
            ? 'lobby-orb-no-title'
            : 'none',
      renderedHoldText: confirmActive ? confirmOrb.statusLabel : null,
      suppressOrbFaceTitle: persistentLogoVisible,
      hideOrbFaceTitle,
      useLobbyRingDisplay,
      showLobbyOrb,
      showBootOrb,
      enterPhase: confirmOrb.enterPhase,
      enterComplete: confirmOrb.enterComplete,
      holdPhase: confirmOrb.holdPhase,
      orbCompressActive,
      persistentLogoVisible,
      lobbyOrbVisible,
      overlayInputLocked: holdDebug.overlayInputLocked,
      overlayInputLockSource: holdDebug.overlayInputLockSource,
    };

    const sig = JSON.stringify(payload);
    if (sig === confirmHoldDiagSigRef.current) return;
    confirmHoldDiagSigRef.current = sig;

    logConfirmHoldRenderCheck(payload);

    if (confirmActive || phase === 'confirming') {
      const queueDebug = getConfirmOrbQueueDebugSnapshot();
      logConfirmHoldProtectionActive({
        route: readHoldOwnerRoute(),
        screen: `compose:${phase}`,
        queueLen: queueDebug.queueLen,
        pendingLen: queueDebug.pendingLen,
        hasConfirmHoldButton: holdButtonVisible,
        selectedReplyBanId:
          getPinnedReplyToBanId() ?? incomingReplyBanId ?? replyToBanId ?? null,
        owner: 'confirm-hold-protection',
        kind: holdDebug.activeUserCardHold,
        banId: holdDebug.activeUserCardHoldBanId,
        reason: holdBlockReason ?? 'confirm-hold-layout-active',
      });
    }

    if ((confirmActive || phase === 'confirming') && !title98Visible) {
      logConfirmHoldReturnNull({
        reason: buildConfirmHoldNullReason({
          showLobbyOrb,
          showBootOrb,
          showOrbFace: confirmOrb.showOrbFace,
          hideOrbFaceTitle,
          suppressOrbFaceTitle: persistentLogoVisible,
          useLobbyRingDisplay,
          confirmActive,
          phase,
        }),
        ...payload,
      });

      if (phase === 'confirming' || confirmActive) {
        const queueDebug = getConfirmOrbQueueDebugSnapshot();
        const renderOrbBlockers = buildRenderLobbyOrbBlockers({
          replyIncomingDeeplinkPending,
          checkDeeplinkDirectPending,
          replyLobbyBlocked,
          successToActiveLobbyBlocked,
          overlayHandoffLobbySuppressed,
          successExitDraining,
          postSuccessHandoffBlocking,
          notificationChainTransitioning,
          queueClaimsNotificationScreen,
          overlayQueueLength: 0,
          queueLobbyGuardActive: false,
        });
        const renderMissingPayload = {
          source:
            confirmOrb.statusLabel === 'Зажми' && !showLobbyOrb
              ? 'confirm-render-zazhmi-without-orb'
              : 'confirm-render',
          phase,
          sendComposePhase: queueDebug.sendComposePhase,
          confirmActive,
          lobbyOrbVisible,
          shouldRenderConfirmOrb: showLobbyOrb && confirmActive,
          shouldRenderHoldOrb: holdButtonVisible,
          confirmHoldReady:
            confirmActive &&
            confirmOrb.enterComplete &&
            !holdBlockReason &&
            holdButtonVisible,
          orbMountBlockedReason: resolveOrbMountBlockedReason({
            lobbyOrbVisible,
            showLobbyOrb,
            lobbyBootIntroPrimed,
            renderOrbBlockers,
            mountPrimaryBlocker: null,
            holdBlockReason,
          }),
          notificationChainTransitioning:
            queueDebug.notificationChainTransitioning,
          notificationChainAwaitingUser:
            queueDebug.notificationChainAwaitingUser,
          pendingLen: queueDebug.pendingLen,
          queueLen: queueDebug.queueLen,
          hasIncoming:
            incomingGateActive ||
            queueDebug.selectedNextKind === 'incoming' ||
            queueDebug.incomingBanId != null,
          activeKind: activeOverlayKind,
          activeBanId:
            getPinnedReplyToBanId() ??
            incomingReplyBanId ??
            replyToBanId ??
            null,
          overlayVisible: notificationOverlayVisible,
          notificationOverlayVisible,
          lobbyIndicatorVisible: lobbyBansNeedAttention,
          renderOrbBlockers,
          queueClaimsNotificationScreen,
          statusLabel: confirmOrb.statusLabel,
          showLobbyOrb,
          showBootOrb,
          lobbyBootIntroPrimed,
          holdBlockReason,
          title98Visible,
        };
        const renderSig = JSON.stringify(renderMissingPayload);
        if (renderSig !== confirmOrbMissingDiagSigRef.current) {
          confirmOrbMissingDiagSigRef.current = renderSig;
          logConfirmOrbMissingDiag(renderMissingPayload);
        }
      }
    }
  }, [
    activeOverlayKind,
    banSentSuccess,
    banText,
    confirmActive,
    confirmOrb.buttonDisabled,
    confirmOrb.enterComplete,
    confirmOrb.enterPhase,
    confirmOrb.holdPhase,
    confirmOrb.showOrbFace,
    confirmOrb.statusLabel,
    deepLinkReplyBan?.id,
    durationMinutes,
    getConfirmHoldDebugSnapshot,
    getConfirmOrbQueueDebugSnapshot,
    getPinnedReplyToBanId,
    incomingGateActive,
    incomingReplyBanId,
    inFlight,
    lobbyBansNeedAttention,
    lobbyBootIntroPrimed,
    lobbyOrbVisible,
    notificationChainTransitioning,
    notificationOverlayVisible,
    orbCompressActive,
    overlayHandoffLobbySuppressed,
    overlayQueueLength,
    persistentLogoVisible,
    phase,
    postSuccessHandoffBlocking,
    queueClaimsNotificationScreen,
    replyComposeActive,
    replyHandoffLock,
    replyIncomingDeeplinkPending,
    replyLobbyBlocked,
    replySending,
    replyToBanId,
    selectedUser,
    sendFlowOpen,
    sharing,
    showBootOrb,
    showLobbyOrb,
    successSnapshot,
  ]);

  useLayoutEffect(() => {
    logBaseLobbyLayerState({
      phase,
      hasOverlay: notificationOverlayActive,
      overlayKind: activeOverlayKind ?? null,
      composePhase: phase === 'idle' ? null : phase,
      lobbyMounted: baseLobbyLayerMounted,
      orbMounted: showBootOrb || showLobbyOrb,
      reasonIfHidden: resolveBaseLobbyReasonIfHidden({
        orbMounted: showBootOrb || showLobbyOrb,
        lobbyMounted: baseLobbyLayerMounted,
        lobbyBootIntroPrimed,
        legacyBlockers: legacyLobbyOrbBlockers,
      }),
    });
  }, [
    activeOverlayKind,
    baseLobbyLayerMounted,
    legacyLobbyOrbBlockersKey,
    lobbyBootIntroPrimed,
    notificationOverlayActive,
    phase,
    showBootOrb,
    showLobbyOrb,
  ]);

  useLayoutEffect(() => {
    patchBootHandoffDebug({
      bootSceneVisible: showBootOrb,
      orbSource: showBootOrb
        ? 'BootScene'
        : showLobbyOrb
          ? confirmActive
            ? 'Confirm'
            : 'Lobby'
          : 'none',
      orbInstanceId: showBootOrb
        ? bootOrbInstanceId
        : showLobbyOrb
          ? lobbyOrbInstanceId
          : '',
      launchStage: showBootOrb ? launchStage : 'done',
      persistentLogoActive: persistentLobbyLogoActive,
    });
  }, [
    showBootOrb,
    showLobbyOrb,
    confirmActive,
    bootOrbInstanceId,
    lobbyOrbInstanceId,
    launchStage,
    persistentLobbyLogoActive,
  ]);

  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    const stage = document.querySelector(
      '[data-instant-ban-view="InstantBanFlow"] .instant-ban-arena-send__stage',
    );
    const context = `handoff boot=${showBootOrb} lobby=${showLobbyOrb} primed=${lobbyBootIntroPrimed} stage=${launchStage}`;
    const sources = scanVisibleLobbyLogoSources(stage ?? document);
    const formatted = formatVisibleLogoSources(sources);
    const rows = logPersistentLogoComputedStyles(context);
    const title = rows[0];
    patchBootHandoffDebug({
      visibleLogoSources: formatted,
      logoTransform: title?.transform ?? '',
      logoOpacity: title?.opacity ?? '',
    });
  }, [
    showBootOrb,
    showLobbyOrb,
    lobbyBootIntroPrimed,
    launchStage,
    persistentLobbyLogoActive,
    bootLogoScaleActive,
    bootRingScaleActive,
    bootFillActive,
    confirmActive,
    orbCompressActive,
  ]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const roots = document.querySelectorAll('[data-orb-root]');
    const titles = document.querySelectorAll('[data-orb-root] .lobby-screen__title');
    const orbId = document.querySelector('[data-debug-orb-id]')?.getAttribute('data-debug-orb-id');
    console.log('[orb-count]', roots.length, '98+-labels:', titles.length, {
      phase,
      orbId,
      composeDismissing,
      confirmLayoutActive,
    });
  }, [phase, confirmEnterKey, composeDismissing, confirmLayoutActive]);

  const zazhmiQueueDebug = getConfirmOrbQueueDebugSnapshot();
  const zazhmiRenderProbe =
    phase === 'confirming' ||
    confirmActive ||
    zazhmiQueueDebug.sendComposePhase === 'confirming'
      ? traceZazhmiRenderSourceDiag({
          file: 'InstantBanFlow.tsx',
          component: 'InstantBanFlow',
          source: 'render-body-confirm-probe',
          phase,
          sendComposePhase: zazhmiQueueDebug.sendComposePhase,
          confirmActive,
          statusLabel: confirmOrb.statusLabel,
          showLobbyOrb,
          lobbyOrbVisible,
          queueLen: zazhmiQueueDebug.queueLen,
          pendingLen: zazhmiQueueDebug.pendingLen,
          overlayQueueLength,
          queueClaimsNotificationScreen,
        })
      : null;

  const lobbyRenderBranch = lobbyOrbVisible || showBootOrb ? 'lobby' : 'base-null';
  logResultRenderSelectionTrace({
    activeOverlayKind,
    activeKind: activeOverlayKind,
    effectiveKind: activeOverlayKind,
    shellKind: activeOverlayKind,
    activeBanId: result?.id ?? null,
    activeResultId: result?.id ?? null,
    resultBanId: result?.id ?? null,
    resultId: result?.id ?? null,
    hasResult: Boolean(result),
    hasResultOverlay: Boolean(result),
    hasNotificationOverlay: notificationOverlayMounted,
    hasAnyOverlay: hasAnyOverlayForLobbyCta,
    displayResultExists: Boolean(result),
    willRenderResultOverlay: Boolean(result),
    willRenderNotificationOverlay: notificationOverlayMounted,
    willRenderLobby: lobbyOrbVisible || showBootOrb,
    overlayQueueLength: effectiveOverlayQueueLengthForLobbyCta,
    pendingLen: getConfirmOrbQueueDebugSnapshot().pendingLen,
    queueHeadKind: activeOverlayKind,
    queueHeadBanId: result?.id ?? null,
    queueHeadResultId: activeOverlayKind === 'result' ? (result?.id ?? null) : null,
    queueClaimsNotificationScreen,
    queueLobbyGuardActive,
    showLobby: lobbyOpen,
    showLobbyCta,
    renderBranch: lobbyRenderBranch,
    reason: queueClaimsNotificationScreen
      ? 'queue-claims-notification-screen-lobby-underneath'
      : lobbyRenderBranch === 'base-null'
        ? 'lobby-orb-hidden'
        : 'lobby-visible',
  });
  logResultRenderBranch({
    component: 'InstantBanFlow',
    renderBranch: lobbyRenderBranch,
    reason: queueClaimsNotificationScreen
      ? 'queue-claims-notification-screen'
      : lobbyRenderBranch === 'base-null'
        ? 'lobby-orb-hidden'
        : 'lobby-shell-render',
    showLobbyOrb,
    showBootOrb,
    lobbyChromeHidden,
    queueClaimsNotificationScreen,
    activeOverlayKind,
    overlayQueueLength: effectiveOverlayQueueLengthForLobbyCta,
  });
  traceQueueClaimsNotificationScreenIfChanged(
    'InstantBanFlow.result-render-branch',
    {
      queueClaimsNotificationScreen,
      overlayQueueLength,
      effectiveOverlayQueueLength: effectiveOverlayQueueLengthForLobbyCta,
      queueLobbyGuardActive,
      guardSnapshot: getQueueLobbyGuardSnapshot(),
      staleResultQueueClaimActive,
      ownerQueueLen: zazhmiQueueDebug.queueLen,
      ownerPendingLen: zazhmiQueueDebug.pendingLen,
      activeOverlayKind,
      activeKind: activeOverlayKind,
      notificationOverlayVisible,
      resultOverlayMounted: Boolean(result),
      showLobbyOrb,
      lobbyChromeHidden,
      renderBranch: lobbyRenderBranch,
      reason: queueClaimsNotificationScreen
        ? 'queue-claims-notification-screen'
        : lobbyRenderBranch === 'base-null'
          ? 'lobby-orb-hidden'
          : 'lobby-shell-render',
    },
  );
  observeCheckRemainedAfterResultButNotRendered({
    source: 'InstantBanFlow.result-render-branch',
    reason: queueClaimsNotificationScreen
      ? 'queue-claims-notification-screen'
      : lobbyRenderBranch === 'base-null'
        ? 'lobby-orb-hidden'
        : 'lobby-shell-render',
    calledFrom: 'InstantBanFlow',
    notificationOverlayVisible,
    queueClaimsNotificationScreen,
    // InstantBanFlow "lobby" is normal when queue still claims the screen
    // (lobby underneath). Only treat it as a bad branch when the overlay
    // claim/visibility already looks like a lobby escape.
    renderBranch:
      lobbyRenderBranch === 'lobby' &&
      (!queueClaimsNotificationScreen || notificationOverlayVisible === false)
        ? 'lobby'
        : null,
    returnBranch:
      lobbyRenderBranch === 'lobby' &&
      (!queueClaimsNotificationScreen || notificationOverlayVisible === false)
        ? 'lobby'
        : null,
    lobbyVisible: lobbyOrbVisible || showBootOrb,
    lobbyMounted: lobbyOpen,
    hasActiveOverlay: hasAnyOverlayForLobbyCta || notificationOverlayMounted,
  });
  // InstantBanFlow does not own shellKind derivation; sample via Providers
  // enrichment hooks (shell/owner/queue snapshot filled there).
  if (activeOverlayKind !== 'result' && notificationOverlayVisible) {
    traceShellStuckOnResultWhileOwnerAdvancedIfNeeded({
      source: 'InstantBanFlow.result-render-branch',
      reason: 'instant-ban-flow-render-decision',
      calledFrom: 'InstantBanFlow',
      shellKind: null,
      ownerQueue: [],
      activeKind: activeOverlayKind ?? null,
      ownerDisplayKind: null,
      currentHeadKind: null,
      notificationOverlayVisible,
      queueClaimsNotificationScreen,
      returnBranch: lobbyRenderBranch,
    });
  }
  if (notificationOverlayVisible && queueClaimsNotificationScreen) {
    traceQueueResultOverlayClaimStuckIfNeeded({
      source: 'InstantBanFlow.result-render-branch',
      reason: 'instant-ban-flow-claim-sample',
      calledFrom: 'InstantBanFlow',
      // Claim/queue filled by Providers enrichment hooks.
      queueResultOverlayClaimed: false,
      ownerQueue: [],
      activeKind: activeOverlayKind ?? null,
      notificationOverlayVisible,
      queueClaimsNotificationScreen,
    });
  }
  observeNextOverlayAfterResultRelease({
    source: 'InstantBanFlow.result-render-branch',
    reason: 'instant-ban-flow-render-decision',
    calledFrom: 'InstantBanFlow',
    activeKind: activeOverlayKind ?? null,
    notificationOverlayVisible,
    queueClaimsNotificationScreen,
    returnBranch: lobbyRenderBranch,
    renderBranch:
      lobbyRenderBranch === 'lobby' &&
      (!queueClaimsNotificationScreen || notificationOverlayVisible === false)
        ? 'lobby'
        : null,
  });
  observeShellCheckLifecycle({
    source: 'InstantBanFlow.result-render-branch',
    reason: 'instant-ban-flow-render-decision',
    calledFrom: 'InstantBanFlow',
    activeKind: activeOverlayKind ?? null,
    notificationOverlayVisible,
    queueClaimsNotificationScreen,
    returnBranch: lobbyRenderBranch,
    renderBranch:
      lobbyRenderBranch === 'lobby' &&
      (!queueClaimsNotificationScreen || notificationOverlayVisible === false)
        ? 'lobby'
        : null,
  });

  return (
    <>
      <LobbyBootLogoHideMarker active={hideLobbyBootLogoOnly} />
      <div
      className={`lobby-screen instant-ban-arena-send instant-ban-flow${
        whatMobileSafe ? ' instant-ban-flow--what-mobile-safe' : ''
      }${liteMode ? ' instant-ban-debug-lite' : ''}${
        replyUiShellActive ? ' instant-ban-flow--reply-ui-shell' : ''
      }${activeBanUiShellActive ? ' instant-ban-flow--active-ban-ui-shell' : ''}${
        bootIntroActive ? ' lobby-screen--boot-intro-active' : ''
      }${persistentLobbyLogoActive ? ' instant-ban-flow--persistent-lobby-logo' : ''}${
        successToActiveLobbyBlocked
          ? ' instant-ban-flow--success-to-active-lobby-blocked'
          : ''
      }${
        overlayHandoffLobbySuppressed
          ? ' instant-ban-flow--overlay-handoff-lobby-blocked'
          : ''
      }`}
      style={arenaOverlayStyle}
      role="dialog"
      aria-modal="true"
      aria-label="98+ arena"
      data-instant-ban-view="InstantBanFlow"
      data-send-phase={phase}
      data-who-gesture-active={whoDismissGestureActive ? 'true' : 'false'}
      data-screen-transition={screenTransition ?? undefined}
      data-orb-compress-active={orbCompressActive ? '' : undefined}
      data-instant-ban-step={legacyStep}
      data-bans-overlay-open={effectiveBansOverlayOpen ? '' : undefined}
      data-settings-overlay-open={settingsOverlayOpen ? '' : undefined}
      data-monetization-overlay-open={monetizationOpen ? '' : undefined}
      data-bans-cta-session={bansCtaQueueSuppress ? '' : undefined}
      data-notification-session={
        notificationOverlayMounted &&
        !bansCtaQueueSuppress &&
        !bansReturnToLobbyLatch
          ? ''
          : undefined
      }
      data-debug-slow-orb={process.env.NODE_ENV === 'development' ? '' : undefined}
      data-boot-scene={showBootOrb ? '' : undefined}
      data-boot-logo-intro={
        launchStage === 'logoEnter' || bootLogoScaleActive ? 'true' : undefined
      }
      data-boot-background={bootBackgroundUnderRouteOverlay ? 'true' : undefined}
    >
      {zazhmiRenderProbe}
      {showLobbyTopNav ? (
        <ArenaLobbyTopNav
          onOpenBans={handleOpenBansOverlay}
          onOpenSettings={handleOpenSettings}
          onOpenProfile={handleOpenProfile}
          settingsActive={settingsOverlayOpen}
          profileActive={monetizationOpen}
          bansNeedAttention={bansIndicatorVisible}
          telegramUserId={user?.id ?? null}
        />
      ) : null}
      {!lobbyChromeHidden ? <LobbyScreenAtmosphere /> : null}
      {lobbyOpen && lobbyDeeplinkToast ? (
        <div
          className={`lobby-deeplink-toast${
            lobbyDeeplinkToast === REPLY_DEEPLINK_TOAST_SENT
              ? ' lobby-deeplink-toast--sent'
              : ''
          }`}
          role="status"
          aria-live="polite"
        >
          {lobbyDeeplinkToast === REPLY_DEEPLINK_TOAST_SENT ? (
            <>
              <span className="lobby-deeplink-toast__ban-icon" aria-hidden>
                <BanGlyph strokeWidth={2.75} />
              </span>
              <span className="lobby-deeplink-toast__label">
                {REPLY_DEEPLINK_TOAST_SENT}
              </span>
            </>
          ) : (
            lobbyDeeplinkToast
          )}
        </div>
      ) : null}
      {whoInviteToast ? (
        <div
          className="lobby-deeplink-toast"
          role="alert"
          aria-live="assertive"
          data-who-invite-toast=""
        >
          {whoInviteToast}
        </div>
      ) : null}

      <div
        className="instant-ban-arena-send__stage"
        data-persistent-lobby-logo-active={
          persistentLobbyLogoActive ? 'true' : undefined
        }
      >
        {lobbyBootIntroPrimed ? (
          <LobbyPersistentLogoSlot
            key="lobby-persistent-logo"
            logoScaleActive={bootLogoScaleActive}
            logoLocked={bootLogoLocked || lobbyBootIntroPrimed}
            visible={persistentLogoVisible}
            logoScaleMs={bootLogoScaleMs}
            logoScaleDelayMs={bootLogoScaleDelayMs}
            onLogoScaleEnd={onBootLogoScaleEndTraced}
            diagContext={`stage=${launchStage} boot=${showBootOrb} lobby=${showLobbyOrb} primed=${lobbyBootIntroPrimed}`}
          />
        ) : null}

        {showBootOrb ? (
          <LobbyBootOrbWrap
            className="lobby-screen__orb-wrap lobby-screen__orb-root"
            ringScaleActive={bootRingScaleActive}
            fillActive={bootFillActive}
            ringScaleLocked={bootRingScaleLocked}
            ringTarget={fillTargetPercent}
            ringScaleMs={bootRingScaleMs}
            fillMs={bootFillMs}
            onRingScaleEnd={onBootRingScaleEndTraced}
            onFillEnd={onBootFillEndTraced}
            data-boot-orb
            data-orb-instance={bootOrbInstanceId}
          >
            <LobbyIdleOrb
              ringState={globalRelationshipRing}
              hideTitle
            />
          </LobbyBootOrbWrap>
        ) : null}

        {showLobbyOrb ? (
          <LobbyOrbWrap
            ref={lobbyOrbMountRef}
            data-orb-instance={lobbyOrbInstanceId}
            data-base-lobby-orb
            className={`lobby-screen__orb-wrap lobby-screen__orb-root${
              confirmActive || phase === 'confirming'
                ? ' lobby-screen__orb-wrap--confirm'
                : ''
            }${orbOverlayDim ? ' lobby-screen__orb-wrap--overlay-dim' : ''}`}
          >
            <ArenaLobbyOrb
              sendPhase={phase}
              confirmActive={confirmActive}
              orbCompressActive={orbCompressActive}
              confirmOrb={confirmOrb}
              globalRelationshipRing={globalRelationshipRing}
              suppressOrbFaceTitle={persistentLogoVisible}
              senderUser={user}
              selectedUser={selectedUser}
              banText={banText}
              durationMinutes={durationMinutes}
            />
          </LobbyOrbWrap>
        ) : null}

        {banSentSuccess && successSnapshot ? (
          <div
            className="instant-ban-arena-send__success-layer"
            data-instant-ban-view="SuccessOverlay"
          >
            <SuccessScreen
              senderUser={user}
              selectedUser={successSnapshot.selectedUser}
              banText={successSnapshot.banText}
              durationMinutes={successSnapshot.durationMinutes}
              onExitComplete={handleSuccessExitComplete}
              onShare={handleInviteMore}
              freezeFinalFrame={
                successToNextHandoff.retainSuccessPresentation ||
                successPresentationHandoffArmed
              }
            />
          </div>
        ) : null}

        {confirmActive ? (
          <div
            className="instant-ban-arena-send__confirm-layer"
            data-enter-phase={confirmOrb.enterPhase}
          >
            <div className="instant-ban-confirm-hold-strip">
              {traceZazhmiRenderSourceDiag({
                file: 'InstantBanFlow.tsx',
                component: 'InstantBanFlow',
                source: 'confirm-hold-strip-statusLabel',
                phase,
                sendComposePhase:
                  getConfirmOrbQueueDebugSnapshot().sendComposePhase,
                confirmActive,
                statusLabel: confirmOrb.statusLabel,
                showLobbyOrb,
                lobbyOrbVisible,
                queueLen: getConfirmOrbQueueDebugSnapshot().queueLen,
                pendingLen: pendingStartupInteractions,
                overlayQueueLength,
                queueClaimsNotificationScreen,
              })}
              {traceConfirmStripRenderDiag({
                confirmActive,
                phase,
                sendComposePhase:
                  getConfirmOrbQueueDebugSnapshot().sendComposePhase,
                statusLabel: confirmOrb.statusLabel,
                showLobbyOrb,
                lobbyOrbVisible,
                queueClaimsNotificationScreen,
                overlayQueueLength,
                pendingLen: pendingStartupInteractions,
                queueLen: overlayQueueLength,
                hasIncoming: incomingGateActive,
                notificationChainTransitioning,
                notificationChainAwaitingUser:
                  getConfirmOrbQueueDebugSnapshot()
                    .notificationChainAwaitingUser,
                renderOrbBlockers: legacyLobbyOrbBlockers,
                orbMountBlockedReason: confirmStripOrbMountBlockedReason,
              })}
              <p
                className={`instant-ban-status instant-ban-confirm-enter instant-ban-confirm-enter--5${
                  confirmSendError ? ' instant-ban-status--error' : ''
                }`}
              >
                {confirmOrb.statusLabel}
              </p>
              {confirmSendError ? (
                <button
                  type="button"
                  className="instant-ban-secondary"
                  onClick={() => void handleRetrySend()}
                >
                  Попробовать снова
                </button>
              ) : null}
            </div>
            <ConfirmScreen
              key={`confirm-${confirmEnterKey}-${selectedUser!.id ?? selectedUser!.userId ?? selectedUser!.username}`}
              enterKey={confirmEnterKey}
              enterPhase={confirmOrb.enterPhase}
              holdPhase={confirmOrb.holdPhase}
              selectedUser={selectedUser!}
              banText={banText}
              durationMinutes={durationMinutes}
              onBack={handleConfirmBack}
            />
          </div>
        ) : null}

        {overlayOpen ? (
          <div
            className={`instant-ban-send-overlay instant-ban-send-overlay--cross-screen${
              composeExitProgress > 0 ? ' instant-ban-send-overlay--compose-dismissing' : ''
            }`}
            style={{
              ...crossScreenStyle,
              ...(phase === 'composingBan' || composeExitProgress > 0
                ? composeOverlayStyle
                : undefined),
            }}
            role="presentation"
          >
            <div
              className={`instant-ban-send-overlay__shared-dim instant-ban-send-overlay__dim${
                whoExitActive ? ' instant-ban-send-overlay__dim--exiting' : ''
              }`}
              style={whoDimStyle}
              aria-hidden
            />
            <div
              className="instant-ban-cross-screen-viewport"
              onTouchStartCapture={onCrossScreenTouchStartCapture}
              onTouchMoveCapture={onCrossScreenTouchMoveCapture}
              onTouchEndCapture={onCrossScreenTouchEndCapture}
              onTouchCancelCapture={onCrossScreenTouchEndCapture}
            >
              <div className="instant-ban-cross-screen-track">
                <div className="instant-ban-cross-screen-page instant-ban-cross-screen-page--who">
                  {showWhoSurface ? (
                    <WhoOverlay
                      title={WHO_OVERLAY_TITLE}
                      friends={safeFriends}
                      onSelect={handleSelectUser}
                      onInviteMore={handleInviteMore}
                      onDismissDragProgress={handleWhoDismissDragProgress}
                      onDismissExitStart={handleWhoDismissExitStart}
                      onDismissToLobby={handleWhoDismissToLobby}
                      whoPanelEntering={
                        whoPanelEntering && crossScreenProgress < 0.02
                      }
                      gestureZoneActive={whoDismissGestureActive}
                    />
                  ) : (
                    <div
                      className="instant-ban-cross-screen-page__placeholder"
                      aria-hidden
                    />
                  )}
                </div>
                <div
                  className="instant-ban-cross-screen-page instant-ban-cross-screen-page--what"
                  data-no-horizontal-pager=""
                >
                  {showWhatSurface && selectedUser ? (
                    <WhatScreen
                      key={
                        selectedUser.id ??
                        selectedUser.userId ??
                        selectedUser.username
                      }
                      overlayTitle={WHAT_OVERLAY_TITLE}
                      onComposeExitProgress={handleComposeExitProgress}
                      onComposeExitStart={handleComposeExitStart}
                      selectedUser={selectedUser}
                      initialBanText={banText}
                      initialDurationMinutes={durationMinutes}
                      onSubmit={handleWhatSubmit}
                      onBack={handleWhatBack}
                    />
                  ) : (
                    <div className="instant-ban-cross-screen-page__placeholder" aria-hidden />
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {console.log('LOBBY_CTA_MIN_TRACE', {
        showBanButton:
          showLobbyCta &&
          !effectiveBansOverlayOpen &&
          !notificationQueueUiLock,
        canBan: canLobbySendBan(energyLoaded, lobbyInfluencePercent),
        energyReady: energyLoaded,
        lowEnergy:
          energyLoaded &&
          !canLobbySendBan(energyLoaded, lobbyInfluencePercent),
        activeOverlayKind,
        activeKind: activeOverlayKind,
        queueLen: overlayQueueLength,
        pendingLen: pendingStartupInteractions,
        notificationChainTransitioning,
        queueClaimsNotificationScreen,
        ctaState,
        reason: !showLobbyCta
          ? 'showLobbyCta-false'
          : effectiveBansOverlayOpen
            ? 'effectiveBansOverlayOpen'
            : notificationQueueUiLock
              ? 'notificationQueueUiLock'
              : null,
      }) || null}
      {showLobbyCta &&
      !effectiveBansOverlayOpen &&
      !notificationQueueUiLock ? (
        <ArenaLobbyIdle
          influencePercent={lobbyInfluencePercent}
          energyLoaded={energyLoaded}
          lobbyRingIntroFilling={false}
          ctaState={ctaState}
          ctaInteractive={ctaInteractive}
          lowInfluenceRevealed={lowInfluenceRevealed}
          onLowInfluenceRevealedChange={setLowInfluenceRevealed}
          lowEnergyBlockedSignal={lowEnergyBlockedSignal}
          dailyLimitBlockedSignal={dailyLimitBlockedSignal}
          sendBlockReason={lobbySendBlockReason}
          onBeginSend={handleBeginSend}
          onLowEnergyAsk={handleLowEnergyAsk}
        />
      ) : null}

      {lobbyActiveBanOverlay && typeof document !== 'undefined'
        ? createPortal(
            <div className="instant-ban-arena-send__lobby-active-ban-layer instant-ban-arena-send__lobby-active-ban-layer--portaled">
              <ActiveBanCardOverlay
                ban={lobbyActiveBanOverlay}
                viewerUserId={user?.id ?? null}
                isHistory={false}
                saved={savedBanIds.has(lobbyActiveBanOverlay.id)}
                onBack={handleLobbyActiveBanOverlayBack}
                onBanMore={() => handleBanMore(lobbyActiveBanOverlay)}
                onShare={() => handleBanShare(lobbyActiveBanOverlay)}
                onToggleSave={() => handleToggleSave(lobbyActiveBanOverlay)}
              />
            </div>,
            document.body,
          )
        : null}

      {showBansLayer ? (
        <div className="instant-ban-arena-send__bans-layer">
          <BansOverlay
            tab={bansTab}
            bans={filteredBans}
            userId={user?.id}
            savedBanIds={savedBanIds}
            archiveToast={archiveToast}
            onTabChange={setBansTab}
            onClose={handleCloseBansOverlay}
            onSelectBan={setSelectedBanForDetails}
            onToggleSave={handleToggleSave}
            onRepeatBan={handleRepeatBanFromArchive}
            onRemoveFromArchive={handleRemoveFromArchive}
            onDeleteModeEnter={handleArchiveDeleteModeEnter}
          />
          {selectedBanForDetails ? (
            <ActiveBanCardOverlay
              ban={selectedBanForDetails}
              viewerUserId={user?.id ?? null}
              isHistory={bansTab === 'history' || bansTab === 'archive'}
              saved={savedBanIds.has(selectedBanForDetails.id)}
              onBack={handleActiveBanBackToBansList}
              onBanMore={() => handleBanMore(selectedBanForDetails)}
              onShare={() => handleBanShare(selectedBanForDetails)}
              onToggleSave={() => handleToggleSave(selectedBanForDetails)}
            />
          ) : null}
        </div>
      ) : null}

      {settingsOverlayOpen && phase === 'idle' ? (
        <div className="instant-ban-arena-send__settings-layer">
          <ArenaSettingsPanel
            mode={notificationMode}
            saving={settingsModeSaving}
            onClose={handleCloseSettings}
            onModeChange={handleNotificationModeChange}
          />
        </div>
      ) : null}

      {monetizationOpen && phase === 'idle' ? (
        <div className="instant-ban-arena-send__monetization-layer">
          <MonetizationSection
            user={user}
            token={token}
            context={webApp ? 'telegram' : 'web'}
            onHaptic={haptic}
            onClose={handleCloseProfile}
            onStartBan={handleStartBanFromAnalytics}
          />
        </div>
      ) : null}
    </div>
    </>
  );
}
