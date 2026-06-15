'use client';

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
} from 'react';
import { flushSync } from 'react-dom';
import {
  coerceFriendList,
  findFriendByUsername,
  isValidDurationMinutes,
  type BanInteraction,
  type FriendCard,
  type SessionState,
  type UserPublic,
} from '@98plus/shared';
import { useApp } from '../Providers';
import { useTelegram } from '@/hooks/useTelegram';
import { useSendChallenge } from '@/hooks/useSendChallenge';
import { useInstantBanViewport } from '@/hooks/useInstantBanViewport';
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
import { resolveLobbyInfluencePercent } from '@/lib/lobby-influence';
import { logDeepLinkHandlerResult } from '@/lib/deep-link-boot-debug';
import { markVisibleOverboardTrace } from '@/lib/overboard-flow-debug';
import { logReplyFlow, logReplyFlowLoopGuard } from '@/lib/reply-handoff-debug';
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
import { LobbyOrbWrap } from '@/components/lobby/LobbyOrbWrap';
import { LobbyScreenAtmosphere } from '@/components/lobby/LobbyScreenAtmosphere';
import { LobbyBootLogoHideMarker } from '@/components/LobbyBootLogoHideMarker';
import { shouldHideLobbyBootLogoOnly } from '@/lib/lobby-boot-logo-hide';
import type { BootSceneIntroController } from './useBootSceneIntro';
import {
  getLobbyBootIntroPrimedSnapshot,
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
  isInsufficientEnergyApiError,
  isLowEnergySendFailure,
  logEnergyGate,
  resolveSendFlowSource,
} from '@/lib/energy-gate';
import { isReplyDeeplinkShellBan } from '@/lib/reply-deeplink-fast';
import { REPLY_DEEPLINK_TOAST_SENT } from '@/lib/reply-deeplink-action-result';
import { BanGlyph } from './SuccessBanCardBody';
import { logSendFlow } from '@/lib/send-flow-debug';
import { DEFAULT_SEND_TIMEOUT_MS } from '@/lib/request-timeout';
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
/** Extra wait before first CTA spring-in on cold app open (Who return unchanged). */
const LOBBY_CTA_COLD_START_DELAY_MS = 50;
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
    applyOptimisticSend,
    confirmOptimisticSend,
    rollbackOptimisticSend,
    activeBans,
    newBanWhoFlowRequest,
    openBansOverlayRequest,
    closeBansOverlayRequest,
    resultCtaBansOverlayOpen,
    clearResultCtaBansOverlayOpen,
    bansCtaQueueSuppress,
    clearBansCtaQueueSuppress,
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
    applySession,
    pendingStartupInteractions,
    releaseStartupInteractions,
    unlockNotificationQueueAndFlush,
    markSessionBanSendSuccess,
    resolveReplyParentActiveBanImmediate,
    refreshReplyParentActiveBanInBackground,
    hasReplyParentActivePriorityPending,
    getReplyParentActiveBanId,
    fetchReplyParentActiveBanFallback,
    markReplyParentActivePriorityShown,
    isReplyParentActivePriorityActive,
    releaseNotificationQueueAfterReplyParentActive,
    incomingGateActive,
    checkGateActive,
    notificationSessionActive,
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
  } = useApp();
  const { haptic, hapticSuccess } = useTelegram();
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

  const [phase, setPhase] = useState<SendFlowPhase>(() => {
    if (activeBanDeepLinkBanId) return 'idle';
    return sendStarted ? 'selectingTarget' : 'idle';
  });
  const [selectedUser, setSelectedUser] = useState<FriendCard | null>(null);
  const [banText, setBanText] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmEnterKey, setConfirmEnterKey] = useState(0);
  const [banSentSuccess, setBanSentSuccess] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const sendSnapshotRef = useRef<{
    banText: string;
    selectedUser: FriendCard;
    durationMinutes: number;
    replyToBanId: string | null;
  } | null>(null);
  const confirmSendContextRef = useRef<{
    payoffPhase: string;
    sendTriggered: boolean;
  }>({ payoffPhase: 'none', sendTriggered: false });
  const confirmAbortReleaseRef = useRef<(() => void) | null>(null);
  /** Blocks late success after INSUFFICIENT_ENERGY or stale send attempts. */
  const sendFailedRef = useRef(false);
  const flowSendAttemptRef = useRef(0);
  const returnToLobbyAfterLowEnergyRef = useRef<
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
  const [ctaState, setCtaState] = useState<LobbyCtaState>(() =>
    activeBanDeepLinkBanId || activeBanUiShellActive
      ? 'hidden'
      : resolveInitialCtaState(sendStarted),
  );
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
  const prevSendStartedRef = useRef(sendStarted);
  const skipActiveDeepLinkEntryRef = useRef(false);
  const activeBanRepeatComposeRef = useRef(false);
  const lastDeepLinkActiveBanIdRef = useRef<string | null>(null);
  const lastEarlyActiveBanIdRef = useRef<string | null>(null);
  const [bansOverlayOpen, setBansOverlayOpen] = useState(false);
  const [lowInfluenceRevealed, setLowInfluenceRevealed] = useState(false);
  const [lowEnergyBlockedSignal, setLowEnergyBlockedSignal] = useState(0);
  /** Suppresses confirm inline error/retry during low-energy lobby redirect. */
  const [lowEnergyRedirecting, setLowEnergyRedirecting] = useState(false);
  const [bansTab, setBansTab] = useState<BansTab>('yours');
  const [selectedBanForDetails, setSelectedBanForDetails] =
    useState<BanInteraction | null>(null);
  const [lobbyActiveBanOverlay, setLobbyActiveBanOverlay] =
    useState<BanInteraction | null>(null);
  const [historyBans, setHistoryBans] = useState<BanInteraction[]>([]);
  const [savedBans, setSavedBans] = useState<BanInteraction[]>([]);
  const [archiveToast, setArchiveToast] = useState<string | null>(null);
  const historyFetchGenRef = useRef(0);
  const savedFetchGenRef = useRef(0);
  const historyUserIdRef = useRef<string | null>(null);

  const legacyStep = legacyStepFromPhase(phase);
  const activeBanDeepLinkBooting =
    activeBanUiShellActive ||
    (activeBanDeepLinkBanId != null && !bansOverlayOpen);
  const showCrossScreenPager =
    !activeBanDeepLinkBooting &&
    (phase === 'selectingTarget' || phase === 'composingBan');
  const overlayOpen = showCrossScreenPager;
  const notificationOverlayActive = bansReturnToLobbyLatch
    ? false
    : notificationSessionActive ||
      incomingGateActive ||
      checkGateActive ||
      !!result;
  const bansLayerUiOpen =
    !bansReturnToLobbyLatch &&
    (bansOverlayOpen || bansCtaQueueSuppress || resultCtaBansOverlayOpen);
  const orbOverlayDim =
    crossScreenProgress > 0.02 ||
    phase === 'composingBan' ||
    bansLayerUiOpen ||
    (notificationOverlayActive && !bansReturnToLobbyLatch);
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
  const lobbyChromeHidden =
    replyLobbyBlocked || deepLinkRouteBootPending || replyIncomingDeeplinkPending;
  const showLobbyChrome = lobbyBootIntroPrimed && !lobbyChromeHidden;
  /** Orb stays mounted during route boot — only hide for reply/incoming block. */
  const lobbyOrbVisible = !replyIncomingDeeplinkPending && !replyLobbyBlocked;
  const showLobbyCta =
    lobbyBootIntroPrimed &&
    !replyIncomingDeeplinkPending &&
    (!replyLobbyBlocked || bansReturnToLobbyLatch) &&
    !deepLinkRouteBootPending &&
    !deepLinkReplyBooting &&
    !incomingReplyBanId &&
    (!incomingGateActive || bansReturnToLobbyLatch) &&
    (ctaState === 'visible' ||
      ctaState === 'exiting' ||
      ctaState === 'entering');
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
    setPhase('composingBan');
    setCrossScreenProgressImmediate(1);
  }, [setCrossScreenProgressImmediate]);

  const completeWhatToWho = useCallback(() => {
    screenTransitionRef.current = null;
    setScreenTransition(null);
    setPhase('selectingTarget');
    setCrossScreenProgressImmediate(0);
  }, [setCrossScreenProgressImmediate]);

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
    if (!lobbyBootIntroPrimed) return;
    if (replyIncomingDeeplinkPending) return;
    if (replyUiShellActive) return;
    if (lobbyCtaBootSpringRef.current) return;
    if (sendStarted) return;
    if (prefersReducedMotion()) {
      lobbyCtaBootSpringRef.current = true;
      setCtaState('visible');
      return;
    }
    lobbyCtaBootSpringRef.current = true;
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
        setPhase(entryPhase);
        if (entryPhase === 'composingBan') {
          setCrossScreenProgressImmediate(1);
        }
      } else if (incomingReplyBanId || replyComposeActive) {
        if (phase !== 'composingBan') {
          setPhase('composingBan');
        } else {
          logReplyFlowLoopGuard('skip already composingBan');
        }
        setCrossScreenProgressImmediate(1);
      } else {
        setPhase('selectingTarget');
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

  const notificationQueueUiLock =
    notificationSessionActive || notificationOverlayActive;
  const effectiveBansOverlayOpen = bansLayerUiOpen;
  const showLobbyTopNav =
    lobbyBootIntroPrimed &&
    phase === 'idle' &&
    !banSentSuccess &&
    !effectiveBansOverlayOpen &&
    (!notificationQueueUiLock || bansReturnToLobbyLatch) &&
    !replyUiShellActive &&
    !deepLinkRouteBootPending;
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
  }, [lobbyBootIntroPrimed, showLobbyChrome, showLobbyCta]);

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
        setPhase('selectingTarget');
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
      setBanSentSuccess(false);
      sendSnapshotRef.current = null;
      setCrossScreenProgressImmediate(1);

      if (targetPhase === 'confirming') {
        setConfirmEnterKey((k) => k + 1);
        confirmEntrySourceRef.current = options?.bansOverlayTab
          ? { type: 'bans-overlay', tab: options.bansOverlayTab }
          : 'send-flow';
      }

      onStartSend();
      setPhase(targetPhase);

      return true;
    },
    [
      clearCtaExitTimer,
      clearWhoPanelEnterTimer,
      onStartSend,
      safeFriends,
      setCrossScreenProgressImmediate,
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
      setBanSentSuccess(false);
      sendSnapshotRef.current = null;
      if (phase !== 'composingBan') {
        setPhase('composingBan');
      } else {
        logReplyFlowLoopGuard('skip already composingBan');
      }
      setCrossScreenProgressImmediate(1);
      setCtaState('hidden');
      if (!options?.skipLobbyStart && !sendStarted) {
        onStartSend();
      }
      return true;
    },
    [
      clearCtaExitTimer,
      clearWhoPanelEnterTimer,
      onStartSend,
      phase,
      safeFriends,
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
      setPhase('idle');
      setCtaState('hidden');
      onStartSend();
      return true;
    },
    [onStartSend],
  );

  const prepareLobbyBaseAfterSuccess = useCallback(
    (source: string) => {
      const closedBansOverlay =
        bansOverlayOpen ||
        selectedBanForDetails != null ||
        lobbyActiveBanOverlay != null ||
        bansCtaQueueSuppress ||
        resultCtaBansOverlayOpen;
      if (closedBansOverlay) {
        console.log('[bans-overlay-force-close-after-success]', { reason: source });
      }
      setBansOverlayOpen(false);
      setSelectedBanForDetails(null);
      setLobbyActiveBanOverlay(null);
      if (bansCtaQueueSuppress) clearBansCtaQueueSuppress();
      if (resultCtaBansOverlayOpen) clearResultCtaBansOverlayOpen();
      resetBansNavState();
      setBansReturnToLobbyLatch(true);
      openLobby(`success-exit-${source}`);
      console.log('[success-exit-base-lobby]', {
        source,
        closedBansOverlay,
        lobbyOpen: true,
      });
    },
    [
      bansCtaQueueSuppress,
      bansOverlayOpen,
      clearBansCtaQueueSuppress,
      clearResultCtaBansOverlayOpen,
      lobbyActiveBanOverlay,
      openLobby,
      resetBansNavState,
      resultCtaBansOverlayOpen,
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
    if (phase !== 'idle' || banSentSuccess) return;
    const hadPendingIndicator = pendingStartupInteractions;
    console.log('[queue-debug] manual flush from lobby button', {
      pendingStartupInteractions: hadPendingIndicator,
    });
    logOverlayPriority('explicit-bans-open-unlock', {});
    clearActiveBanDeepLinkShell('lobby-bans-button');
    closeSendFlow();
    unlockNotificationQueueAndFlush('explicit-bans-open-unlock');
    releaseStartupInteractions({ force: true });
    if (hadPendingIndicator) {
      return;
    }
    resetBansNavState();
    setBansTab('yours');
    setSelectedBanForDetails(null);
    setBansOverlayOpen(true);
  }, [
    banSentSuccess,
    clearActiveBanDeepLinkShell,
    closeSendFlow,
    pendingStartupInteractions,
    phase,
    releaseStartupInteractions,
    resetBansNavState,
    unlockNotificationQueueAndFlush,
  ]);

  const resetSendUiForBansCta = useCallback(() => {
    sendEntryPhaseRef.current = null;
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
    setBanSentSuccess(false);
    sendSnapshotRef.current = null;
    setCtaState('hidden');
    setPhase('idle');
  }, [setCrossScreenProgressImmediate, stopCrossScreenAnim]);

  useLayoutEffect(() => {
    resetSendUiForBansCtaRef.current = resetSendUiForBansCta;
  }, [resetSendUiForBansCta]);

  const handleOpenBansFromResultCta = useCallback((): boolean => {
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
    console.log('[open-bans-from-result-cta]', {
      action: 'open',
      direct: true,
      bansCtaQueueSuppress,
      phase,
      notificationQueueUiLock:
        notificationSessionActive || notificationOverlayActive,
    });
    setBansTab('yours');
    setSelectedBanForDetails(null);
    setBansOverlayOpen(true);
    console.log('[BANS OVERLAY OPENED]', {
      ok: true,
      tab: 'yours',
      bansCtaQueueSuppress,
      phase,
    });
    return true;
  }, [
    banSentSuccess,
    bansCtaQueueSuppress,
    notificationSessionActive,
    notificationOverlayActive,
    phase,
    resetSendUiForBansCta,
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
        releaseNotificationQueueAfterReplyParentActive();
      } else if (isNotificationQueueLocked() || wasBansCta) {
        unlockNotificationQueueAndFlush(
          wasBansCta ? 'result-cta-bans-closed' : 'target-flow-closed',
        );
      }
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
      scheduleCtaBecomeVisible,
      scheduleLobbyVisibilityCheck,
      sendFlowOpen,
      sendStarted,
      unlockNotificationQueueAndFlush,
    ],
  );

  useLayoutEffect(() => {
    handleCloseBansOverlayRef.current = handleCloseBansOverlay;
  }, [handleCloseBansOverlay]);

  const handleLobbyActiveBanOverlayBack = useCallback(() => {
    flushSync(() => {
      setLobbyActiveBanOverlay(null);
    });
    releaseNotificationQueueAfterReplyParentActive();
  }, [releaseNotificationQueueAfterReplyParentActive]);

  const handleActiveBanBackToBansList = useCallback(() => {
    if (lobbyActiveBanOverlay) {
      handleLobbyActiveBanOverlayBack();
      return;
    }
    if (isReplyParentActivePriorityActive()) {
      setSelectedBanForDetails(null);
      releaseNotificationQueueAfterReplyParentActive();
      return;
    }
    logOverlayPriority('explicit-bans-open-unlock', { source: 'active-ban-back' });
    unlockNotificationQueueAndFlush('explicit-bans-open-unlock');
    setSelectedBanForDetails(null);
  }, [
    handleLobbyActiveBanOverlayBack,
    isReplyParentActivePriorityActive,
    lobbyActiveBanOverlay,
    releaseNotificationQueueAfterReplyParentActive,
    unlockNotificationQueueAndFlush,
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
    ],
  );

  const handleSuccessExitComplete = useCallback(() => {
    const successExitStartedAt = performance.now();
    console.log('[queue-debug] success exit', {
      fromActiveRepeat: activeBanRepeatComposeRef.current,
      pendingStartupInteractions,
    });

    flushSync(() => {
      clearActiveBanDeepLinkShell('success-exit');
      activeBanRepeatComposeRef.current = false;
      closeSendFlow();
      setBansOverlayOpen(false);
      setSelectedBanForDetails(null);
      setLobbyActiveBanOverlay(null);
      setBanSentSuccess(false);
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
      setPhase('idle');
    });

    const parentBan = resolveReplyParentActiveBanImmediate();
    if (parentBan) {
      flushSync(() => {
        prepareLobbyBaseAfterSuccess('reply-parent-active');
        markReplyParentActivePriorityShown(parentBan.id);
        lockNotificationQueue('deep-link-active-ban', parentBan.id);
        setLobbyActiveBanOverlay(parentBan);
        logOpenActiveBanCard(parentBan.id, 'reply-parent-active-on-lobby');
      });
      console.log('[reply-parent-active-delay-ms]', {
        ms: Math.round(performance.now() - successExitStartedAt),
      });
      notifyActiveBanCardVisible(parentBan.id);
      beginCtaSpringIn();
      refreshReplyParentActiveBanInBackground(parentBan.id);
      return;
    }

    const parentBanId = hasReplyParentActivePriorityPending()
      ? getReplyParentActiveBanId()
      : null;
    if (parentBanId) {
      console.log('[reply-parent-active-fetch-blocked]', {
        reason: 'no-immediate-cache',
        parentBanId,
      });
      void (async () => {
        const fetchedBan = await fetchReplyParentActiveBanFallback(parentBanId);
        console.log('[reply-parent-active-delay-ms]', {
          ms: Math.round(performance.now() - successExitStartedAt),
        });
        if (!fetchedBan) {
          flushSync(() => {
            prepareLobbyBaseAfterSuccess('send-success');
          });
          logOverlayPriority('send-success-unlock', {});
          unlockNotificationQueueAndFlush('send-success-unlock');
          releaseStartupInteractions({ force: true });
          beginCtaSpringIn();
          return;
        }
        flushSync(() => {
          prepareLobbyBaseAfterSuccess('reply-parent-active');
          markReplyParentActivePriorityShown(fetchedBan.id);
          lockNotificationQueue('deep-link-active-ban', fetchedBan.id);
          setLobbyActiveBanOverlay(fetchedBan);
          logOpenActiveBanCard(fetchedBan.id, 'reply-parent-active-on-lobby');
        });
        notifyActiveBanCardVisible(fetchedBan.id);
        beginCtaSpringIn();
      })();
      return;
    }

    flushSync(() => {
      prepareLobbyBaseAfterSuccess('send-success');
    });
    logOverlayPriority('send-success-unlock', {});
    unlockNotificationQueueAndFlush('send-success-unlock');
    releaseStartupInteractions({ force: true });
    beginCtaSpringIn();
  }, [
    beginCtaSpringIn,
    clearActiveBanDeepLinkShell,
    closeSendFlow,
    fetchReplyParentActiveBanFallback,
    getReplyParentActiveBanId,
    hasReplyParentActivePriorityPending,
    markReplyParentActivePriorityShown,
    notifyActiveBanCardVisible,
    pendingStartupInteractions,
    prepareLobbyBaseAfterSuccess,
    refreshReplyParentActiveBanInBackground,
    releaseStartupInteractions,
    resolveReplyParentActiveBanImmediate,
    unlockNotificationQueueAndFlush,
    setCrossScreenProgressImmediate,
    stopCrossScreenAnim,
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
        logSendFlow('blocked-late-success', {
          banId,
          reason: 'send-failed',
          attemptId,
        });
        return;
      }
      const currentAttempt = flowSendAttemptRef.current;
      if (attemptId != null && attemptId !== currentAttempt) {
        logSendFlow('blocked-late-success', {
          banId,
          reason: 'stale-attempt',
          attemptId,
          currentAttempt,
        });
        return;
      }
      if (!banId.trim()) return;

      logSendFlow('open-success', { banId, attemptId: attemptId ?? currentAttempt });
      console.log('[active-repeat-debug] send success', {
        banId,
        fromActiveRepeat: activeBanRepeatComposeRef.current,
      });
      clearActiveBanDeepLinkShell('send-success');
      console.log('[active-repeat-debug] show success card', { banId });
      setSendError(null);
      markSessionBanSendSuccess();
      instantBanSendSuccessDebug({
        banId,
        payoffPending: confirmSendContextRef.current.sendTriggered,
        payoffPhase: confirmSendContextRef.current.payoffPhase,
      });
      setBanSentSuccess(true);
    },
    [clearActiveBanDeepLinkShell, markSessionBanSendSuccess],
  );

  const showOptimisticSendSuccess = useCallback(() => {
    if (sendFailedRef.current || banSentSuccess) return;
    logSendFlow('optimistic-success', {
      attemptId: flowSendAttemptRef.current,
    });
    setSendError(null);
    markSessionBanSendSuccess();
    triggerConfirmHaptic();
    haptic('medium');
    setBanSentSuccess(true);
  }, [banSentSuccess, haptic, markSessionBanSendSuccess]);

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
      setBanSentSuccess(false);
      confirmAbortReleaseRef.current?.();
    },
    onFail: (p) => {
      if (sendFailedRef.current || isLowEnergySendFailure(p.message)) {
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
  ]);

  const handleBeginSend = useCallback(() => {
    if (phase !== 'idle' || ctaState !== 'visible') return;

    clearCtaExitTimer();
    clearWhoPanelEnterTimer();
    setCtaState('exiting');
    setWhoPanelEntering(true);
    onStartSend();
    setPhase('selectingTarget');

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
    onStartSend,
    phase,
  ]);

  const beginNewBanWhoFlow = useCallback(() => {
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
    setBanSentSuccess(false);
    sendSnapshotRef.current = null;
    setCrossScreenProgressImmediate(0);
    onStartSend();
    setPhase('selectingTarget');
  }, [
    clearCtaExitTimer,
    clearWhoPanelEnterTimer,
    onStartSend,
    setCrossScreenProgressImmediate,
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
      clearResultCtaBansOverlayOpen,
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
    [deepLinkReplyBan?.id, replyComposeActive, scheduleBansVisibleCheck],
  );

  useLayoutEffect(() => {
    if (closeBansOverlayRequest === 0) return;
    lastOpenBansOverlayRequestRef.current = 0;
    resultCtaBansOpenTickRef.current = 0;
    setBansOverlayOpen(false);
    setSelectedBanForDetails(null);
    console.log('[queue-reply-debug] close local bans overlay', {
      closeBansOverlayRequest,
    });
  }, [closeBansOverlayRequest]);

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
    scheduleBansVisibleCheck('direct-result-cleanup');
  }, [bansCtaQueueSuppress, result, scheduleBansVisibleCheck]);

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
    setPhase('idle');
    beginCtaSpringIn();
    if (process.env.NODE_ENV === 'development') {
      console.log('[who-dismiss-set-phase-idle]');
    }
  }, [beginCtaSpringIn, setCrossScreenProgressImmediate, stopCrossScreenAnim]);

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
    finishWhoDismiss();
    if (process.env.NODE_ENV === 'development') {
      requestAnimationFrame(() => {
        console.log('[who-dismiss-phase-after]', {
          note: 'read on next render via flow-render log',
        });
      });
    }
  }, [finishWhoDismiss, phase]);


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
    setBanSentSuccess(false);
    sendSnapshotRef.current = null;
    confirmEntrySourceRef.current = 'send-flow';
    setPhase('confirming');
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
    setBanSentSuccess(false);
    setSendError(null);
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
      setPhase('idle');
      setBansOverlayOpen(true);
      setCrossScreenProgressImmediate(0);
      stopCrossScreenAnim();
      screenTransitionRef.current = null;
      setScreenTransition(null);
      return;
    }

    setPhase('composingBan');
  }, [setCrossScreenProgressImmediate, stopCrossScreenAnim]);

  const handleInviteMore = useCallback(() => {
    shareInstantBanInviteMore(user?.username ?? null);
    haptic('light');
  }, [user?.username, haptic]);

  const handleSendContextChange = useCallback(
    (ctx: { payoffPhase: string; sendTriggered: boolean }) => {
      confirmSendContextRef.current = ctx;
    },
    [],
  );

  const handleBindAbortRelease = useCallback((abort: () => void) => {
    confirmAbortReleaseRef.current = abort;
  }, []);

  const returnToLobbyAfterLowEnergy = useCallback(
    (opts?: { source?: string; apiResult?: string }) => {
      sendFailedRef.current = true;
      setLowEnergyRedirecting(true);
      setReplySending(false);
      logSendFlow('insufficient-energy-stop', {
        source: opts?.source,
        apiResult: opts?.apiResult,
        attemptId: flowSendAttemptRef.current,
      });
      logSendFlow('insufficient-energy-redirect-to-lobby', {
        source: opts?.source,
        apiResult: opts?.apiResult,
      });
      logSendFlow('suppress-confirm-error-for-low-energy', {
        source: opts?.source,
      });

      closeSendFlow();
      onClose?.();
      clearReplyDeepLinkState();
      clearIncomingReply();
      clearDeepLinkReplyBan();
      releaseReplyHandoffLock();
      setDeepLinkReplyBooting(false);

      confirmAbortReleaseRef.current?.();
      setConfirmEnterKey((k) => k + 1);
      setBanSentSuccess(false);
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
      setPhase('idle');
      setCtaState('hidden');
      setLowInfluenceRevealed(true);
      setLowEnergyBlockedSignal((n) => n + 1);
      openLobby();
      triggerLobbyBlockedHaptic();
      logSendFlow('lobby-hint-shown', { source: opts?.source });
      logEnergyGate('return-to-lobby', {
        phase: 'idle',
        incomingReplyBanId: null,
        sendFlowOpen: false,
        source: opts?.source,
        apiResult: opts?.apiResult,
      });
      logEnergyGate('low-energy-hint-visible', {});
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
      stopCrossScreenAnim,
    ],
  );

  returnToLobbyAfterLowEnergyRef.current = returnToLobbyAfterLowEnergy;

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
      snap.replyToBanId ?? getPinnedReplyToBanId() ?? replyToBanId ?? null;
    const source = resolveSendFlowSource({
      replyToBanId: pinnedReplyToBanId,
      incomingReplyBanId,
      deepLinkReplyBanId: deepLinkReplyBan?.id ?? null,
      replyDeepLinkBanId,
    });
    const isReplyFlow = source === 'reply_from_bot';
    const effectiveReplyBanId =
      pinnedReplyToBanId ??
      incomingReplyBanId ??
      deepLinkReplyBan?.id ??
      replyDeepLinkBanId ??
      null;
    const receiverId =
      sendTarget.receiverUserId ?? snapUser.userId ?? snapUser.id ?? null;
    const selectedUserId = snapUser.userId ?? snapUser.id ?? null;
    const replyEndpoint = effectiveReplyBanId
      ? `/bans/${effectiveReplyBanId}/reply`
      : null;

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

    const energyGate = await evaluateConfirmSubmitEnergy(token, {
      energyLoaded,
      influencePercent,
    });
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

    showOptimisticSendSuccess();

    void (async () => {
      try {
        if (effectiveReplyBanId) {
          setReplySending(true);
          const endpoint = `/bans/${effectiveReplyBanId}/reply`;
          const replyPayload = {
            text,
            durationMinutes: snapDuration,
          };
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
            logSendFlow('api-response', {
              status: 'ok',
              banId: res.replyBan?.id ?? null,
              attemptId,
            });
            if (!res.replyBan?.id) {
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
        if (outcome === 'skipped') {
          instantBanDebug('send-skipped', { reason: 'hook-in-flight' });
        }
      } catch (e) {
        logSendFlow('api-error', {
          status: (e as { status?: number }).status,
          message: e instanceof Error ? e.message : String(e),
          attemptId,
        });
        if (isLowEnergySendFailure(e)) {
          logEnergyGate('insufficientEnergyRedirect', {
            source,
            energyBefore: energyGate.influencePercent,
            canSend: false,
            apiResult: 'INSUFFICIENT_ENERGY',
          });
          setBanSentSuccess(false);
          returnToLobbyAfterLowEnergy({
            source,
            apiResult: 'INSUFFICIENT_ENERGY',
          });
          return;
        }
        const message =
          e instanceof Error ? e.message : 'Не получилось отправить запрет';
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
        setBanSentSuccess(false);
        confirmAbortReleaseRef.current?.();
      }
    })();

    return 'started';
  }, [
    token,
    haptic,
    safeFriends,
    user?.username,
    user?.id,
    send,
    banSentSuccess,
    incomingReplyBanId,
    replyToBanId,
    replyComposeActive,
    getPinnedReplyToBanId,
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
    showOptimisticSendSuccess,
    energyLoaded,
    influencePercent,
    refreshUser,
    returnToLobbyAfterLowEnergy,
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
    const pinnedReplyId = getPinnedReplyToBanId() ?? replyToBanId ?? null;
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
    replyToBanId,
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
    phase === 'confirming' && selectedUser != null && !banSentSuccess;
  const orbCompressActive =
    !banSentSuccess &&
    (composeDismissing || (phase === 'confirming' && selectedUser != null));
  const hideLobbyBootLogoOnly = shouldHideLobbyBootLogoOnly({
    phase,
    replyComposeActive,
  });
  const confirmLayoutActive = orbCompressActive;
  const successSnapshot = sendSnapshotRef.current;

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
    visualRingPercent,
    onLogoScaleEnd: onBootLogoScaleEnd,
    onRingScaleEnd: onBootRingScaleEnd,
    onFillEnd: onBootFillEnd,
    logoScaleMs: bootLogoScaleMs,
    logoScaleDelayMs: bootLogoScaleDelayMs,
    ringScaleMs: bootRingScaleMs,
    fillMs: bootFillMs,
  } = bootIntro;

  const lobbyRingDisplayPercent = useMemo(() => {
    if (!energyLoaded) {
      return getLobbyBootIntroPrimedSnapshot().ringPercent;
    }
    return lobbyInfluencePercent;
  }, [energyLoaded, lobbyInfluencePercent]);

  const showBootOrb = lobbyOrbVisible && !lobbyBootIntroPrimed;
  const showLobbyOrb = lobbyOrbVisible && lobbyBootIntroPrimed;
  const persistentLobbyLogoActive = !confirmActive && !orbCompressActive;
  const persistentLogoVisible =
    persistentLobbyLogoActive && !hideLobbyBootLogoOnly;

  useLayoutEffect(() => {
    patchBootHandoffDebug({
      bootSceneVisible: showBootOrb,
      orbSource: showBootOrb ? 'BootScene' : showLobbyOrb ? 'Lobby' : 'none',
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
      }${persistentLobbyLogoActive ? ' instant-ban-flow--persistent-lobby-logo' : ''}`}
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
      data-bans-cta-session={bansCtaQueueSuppress ? '' : undefined}
      data-notification-session={
        notificationSessionActive &&
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
      {showLobbyTopNav ? (
        <ArenaLobbyTopNav
          onOpenBans={handleOpenBansOverlay}
          bansNeedAttention={pendingStartupInteractions}
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
            onLogoScaleEnd={onBootLogoScaleEnd}
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
            onRingScaleEnd={onBootRingScaleEnd}
            onFillEnd={onBootFillEnd}
            data-boot-orb
            data-orb-instance={bootOrbInstanceId}
          >
            <LobbyIdleOrb
              ringPercent={visualRingPercent}
              bootFillActive={bootFillActive}
              hideTitle
            />
          </LobbyBootOrbWrap>
        ) : null}

        {showLobbyOrb ? (
          <LobbyOrbWrap
            ref={lobbyOrbMountRef}
            data-orb-instance={lobbyOrbInstanceId}
            className={`lobby-screen__orb-wrap lobby-screen__orb-root${
              confirmLayoutActive ? ' lobby-screen__orb-wrap--confirm' : ''
            }${orbOverlayDim ? ' lobby-screen__orb-wrap--overlay-dim' : ''}`}
          >
            <ArenaLobbyOrb
              sendPhase={phase}
              confirmActive={confirmActive}
              orbCompressActive={orbCompressActive}
              confirmOrb={confirmOrb}
              lobbyRingDisplayPercent={lobbyRingDisplayPercent}
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
            />
          </div>
        ) : null}

        {confirmActive ? (
          <div
            className="instant-ban-arena-send__confirm-layer"
            data-enter-phase={confirmOrb.enterPhase}
          >
            <div className="instant-ban-confirm-hold-strip">
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
                </div>
                <div
                  className="instant-ban-cross-screen-page instant-ban-cross-screen-page--what"
                  data-no-horizontal-pager=""
                >
                  {selectedUser ? (
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

      {showLobbyCta &&
      !effectiveBansOverlayOpen &&
      (!notificationQueueUiLock || bansReturnToLobbyLatch) ? (
        <ArenaLobbyIdle
          influencePercent={lobbyInfluencePercent}
          energyLoaded={energyLoaded}
          lobbyRingIntroFilling={false}
          ctaState={ctaState}
          ctaInteractive={ctaInteractive}
          lowInfluenceRevealed={lowInfluenceRevealed}
          onLowInfluenceRevealedChange={setLowInfluenceRevealed}
          lowEnergyBlockedSignal={lowEnergyBlockedSignal}
          onBeginSend={handleBeginSend}
          onLowEnergyAsk={handleLowEnergyAsk}
        />
      ) : null}

      {lobbyActiveBanOverlay ? (
        <div className="instant-ban-arena-send__lobby-active-ban-layer">
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
        </div>
      ) : null}

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
    </div>
    </>
  );
}
