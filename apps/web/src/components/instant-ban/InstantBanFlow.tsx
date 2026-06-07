'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  coerceFriendList,
  findFriendByUsername,
  isValidDurationMinutes,
  type BanInteraction,
  type FriendCard,
  type SessionState,
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
import { useLobbyRingIntroFill } from './useLobbyRingIntroFill';
import { canLobbySendBan } from '@/lib/lobby-influence';
import { triggerLobbyBlockedHaptic } from './lobby-cta-haptics';
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
const CTA_EXIT_MS = 200;
const CTA_ENTER_MS = 400;
/** Extra wait before first CTA spring-in on cold app open (Who return unchanged). */
const LOBBY_CTA_COLD_START_DELAY_MS = 200;
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
    deepLinkRepeatBan,
    clearDeepLinkRepeatBan,
    deepLinkReplyBan,
    clearDeepLinkReplyBan,
    deepLinkActiveBan,
    clearDeepLinkActiveBan,
    incomingReplyBanId,
    clearIncomingReply,
    applySession,
    pendingStartupInteractions,
    releaseStartupInteractions,
    markSessionBanSendSuccess,
    incomingGateActive,
    checkGateActive,
    notificationSessionActive,
    result,
    sendFlowOpen,
    overlayQueueLength,
    deepLinkReplyBooting,
    setDeepLinkReplyBooting,
  } = useApp();
  const { haptic, hapticSuccess } = useTelegram();

  const [phase, setPhase] = useState<SendFlowPhase>(
    sendStarted ? 'selectingTarget' : 'idle',
  );
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
  } | null>(null);
  const confirmSendContextRef = useRef<{
    payoffPhase: string;
    sendTriggered: boolean;
  }>({ payoffPhase: 'none', sendTriggered: false });
  const confirmAbortReleaseRef = useRef<(() => void) | null>(null);
  /** Phase to enter when sendStarted flips false→true (archive repeat / ban-more). */
  const sendEntryPhaseRef = useRef<SendFlowPhase | null>(null);
  /** Where Confirm was opened from — drives ← back navigation. */
  const confirmEntrySourceRef = useRef<ConfirmEntrySource>('send-flow');
  const lobbyOrbMountRef = useRef<HTMLDivElement>(null);
  const [composeExitProgress, setComposeExitProgress] = useState(0);
  const [composeDismissing, setComposeDismissing] = useState(false);
  const whoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [whoExitActive, setWhoExitActive] = useState(false);
  const [whoDismissProgress, setWhoDismissProgress] = useState(0);
  const [ctaState, setCtaState] = useState<LobbyCtaState>(() =>
    resolveInitialCtaState(sendStarted),
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
  const [bansOverlayOpen, setBansOverlayOpen] = useState(false);
  const [lowInfluenceRevealed, setLowInfluenceRevealed] = useState(false);
  const [lowEnergyBlockedSignal, setLowEnergyBlockedSignal] = useState(0);
  const [bansTab, setBansTab] = useState<BansTab>('yours');
  const [selectedBanForDetails, setSelectedBanForDetails] =
    useState<BanInteraction | null>(null);
  const [historyBans, setHistoryBans] = useState<BanInteraction[]>([]);
  const [savedBans, setSavedBans] = useState<BanInteraction[]>([]);
  const [archiveToast, setArchiveToast] = useState<string | null>(null);
  const historyFetchGenRef = useRef(0);
  const savedFetchGenRef = useRef(0);
  const historyUserIdRef = useRef<string | null>(null);

  const legacyStep = legacyStepFromPhase(phase);
  const showCrossScreenPager =
    phase === 'selectingTarget' || phase === 'composingBan';
  const overlayOpen = showCrossScreenPager;
  const notificationOverlayActive =
    notificationSessionActive ||
    incomingGateActive ||
    checkGateActive ||
    !!result;
  const orbOverlayDim =
    crossScreenProgress > 0.02 ||
    phase === 'composingBan' ||
    bansOverlayOpen ||
    notificationOverlayActive;
  /** Horizontal pager only on Who — no finger swipe What → Who. */
  const crossScreenDragEnabled =
    selectedUser != null && phase === 'selectingTarget';
  /** Fixed Who dismiss zone (z-index 11) must not cover What interactive layer. */
  const whoDismissGestureActive =
    phase === 'selectingTarget' && crossScreenProgress < 0.02;
  const showLobbyCta =
    !deepLinkReplyBooting &&
    !incomingReplyBanId &&
    !incomingGateActive &&
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

  /** First lobby open only — dismiss re-entry uses beginCtaSpringIn. */
  useEffect(() => {
    if (lobbyCtaBootSpringRef.current) return;
    if (sendStarted) return;
    if (prefersReducedMotion()) return;
    lobbyCtaBootSpringRef.current = true;
    ctaBootDelayTimerRef.current = setTimeout(() => {
      ctaBootDelayTimerRef.current = null;
      setCtaState('entering');
      scheduleCtaBecomeVisible();
    }, LOBBY_CTA_COLD_START_DELAY_MS);
    return () => clearCtaBootDelayTimer();
  }, [clearCtaBootDelayTimer, scheduleCtaBecomeVisible, sendStarted]);

  /** Only enter who-step when send flow opens — not when user dismisses back to lobby idle. */
  useEffect(() => {
    if (sendStarted && !prevSendStartedRef.current) {
      clearCtaBootDelayTimer();
      const entryPhase = sendEntryPhaseRef.current;
      sendEntryPhaseRef.current = null;
      if (entryPhase) {
        setPhase(entryPhase);
        if (entryPhase === 'composingBan') {
          setCrossScreenProgressImmediate(1);
        }
      } else if (incomingReplyBanId) {
        setPhase('composingBan');
        setCrossScreenProgressImmediate(1);
      } else {
        setPhase('selectingTarget');
      }
      setCtaState('hidden');
    }
    prevSendStartedRef.current = sendStarted;
  }, [
    clearCtaBootDelayTimer,
    incomingReplyBanId,
    sendStarted,
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
      return coerceFriendList(friends).filter(
        (f) => (f.username ?? '').toLowerCase() !== 'share',
      );
    } catch {
      return [];
    }
  }, [friends]);

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
  const showLobbyTopNav =
    phase === 'idle' &&
    !banSentSuccess &&
    !bansOverlayOpen &&
    !notificationQueueUiLock;
  const showBansLayer =
    bansOverlayOpen && phase === 'idle' && !notificationQueueUiLock;

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

  useEffect(() => {
    if (phase !== 'idle') {
      setBansOverlayOpen(false);
      setSelectedBanForDetails(null);
    }
  }, [phase]);

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

      if (options?.bansOverlayTab != null) {
        if (!canLobbySendBan(energyLoaded, influencePercent)) {
          console.log('[repeat-ban-low-energy-blocked]', {
            banId: ban.id,
            tab: options.bansOverlayTab,
            influencePercent,
            energyLoaded,
          });
          triggerLobbyBlockedHaptic();
          setLowInfluenceRevealed(true);
          setLowEnergyBlockedSignal((n) => n + 1);
          setBansOverlayOpen(false);
          setSelectedBanForDetails(null);
          setPhase('idle');
          confirmEntrySourceRef.current = 'send-flow';
          return false;
        }
      }

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
      energyLoaded,
      influencePercent,
      onStartSend,
      safeFriends,
      setCrossScreenProgressImmediate,
      user?.id,
    ],
  );

  const beginIncomingReplyFromDeepLink = useCallback(
    (ban: BanInteraction) => {
      if (!user?.id) return false;

      const opponent = opponentForBan(ban, user.id);
      if (!opponent?.id && !opponent?.username) return false;

      const { card: friend } = resolveOpponentFriendCard(opponent, safeFriends);

      sendEntryPhaseRef.current = 'composingBan';
      setBansOverlayOpen(false);
      setSelectedBanForDetails(null);
      clearCtaExitTimer();
      clearWhoPanelEnterTimer();
      setCtaState('hidden');
      setSelectedUser(friend);
      setBanText('');
      setDurationMinutes(DEFAULT_DURATION_MINUTES);
      setSendError(null);
      setComposeExitProgress(0);
      setComposeDismissing(false);
      setBanSentSuccess(false);
      sendSnapshotRef.current = null;
      setPhase('composingBan');
      setCrossScreenProgressImmediate(1);
      setCtaState('hidden');
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
      user?.id,
    ],
  );

  const beginActiveBanFromDeepLink = useCallback(
    (ban: BanInteraction) => {
      releaseStartupInteractions();
      setBansTab('yours');
      setSelectedBanForDetails(ban);
      setBansOverlayOpen(true);
      setPhase('idle');
      setCtaState('hidden');
      onStartSend();
      return true;
    },
    [onStartSend, releaseStartupInteractions],
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
    releaseStartupInteractions();
    setBansTab('yours');
    setSelectedBanForDetails(null);
    setBansOverlayOpen(true);
  }, [banSentSuccess, phase, releaseStartupInteractions]);

  const handleCloseBansOverlay = useCallback(() => {
    setBansOverlayOpen(false);
    setSelectedBanForDetails(null);
  }, []);

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
      beginRepeatBanFlow(ban, {
        goToConfirm: true,
        bansOverlayTab: bansTab,
      });
    },
    [beginRepeatBanFlow, bansTab],
  );

  const handleSuccessExitComplete = useCallback(() => {
    releaseStartupInteractions({ requireBanSend: true });
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
    beginCtaSpringIn();
  }, [
    beginCtaSpringIn,
    releaseStartupInteractions,
    setCrossScreenProgressImmediate,
    stopCrossScreenAnim,
  ]);

  const onSuccess = useCallback(() => {
    setSendError(null);
    markSessionBanSendSuccess();
    instantBanSendSuccessDebug({
      payoffPending: confirmSendContextRef.current.sendTriggered,
      payoffPhase: confirmSendContextRef.current.payoffPhase,
    });
    setBanSentSuccess(true);
  }, [markSessionBanSendSuccess]);

  const { send, inFlight, sharing } = useSendChallenge({
    token,
    friends: safeFriends,
    onSuccess,
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
      releaseStartupInteractions();
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
    releaseStartupInteractions,
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
  const lastDeepLinkReplyBanIdRef = useRef<string | null>(null);
  const lastDeepLinkActiveBanIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (newBanWhoFlowRequest === 0) return;
    if (lastNewBanWhoFlowRequestRef.current === newBanWhoFlowRequest) return;
    lastNewBanWhoFlowRequestRef.current = newBanWhoFlowRequest;
    beginNewBanWhoFlow();
  }, [newBanWhoFlowRequest, beginNewBanWhoFlow]);

  useLayoutEffect(() => {
    if (!deepLinkRepeatBan?.id || !user?.id) return;
    if (lastDeepLinkRepeatBanIdRef.current === deepLinkRepeatBan.id) return;
    lastDeepLinkRepeatBanIdRef.current = deepLinkRepeatBan.id;
    console.log('[repeat-deeplink]', {
      banId: deepLinkRepeatBan.id,
      action: 'begin-flow',
    });
    const ok = beginRepeatBanFlow(deepLinkRepeatBan, { goToConfirm: true });
    logDeepLinkHandlerResult({
      type: 'repeat',
      banId: deepLinkRepeatBan.id,
      instantBanOpen: sendStarted,
      sendFlowOpen,
      phase: ok ? 'confirming' : 'idle',
      selectedUserId: selectedUser?.userId ?? selectedUser?.id ?? null,
      selectedBanId: deepLinkRepeatBan.id,
      overlayQueueLength,
      ok,
      reason: ok ? null : 'begin-repeat-failed',
    });
    if (ok) clearDeepLinkRepeatBan();
  }, [
    deepLinkRepeatBan,
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
    if (lastDeepLinkReplyBanIdRef.current === deepLinkReplyBan.id) return;
    lastDeepLinkReplyBanIdRef.current = deepLinkReplyBan.id;
    console.log('[reply-deeplink]', {
      banId: deepLinkReplyBan.id,
      action: 'card-reply-begin-what',
    });
    const ok = beginIncomingReplyFromDeepLink(deepLinkReplyBan);
    const opponent = user?.id
      ? opponentForBan(deepLinkReplyBan, user.id)
      : null;
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
    if (ok) clearDeepLinkReplyBan();
  }, [
    deepLinkReplyBan,
    user?.id,
    beginIncomingReplyFromDeepLink,
    clearDeepLinkReplyBan,
    sendStarted,
    sendFlowOpen,
    selectedUser?.id,
    selectedUser?.userId,
    overlayQueueLength,
    setDeepLinkReplyBooting,
  ]);

  useLayoutEffect(() => {
    if (!deepLinkActiveBan?.id || !user?.id) return;
    if (lastDeepLinkActiveBanIdRef.current === deepLinkActiveBan.id) return;
    lastDeepLinkActiveBanIdRef.current = deepLinkActiveBan.id;
    console.log('[active-deeplink]', {
      banId: deepLinkActiveBan.id,
      action: 'begin-flow',
    });
    const ok = beginActiveBanFromDeepLink(deepLinkActiveBan);
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
      reason: ok ? 'bans-overlay' : 'begin-active-failed',
    });
    if (ok) clearDeepLinkActiveBan();
  }, [
    deepLinkActiveBan,
    user?.id,
    beginActiveBanFromDeepLink,
    clearDeepLinkActiveBan,
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

  const executeSend = useCallback(async (): Promise<'started' | 'skipped' | 'rejected'> => {
    const snap = sendSnapshotRef.current;
    if (!snap) {
      instantBanDebug('send-skipped', { reason: 'no-snapshot' });
      return 'rejected';
    }

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
      logSendRejected('no-token');
      setSendError('Не получилось отправить запрет');
      return 'rejected';
    }

    const text = snapText.trim();
    if (text.length < 3) {
      logSendRejected('text-too-short', { textLength: text.length });
      setSendError('Не получилось отправить запрет');
      return 'rejected';
    }

    if (!hasReceiverTarget) {
      logSendRejected('no-receiver');
      setSendError('Не получилось отправить запрет');
      return 'rejected';
    }

    if (isClientDevAuthEnabled() && !sendTarget.receiverUserId) {
      logSendRejected('dev-peer-missing');
      setSendError('Выбери Dev Peer в списке людей');
      return 'rejected';
    }

    if (!banSentSuccess) {
      setSendError(null);
    }
    triggerConfirmHaptic();
    haptic('medium');

    console.info('[98+] sendBan payload', {
      textLength: text.length,
      durationMinutes: snapDuration,
      receiverUserId: sendTarget.receiverUserId,
      receiverTelegramId: sendTarget.receiverTelegramId,
      receiverUsername: receiverUsernameForApi,
      selectedUserId: snapUser.userId ?? snapUser.id ?? null,
    });

    try {
      if (incomingReplyBanId) {
        if (replySending) {
          instantBanDebug('send-skipped', { reason: 'reply-in-flight' });
          return 'skipped';
        }
        setReplySending(true);
        try {
          const res = await api<{
            parentId: string;
            session: SessionState;
          }>(`/bans/${incomingReplyBanId}/reply`, {
            method: 'POST',
            token,
            body: JSON.stringify({
              text,
              durationMinutes: snapDuration,
            }),
          });
          if (res.session) applySession(res.session);
          scheduleDeferredSync();
          clearIncomingReply();
          onSuccess();
          return 'started';
        } finally {
          setReplySending(false);
        }
      }

      const outcome = await send({
        text,
        receiverUsername: receiverUsernameForApi,
        receiverUserId: sendTarget.receiverUserId,
        receiverTelegramId: sendTarget.receiverTelegramId,
        durationMinutes: snapDuration,
      });
      if (outcome === 'skipped') {
        instantBanDebug('send-skipped', { reason: 'hook-in-flight' });
        return 'skipped';
      }
      return 'started';
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Не получилось отправить запрет';
      console.info('[98+] sendBan failed', {
        stage: 'request',
        message,
        error: e instanceof Error ? e.name : typeof e,
        status: (e as { status?: number }).status,
      });
      instantBanSendErrorDebug({ message, error: e });
      setSendError(message);
      return 'rejected';
    }
  }, [
    token,
    haptic,
    safeFriends,
    user?.username,
    user?.id,
    send,
    banSentSuccess,
    incomingReplyBanId,
    replySending,
    applySession,
    scheduleDeferredSync,
    clearIncomingReply,
    onSuccess,
  ]);

  const captureSendSnapshot = useCallback(() => {
    if (!selectedUser) return false;
    sendSnapshotRef.current = {
      banText,
      selectedUser,
      durationMinutes,
    };
    return true;
  }, [banText, selectedUser, durationMinutes]);

  const handleConfirmRelease = useCallback(async () => {
    instantBanDebug('confirm-release', {
      payoffPending: confirmSendContextRef.current.sendTriggered,
    });
    if (!captureSendSnapshot()) {
      confirmAbortReleaseRef.current?.();
      return;
    }

    const outcome = await executeSend();
    if (outcome === 'rejected') {
      instantBanDebug('send-abort-release', { reason: 'send-rejected' });
      confirmAbortReleaseRef.current?.();
    }
  }, [captureSendSnapshot, executeSend]);

  const handleRetrySend = useCallback(async () => {
    if (!captureSendSnapshot()) return;
    await executeSend();
  }, [captureSendSnapshot, executeSend]);

  const lobbyInfluencePercent = useMemo(
    () => Math.min(100, Math.max(0, influencePercent)),
    [influencePercent],
  );

  const { displayPercent: lobbyRingDisplayPercent, isFilling: lobbyRingIntroFilling } =
    useLobbyRingIntroFill(lobbyInfluencePercent, {
      phase,
      sendStarted,
    });

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
  const confirmLayoutActive = orbCompressActive;
  const successSnapshot = sendSnapshotRef.current;

  const confirmOrb = useConfirmOrbController({
    active: confirmActive,
    compressActive: orbCompressActive,
    enterKey: confirmEnterKey,
    influencePercent: lobbyInfluencePercent,
    sending: inFlight || sharing || replySending,
    error: sendError,
    orbWrapRef: lobbyOrbMountRef,
    onConfirm: () => void handleConfirmRelease(),
    onSendContextChange: handleSendContextChange,
    onBindAbortRelease: handleBindAbortRelease,
  });

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
    <div
      className={`lobby-screen instant-ban-arena-send instant-ban-flow${
        whatMobileSafe ? ' instant-ban-flow--what-mobile-safe' : ''
      }${liteMode ? ' instant-ban-debug-lite' : ''}`}
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
      data-bans-overlay-open={bansOverlayOpen ? '' : undefined}
      data-notification-session={notificationSessionActive ? '' : undefined}
      data-debug-slow-orb={process.env.NODE_ENV === 'development' ? '' : undefined}
    >
      {showLobbyTopNav ? (
        <ArenaLobbyTopNav
          onOpenBans={handleOpenBansOverlay}
          bansNeedAttention={pendingStartupInteractions}
        />
      ) : null}
      <div className="lobby-screen__grid" aria-hidden />
      <div className="lobby-screen__particles" aria-hidden>
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className="lobby-screen__particle" />
        ))}
      </div>

      <div className="instant-ban-arena-send__stage">
        <div
          ref={lobbyOrbMountRef}
          className={`lobby-screen__orb-wrap lobby-screen__orb-root${
            confirmLayoutActive ? ' lobby-screen__orb-wrap--confirm' : ''
          }${orbOverlayDim ? ' lobby-screen__orb-wrap--overlay-dim' : ''}`}
          data-orb-root
        >
          <ArenaLobbyOrb
            sendPhase={phase}
            confirmActive={confirmActive}
            orbCompressActive={orbCompressActive}
            confirmOrb={confirmOrb}
            lobbyRingDisplayPercent={lobbyRingDisplayPercent}
            lobbyRingIntroFilling={lobbyRingIntroFilling}
            senderUser={user}
            selectedUser={selectedUser}
            banText={banText}
            durationMinutes={durationMinutes}
          />
        </div>

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
                  sendError ? ' instant-ban-status--error' : ''
                }`}
              >
                {confirmOrb.statusLabel}
              </p>
              {sendError ? (
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

      {showLobbyCta && !bansOverlayOpen && !notificationQueueUiLock ? (
        <ArenaLobbyIdle
          influencePercent={lobbyInfluencePercent}
          energyLoaded={energyLoaded}
          lobbyRingIntroFilling={lobbyRingIntroFilling}
          ctaState={ctaState}
          ctaInteractive={ctaInteractive}
          lowInfluenceRevealed={lowInfluenceRevealed}
          onLowInfluenceRevealedChange={setLowInfluenceRevealed}
          lowEnergyBlockedSignal={lowEnergyBlockedSignal}
          onBeginSend={handleBeginSend}
          onLowEnergyAsk={handleLowEnergyAsk}
        />
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
              isHistory={bansTab === 'history' || bansTab === 'archive'}
              saved={savedBanIds.has(selectedBanForDetails.id)}
              onBack={() => setSelectedBanForDetails(null)}
              onBanMore={() => handleBanMore(selectedBanForDetails)}
              onShare={() => handleBanShare(selectedBanForDetails)}
              onToggleSave={() => handleToggleSave(selectedBanForDetails)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
