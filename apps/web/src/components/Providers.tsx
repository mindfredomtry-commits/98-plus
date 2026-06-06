'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
} from 'react';
import type {
  EnergyPopup,
  BanInteraction,
  BanResult,
  SessionState,
  FriendCard,
  ResultOpenMode,
} from '@98plus/shared';
import { isValidBanResultPayload } from '@98plus/shared';
import {
  ANALYTICS_EVENTS,
  coerceFriendList,
  formatSenderDisplayName,
} from '@98plus/shared';
import { useAuth } from '@/hooks/useAuth';
import { useTelegram } from '@/hooks/useTelegram';
import { isUserDataScoped } from '@/lib/user-data-scope';
import { explainIncomingHidden, logIncomingDebug } from '@/lib/incoming-debug';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useIncomingPoll } from '@/hooks/useIncomingPoll';
import { EnergyPopupStack } from './EnergyPopupStack';
import { IncomingBanOverlay } from './IncomingBanOverlay';
import { CheckOverlay } from './CheckOverlay';
import { ResultOverlay } from './ResultOverlay';
import { GlobalOverlayHost } from './GlobalOverlayHost';
import {
  enqueueOverlay,
  mergeOverlayQueues,
  overlayQueueKey,
  popOverlayHead,
  prependOverlay,
  pruneOverlayQueue,
  removeOverlaysForBan,
  type QueuedOverlay,
} from '@/lib/overlay-queue';
import { ChallengeErrorBoundary } from './ChallengeErrorBoundary';
import { ShellErrorBoundary } from './ShellErrorBoundary';
import { resetScrollLock } from '@/lib/scroll-lock';
import { fetchSession } from '@/lib/session';
import { api } from '@/lib/api';
import { challengeLog } from '@/lib/challenge-log';
import {
  incomingShowDecision,
  isValidIncomingOverlayPayload,
  shouldShowIncomingBanModal,
} from '@/lib/incoming-challenge';
import { acknowledgeIncomingFully } from '@/lib/incoming-ack-flow';
import {
  type OptimisticSendWait,
  CHECK_WAITING_UI_TTL_MS,
  createOptimisticSendWait,
  isOptimisticSendWaitActive,
  mergeActiveBansWithOptimistic,
  mergeFriendsWithOptimistic,
  normalizeWaitUsername,
} from '@/lib/waiting-lifecycle';
import { isFirstBanComplete, markFirstBanComplete } from '@/lib/first-ban';
import { writeFriendsCache, readFriendsCache } from '@/lib/friends-cache';
import { readHomeSnapshot, writeHomeSnapshot } from '@/lib/home-snapshot';
import { enrichBanInteraction } from '@/lib/user-public-avatar';
import { mergeFriendsPreservingAvatars } from '@/lib/friend-avatar-merge';
import {
  preloadFriendAvatars,
  setAvatarPreloadCompleteListener,
} from '@/lib/avatar-preload';
import { markAvatarStartup } from '@/lib/avatar-startup-diag';
import { preloadAvatarUrls } from '@/lib/avatar-url';
import { afterKeyboardCollapse, blurActiveInputs } from '@/lib/keyboard-dismiss';
import {
  clearAvatarCaches,
  rememberFriendAvatar,
  rememberUserAvatar,
} from '@/lib/avatar-cache';
import { backfillAcknowledgedIncomingOnce } from '@/lib/incoming-backfill';
import {
  hydrateAnsweredCheckIds,
  markCheckAnsweredLocally,
} from '@/lib/answered-checks';
import {
  checkShowDecision,
  pickCheckForOverlay,
  shouldShowCheckOverlay,
} from '@/lib/check-overlay';
import { useCheckPoll } from '@/hooks/useCheckPoll';
import { getCheckViewerRole } from '@98plus/shared';
import { timingLog, timingStart } from '@/lib/timing-log';
import { logFriendsTiming } from '@/lib/boot-timing';
import {
  acknowledgeBanResultOnServer,
  diagnoseResultShow,
  dismissBanResultLocally,
  shouldShowBanResult,
} from '@/lib/ban-result-flow';
import {
  logResultLatency,
  resultElapsedSinceSubmit,
  resultParticipantRole,
} from '@/lib/result-latency-diag';
import { isDismissedResultLocally } from '@/lib/dismissed-results';
import {
  resolveConnectionUiState,
  STARTUP_GRACE_MS,
  type ConnectionUiState,
} from '@/lib/connection-ui';

interface AppContextValue {
  token: string | null;
  user: ReturnType<typeof useAuth>['user'];
  loading: boolean;
  /** True when Telegram user matches backend /users/me. */
  authReady: boolean;
  /** True when friends/session state belongs to current auth user. */
  isAppReady: boolean;
  /** Initial /friends fetch finished (or cache hydrated). */
  friendsReady: boolean;
  /** HomeArena can render from local snapshot without waiting network. */
  homeSnapshotReady: boolean;
  /** First session fetch finished — incoming gate can resolve. */
  sessionReady: boolean;
  /** Incoming modal blocks main arena until dismissed. */
  incomingGateActive: boolean;
  error: string | null;
  refreshUser: () => Promise<void>;
  onboard: () => Promise<void>;
  incomingBan: BanInteraction | null;
  setIncomingBan: (b: BanInteraction | null) => void;
  dismissIncoming: (banId?: string) => void;
  acknowledgeIncomingAndStartReply: (ban: BanInteraction) => Promise<void>;
  acknowledgeIncomingSeen: (banId: string) => Promise<void>;
  checkBan: BanInteraction | null;
  checkGateActive: boolean;
  setCheckBan: (b: BanInteraction | null) => void;
  submitCheckAnswer: (
    banId: string,
    completed: boolean,
  ) => Promise<{ ok: boolean; error?: string }>;
  checkWaiting: boolean;
  setCheckWaiting: (v: boolean) => void;
  result: BanResult | null;
  openBanResult: (r: BanResult | null | undefined, mode: ResultOpenMode) => void;
  dismissBanResult: () => void;
  popups: EnergyPopup[];
  pushPopup: (p: EnergyPopup) => void;
  activeBans: BanInteraction[];
  friends: FriendCard[];
  sendOpen: boolean;
  setSendOpen: (v: boolean) => void;
  sendReceiver: string;
  setSendReceiver: (v: string) => void;
  sendText: string;
  setSendText: (v: string) => void;
  sendDuration: number;
  setSendDuration: (v: number) => void;
  openSendTo: (receiver: string, text?: string) => void;
  /** Opens send sheet to reply to a pending incoming ban (uses /reply API). */
  startIncomingReply: (ban: BanInteraction) => void;
  incomingReplyBanId: string | null;
  clearIncomingReply: () => void;
  applySession: (s: SessionState) => void;
  reloadPending: () => Promise<void>;
  reloadFriends: () => Promise<void>;
  wsStatus: ReturnType<typeof useWebSocket>['status'];
  connectionUiState: ConnectionUiState;
  networkBootstrapCompleted: boolean;
  hasSuccessfulNetworkSync: boolean;
  eventLog: string[];
  viralOnboarding: boolean;
  banSentOpen: boolean;
  setBanSentOpen: (v: boolean) => void;
  /** Blur keyboard, clear ban text, then open success modal after viewport settles. */
  completeBanSendSuccess: () => void;
  /** Queue session/friends refresh until success modal closes. */
  scheduleDeferredSync: () => void;
  optimisticSendWait: OptimisticSendWait | null;
  applyOptimisticSend: (params: {
    username: string;
    firstName?: string;
    banText: string;
    durationMinutes: number;
  }) => void;
  confirmOptimisticSend: (username: string) => void;
  rollbackOptimisticSend: (params: {
    username: string;
    message: string;
  }) => void;
  clearCheckOverlay: () => void;
  showFirstBanOnboarding: boolean;
  completeFirstBan: () => void;
  inlineBanError: string | null;
  setInlineBanError: (msg: string | null) => void;
  banInputShake: boolean;
  triggerBanInputShake: () => void;
  /** Ritual entry gate — blocks challenge overlays until dismissed. */
  lobbyOpen: boolean;
  closeLobby: () => void;
  /** Opens InstantBan Who screen for a new ban (increments on each request). */
  newBanWhoFlowRequest: number;
  openNewBanWhoFlow: () => void;
  /** Accumulated pre-open interactions waiting for ritual release. */
  pendingStartupInteractions: boolean;
  /** Release queued startup interactions (e.g. after opening «Твои запреты»). */
  releaseStartupInteractions: (opts?: { requireBanSend?: boolean }) => void;
  /** Mark first successful ban send in this session (InstantBan success path). */
  markSessionBanSendSuccess: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside Providers');
  return ctx;
}

function pickIncomingForOverlay(
  ban: BanInteraction | null | undefined,
  dismissed: Set<string>,
  viewerId: string | null | undefined,
): BanInteraction | null {
  if (!shouldShowIncomingBanModal(ban, viewerId, dismissed)) return null;
  return enrichBanInteraction(ban!);
}

function enrichSessionState(s: SessionState): SessionState {
  return {
    ...s,
    incoming: s.incoming ? enrichBanInteraction(s.incoming) : s.incoming,
    check: s.check ? enrichBanInteraction(s.check) : s.check,
    active: Array.isArray(s.active)
      ? s.active.map((b) => enrichBanInteraction(b))
      : [],
  };
}

function applySessionToState(
  s: SessionState,
  setters: {
    setActiveBans: (b: BanInteraction[]) => void;
    setCheckWaiting: (v: boolean) => void;
  },
) {
  const session = enrichSessionState(s);
  setters.setActiveBans(Array.isArray(session.active) ? session.active : []);
  if (!session.needsOnboardingRecovery) {
    setters.setCheckWaiting(false);
  }
}

/** Hard remount on Telegram account switch — wipes in-memory friends/session. */
export function Providers({ children }: { children: React.ReactNode }) {
  const { telegramId } = useTelegram();

  const scopeKey = telegramId != null ? `tg:${telegramId}` : 'tg:pending';
  console.log('[boot]', { phase: 'providers-mount', scopeKey, telegramId });

  return <ProvidersBody key={scopeKey}>{children}</ProvidersBody>;
}

function ProvidersBody({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  console.log('[providers-render]', {
    userId: auth.user?.id ?? null,
    authReady: auth.authReady,
    loading: auth.loading,
  });
  const [dataOwnerUserId, setDataOwnerUserId] = useState<string | null>(null);
  const [incomingBan, setIncomingBan] = useState<BanInteraction | null>(null);
  const [checkBan, setCheckBan] = useState<BanInteraction | null>(null);
  const [checkWaiting, setCheckWaiting] = useState(false);
  const [result, setResult] = useState<BanResult | null>(null);
  const [overlayQueue, setOverlayQueue] = useState<QueuedOverlay[]>([]);
  const overlayQueueRef = useRef<QueuedOverlay[]>([]);
  const pendingStartupInteractionsRef = useRef<QueuedOverlay[]>([]);
  const startupInteractionsHoldRef = useRef(true);
  const sessionBanSendSuccessRef = useRef(false);
  const [pendingStartupInteractionsCount, setPendingStartupInteractionsCount] =
    useState(0);

  const [popups, setPopups] = useState<EnergyPopup[]>([]);
  const [activeBans, setActiveBans] = useState<BanInteraction[]>([]);
  // Isolation: until auth.user is confirmed, never show cached friends from another Telegram user.
  const [friends, setFriends] = useState<FriendCard[]>([]);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendReceiver, setSendReceiver] = useState('');
  const [sendText, setSendText] = useState('');
  const [sendDuration, setSendDuration] = useState(10);
  const [incomingReplyBanId, setIncomingReplyBanId] = useState<string | null>(
    null,
  );
  const [viralOnboarding, setViralOnboarding] = useState(false);
  const [banSentOpen, setBanSentOpenRaw] = useState(false);
  const [uiFreeze, setUiFreeze] = useState<{
    friends: FriendCard[];
    activeBans: BanInteraction[];
    optimisticSendWait: OptimisticSendWait | null;
  } | null>(null);
  const [optimisticSendWait, setOptimisticSendWait] =
    useState<OptimisticSendWait | null>(null);
  const [firstBanComplete, setFirstBanComplete] = useState(false);
  const [inlineBanError, setInlineBanError] = useState<string | null>(null);
  const [banInputShake, setBanInputShake] = useState(false);
  const [friendsBootstrapped, setFriendsBootstrapped] = useState(false);
  const [sessionBootstrapped, setSessionBootstrapped] = useState(false);
  const [homeSnapshotReady, setHomeSnapshotReady] = useState(false);
  const [lobbyOpen, setLobbyOpen] = useState(true);
  const lobbyShownLoggedRef = useRef(false);
  const [, setAvatarPreloadEpoch] = useState(0);
  const [startupGraceActive, setStartupGraceActive] = useState(true);
  const [networkBootstrapCompleted, setNetworkBootstrapCompleted] =
    useState(false);
  const [hasSuccessfulNetworkSync, setHasSuccessfulNetworkSync] =
    useState(false);
  const [initialNetworkBootstrapAttempted, setInitialNetworkBootstrapAttempted] =
    useState(false);
  const [wsHasConnectedOnce, setWsHasConnectedOnce] = useState(false);
  const [navigatorOffline, setNavigatorOffline] = useState(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  const triggerBanInputShake = useCallback(() => {
    setBanInputShake(true);
    window.setTimeout(() => setBanInputShake(false), 500);
  }, []);

  const dismissedIncomingRef = useRef<Set<string>>(new Set());
  const dismissedCheckSessionRef = useRef<Set<string>>(new Set());
  const answeredCheckRef = useRef<Set<string>>(new Set());
  const checkAnswerInFlightRef = useRef<Set<string>>(new Set());
  const resultOpenRef = useRef(false);
  const bufferedIncomingRef = useRef<BanInteraction | null>(null);
  const incomingWsSeenRef = useRef<Set<string>>(new Set());
  const incomingBanRef = useRef<BanInteraction | null>(null);
  const checkBanRef = useRef<BanInteraction | null>(null);
  const checkWsSeenRef = useRef<Set<string>>(new Set());
  const resultDeliveredBanIdsRef = useRef<Set<string>>(new Set());
  const checkSubmitAtRef = useRef<Map<string, number>>(new Map());
  const resultPollBurstTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const syncPendingStartupCount = useCallback(() => {
    setPendingStartupInteractionsCount(
      pendingStartupInteractionsRef.current.length,
    );
  }, []);

  const isOverlayLive = useCallback(
    (opts?: { live?: boolean; source?: 'ws' | 'session' | 'poll' }) => {
      if (opts?.live === true) return true;
      if (opts?.source === 'ws') return true;
      if (
        opts?.source === 'poll' &&
        !startupInteractionsHoldRef.current
      ) {
        return true;
      }
      return false;
    },
    [],
  );

  const syncDisplayFromQueue = useCallback((queue: QueuedOverlay[]) => {
    const active = queue[0] ?? null;
    setIncomingBan(active?.kind === 'incoming' ? active.ban : null);
    setCheckBan(active?.kind === 'check' ? active.ban : null);
    if (active?.kind === 'result') {
      resultOpenRef.current = true;
      setResult(active.result);
    } else {
      resultOpenRef.current = false;
      setResult(null);
    }
    if (active?.kind === 'incoming') {
      console.log('INCOMING QUEUE ACTIVE', { banId: active.ban.id });
    } else if (queue.some((q) => q.kind === 'incoming')) {
      console.log('INCOMING QUEUE ACTIVE', {
        banId: null,
        reason: 'incoming-queued-not-head',
        headKind: active?.kind ?? null,
      });
    }
  }, []);

  const applyOverlayQueue = useCallback(
    (next: QueuedOverlay[]) => {
      const prevHead = overlayQueueRef.current[0] ?? null;
      const nextHead = next[0] ?? null;
      const prevKey = prevHead ? overlayQueueKey(prevHead) : null;
      const nextKey = nextHead ? overlayQueueKey(nextHead) : null;
      if (prevKey !== nextKey) {
        console.log('[OVERLAY QUEUE NEXT]', {
          prevKey,
          nextKey,
          queueLength: next.length,
          nextKind: nextHead?.kind ?? null,
        });
      }
      overlayQueueRef.current = next;
      syncDisplayFromQueue(next);
      setOverlayQueue(next);
    },
    [syncDisplayFromQueue],
  );

  const releaseStartupInteractions = useCallback(
    (opts?: { requireBanSend?: boolean }) => {
      if (opts?.requireBanSend && !sessionBanSendSuccessRef.current) {
        return;
      }
      const pending = pendingStartupInteractionsRef.current;
      const hadHold = startupInteractionsHoldRef.current;
      startupInteractionsHoldRef.current = false;
      pendingStartupInteractionsRef.current = [];
      syncPendingStartupCount();

      if (!hadHold && pending.length === 0) return;

      console.log('[startup-interactions-release]', {
        count: pending.length,
        requireBanSend: opts?.requireBanSend ?? false,
      });

      if (pending.length === 0) return;

      applyOverlayQueue(
        mergeOverlayQueues(overlayQueueRef.current, pending),
      );
    },
    [applyOverlayQueue, syncPendingStartupCount],
  );

  const markSessionBanSendSuccess = useCallback(() => {
    sessionBanSendSuccessRef.current = true;
  }, []);

  const enqueueNotification = useCallback(
    (
      item: QueuedOverlay,
      opts?: { live?: boolean; source?: 'ws' | 'session' | 'poll' },
    ) => {
      const live = isOverlayLive(opts);

      if (startupInteractionsHoldRef.current && !live) {
        const prevPending = pendingStartupInteractionsRef.current;
        const nextPending = enqueueOverlay(prevPending, item);
        if (nextPending === prevPending) {
          if (item.kind === 'incoming') {
            console.log('INCOMING QUEUE PUSH', {
              banId: item.ban.id,
              skipped: true,
              reason: 'startup-pending-dedup',
              source: opts?.source ?? null,
            });
          }
          return;
        }
        pendingStartupInteractionsRef.current = nextPending;
        syncPendingStartupCount();
        if (item.kind === 'incoming') {
          console.log('INCOMING QUEUE PUSH', {
            banId: item.ban.id,
            skipped: false,
            reason: 'startup-pending',
            source: opts?.source ?? null,
          });
        }
        return;
      }

      const prev = overlayQueueRef.current;
      const next =
        live && (item.kind === 'incoming' || item.kind === 'check')
          ? prependOverlay(prev, item)
          : enqueueOverlay(prev, item);

      if (next === prev) {
        if (item.kind === 'incoming') {
          console.log('INCOMING QUEUE PUSH', {
            banId: item.ban.id,
            skipped: true,
            reason: 'dedup',
            source: opts?.source ?? null,
            queueKeys: prev.map(overlayQueueKey),
          });
        }
        return;
      }

      if (item.kind === 'incoming') {
        console.log('INCOMING QUEUE PUSH', {
          banId: item.ban.id,
          skipped: false,
          reason: 'enqueued',
          source: opts?.source ?? null,
          live,
        });
      }

      applyOverlayQueue(next);
    },
    [applyOverlayQueue, isOverlayLive, syncPendingStartupCount],
  );

  const openBanResult = useCallback(
    (r: BanResult | null | undefined, mode: ResultOpenMode) => {
      if (!r) {
        applyOverlayQueue([]);
        return;
      }
      if (resultDeliveredBanIdsRef.current.has(r.id)) {
        return;
      }
      if (!shouldShowBanResult(r, mode, r.id, userIdRef.current)) {
        challengeLog('result:reject-open', {
          banId: r.id,
          outcome: r.outcome,
          mode,
          reason: diagnoseResultShow(r, mode, userIdRef.current, r.id).reason,
        });
        console.log('[result-dismiss-local]', {
          banId: r.id,
          authUserId: r.viewerId ?? userIdRef.current,
        });
        dismissBanResultLocally(r.id, r.viewerId ?? null);
        void acknowledgeBanResultOnServer(r.id, tokenRef.current);
        return;
      }
      resultDeliveredBanIdsRef.current.add(r.id);

      const resultItem: QueuedOverlay = { kind: 'result', result: r };
      if (
        startupInteractionsHoldRef.current &&
        mode !== 'explicit' &&
        mode !== 'live'
      ) {
        const prevPending = pendingStartupInteractionsRef.current;
        const nextPending = enqueueOverlay(prevPending, resultItem);
        if (nextPending !== prevPending) {
          pendingStartupInteractionsRef.current = nextPending;
          syncPendingStartupCount();
          console.log('[result-startup-pending]', { banId: r.id, mode });
        }
        return;
      }

      applyOverlayQueue(
        enqueueOverlay(overlayQueueRef.current, resultItem),
      );
    },
    [applyOverlayQueue, syncPendingStartupCount],
  );

  const dismissBanResult = useCallback(() => {
    const head = overlayQueueRef.current[0];
    const banId =
      head?.kind === 'result'
        ? head.result.id
        : (result?.id ?? null);
    const viewerId =
      head?.kind === 'result'
        ? (head.result.viewerId ?? userIdRef.current)
        : (result?.viewerId ?? userIdRef.current);
    if (banId) {
      console.log('[result-dismiss-local]', {
        banId,
        authUserId: viewerId,
      });
      dismissBanResultLocally(banId, viewerId ?? null);
      void acknowledgeBanResultOnServer(banId, tokenRef.current);
    }
    applyOverlayQueue(popOverlayHead(overlayQueueRef.current));
  }, [applyOverlayQueue, result]);

  const pruneAndSyncOverlayQueue = useCallback(() => {
    const viewerId = userIdRef.current;
    const next = pruneOverlayQueue(overlayQueueRef.current, {
      viewerId,
      dismissedIncoming: dismissedIncomingRef.current,
      dismissedCheck: dismissedCheckSessionRef.current,
      answeredChecks: answeredCheckRef.current,
      checkInFlight: checkAnswerInFlightRef.current,
    });
    applyOverlayQueue(next);
  }, [applyOverlayQueue]);

  useEffect(() => {
    incomingBanRef.current = incomingBan;
  }, [incomingBan]);
  useEffect(() => {
    checkBanRef.current = checkBan;
  }, [checkBan]);
  const banSentOpenRef = useRef(false);
  const deferredSyncRef = useRef(false);

  useEffect(() => {
    const uid = auth.user?.id ?? null;
    dismissedIncomingRef.current = new Set();
    dismissedCheckSessionRef.current = new Set();
    answeredCheckRef.current = new Set();
    checkAnswerInFlightRef.current = new Set();
    resultDeliveredBanIdsRef.current = new Set();
    checkSubmitAtRef.current = new Map();
    if (!uid || auth.loading) return;
    for (const id of hydrateAnsweredCheckIds(uid)) {
      answeredCheckRef.current.add(id);
    }
  }, [auth.user?.id, auth.loading]);

  const checkWaitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(auth.token);
  tokenRef.current = auth.token;
  const userIdRef = useRef<string | null>(auth.user?.id ?? null);
  userIdRef.current = auth.user?.id ?? null;
  const refreshUserRef = useRef(auth.refreshUser);
  refreshUserRef.current = auth.refreshUser;
  const reloadFriendsRef = useRef<() => Promise<void>>(async () => {});
  const friendsRef = useRef<FriendCard[]>([]);
  const friendsBootstrappedRef = useRef(false);

  useEffect(() => {
    friendsRef.current = friends;
    friendsBootstrappedRef.current = friendsBootstrapped;
  }, [friends, friendsBootstrapped]);

  /** Owner is confirmed auth user — friends may load later (empty until fetch). */
  useEffect(() => {
    if (!auth.user?.id || auth.loading) {
      setDataOwnerUserId(null);
      return;
    }
    setDataOwnerUserId(auth.user.id);
  }, [auth.user?.id, auth.loading]);

  /** Sync reset before paint when backend user id changes (no flash of previous user's data). */
  useLayoutEffect(() => {
    console.log('[providers-reset]', { userId: auth.user?.id ?? null });
    clearAvatarCaches();
    setDataOwnerUserId(null);
    setHomeSnapshotReady(false);
    setStartupGraceActive(true);
    setNetworkBootstrapCompleted(false);
    setHasSuccessfulNetworkSync(false);
    setInitialNetworkBootstrapAttempted(false);
    setWsHasConnectedOnce(false);
    setIncomingBan(null);
    setCheckBan(null);
    setCheckWaiting(false);
    setResult(null);
    setOverlayQueue([]);
    overlayQueueRef.current = [];
    pendingStartupInteractionsRef.current = [];
    startupInteractionsHoldRef.current = true;
    sessionBanSendSuccessRef.current = false;
    setPendingStartupInteractionsCount(0);
    setPopups([]);
    setActiveBans([]);
    setFriends([]);
    setFriendsBootstrapped(false);
    setSessionBootstrapped(false);
    setSendOpen(false);
    setSendReceiver('');
    setSendText('');
    setIncomingReplyBanId(null);
    setViralOnboarding(false);
    setBanSentOpen(false);
    setOptimisticSendWait(null);
    dismissedIncomingRef.current = new Set();
    dismissedCheckSessionRef.current = new Set();
    answeredCheckRef.current = new Set();
    checkAnswerInFlightRef.current = new Set();
    resultDeliveredBanIdsRef.current = new Set();
    checkSubmitAtRef.current = new Map();

    const uid = auth.user?.id;
    if (!uid) return;

    for (const id of hydrateAnsweredCheckIds(uid)) {
      answeredCheckRef.current.add(id);
    }

    const snapshot = readHomeSnapshot(uid);
    if (snapshot) {
      const hydratedFriends = coerceFriendList(snapshot.friends);
      for (const f of hydratedFriends) {
        rememberFriendAvatar(f.id, f.userId, f.avatarUrl ?? f.photoUrl);
      }
      friendsRef.current = hydratedFriends;
      setFriends(hydratedFriends);
      setSendDuration(snapshot.sendDuration);
      if (snapshot.sendReceiver) {
        setSendReceiver(snapshot.sendReceiver);
      }
      setFriendsBootstrapped(true);
      setSessionBootstrapped(true);
      setHomeSnapshotReady(true);
      setDataOwnerUserId(uid);
      logFriendsTiming('home-snapshot-hydrated', {
        userId: uid,
        count: hydratedFriends.length,
        savedAt: snapshot.savedAt,
      });
      void preloadFriendAvatars(hydratedFriends, { timeoutMs: 2000 });
      const cachedCheck = snapshot.checkBan
        ? enrichBanInteraction(snapshot.checkBan)
        : null;
      if (
        cachedCheck &&
        shouldShowCheckOverlay(
          cachedCheck,
          uid,
          dismissedCheckSessionRef.current,
          answeredCheckRef.current,
          checkAnswerInFlightRef.current,
          resultOpenRef.current,
        )
      ) {
        enqueueNotification(
          { kind: 'check', ban: cachedCheck },
          { source: 'session' },
        );
        console.log('[check-overlay]', {
          event: 'snapshot-hydrated',
          banId: cachedCheck.id,
        });
      }
      return;
    }

    const cached = readFriendsCache(uid);
    for (const f of cached) {
      rememberFriendAvatar(f.id, f.userId, f.avatarUrl ?? f.photoUrl);
    }
    if (cached.length > 0) {
      friendsRef.current = cached;
      setFriends(cached);
      setFriendsBootstrapped(true);
      setHomeSnapshotReady(true);
      setDataOwnerUserId(uid);
      logFriendsTiming('cache-hydrated-memory', {
        userId: uid,
        count: cached.length,
      });
      markAvatarStartup();
      preloadAvatarUrls(cached.map((f) => f.avatarUrl ?? f.photoUrl));
      void preloadFriendAvatars(cached, { timeoutMs: 2000, via: 'friends-cache' });
    }
  }, [auth.user?.id]);

  useEffect(() => {
    setAvatarPreloadCompleteListener(() => {
      setAvatarPreloadEpoch((n) => n + 1);
    });
    return () => setAvatarPreloadCompleteListener(null);
  }, []);

  useEffect(() => {
    if (auth.authReady && auth.user?.id) markAvatarStartup();
  }, [auth.authReady, auth.user?.id]);

  const clearCheckOverlay = useCallback(() => {
    if (checkWaitingTimerRef.current) {
      clearTimeout(checkWaitingTimerRef.current);
      checkWaitingTimerRef.current = null;
    }
    setCheckWaiting(false);
    const prev = overlayQueueRef.current;
    const next =
      prev[0]?.kind === 'check'
        ? popOverlayHead(prev)
        : prev.filter((q) => q.kind !== 'check');
    applyOverlayQueue(next);
  }, [applyOverlayQueue]);

  const cancelResultPollBurst = useCallback(() => {
    for (const t of resultPollBurstTimersRef.current) {
      clearTimeout(t);
    }
    resultPollBurstTimersRef.current = [];
  }, []);

  const receiveResult = useCallback(
    (
      payload: BanResult | null | undefined,
      source: 'ws' | 'http' | 'poll',
    ) => {
      const banId = payload?.id ?? null;
      const uid = userIdRef.current;
      if (!banId || !payload) return;

      const role = resultParticipantRole(uid, payload);
      const elapsedMs = resultElapsedSinceSubmit(
        banId,
        checkSubmitAtRef.current,
      );

      if (resultDeliveredBanIdsRef.current.has(banId)) {
        logResultLatency('[result-skip-duplicate]', {
          banId,
          authUserId: uid,
          role,
          source,
          elapsedMs,
        });
        return;
      }

      const mode = source === 'poll' ? 'auto' : 'live';
      const decision = diagnoseResultShow(payload, mode, uid, banId);

      if (!decision.shouldShow) {
        logResultLatency('[result-show-decision]', {
          banId,
          authUserId: uid,
          role,
          source,
          elapsedMs,
          shouldShow: false,
          reason: decision.reason,
        });
        dismissBanResultLocally(banId, payload.viewerId ?? uid);
        void acknowledgeBanResultOnServer(banId, tokenRef.current);
        return;
      }

      logResultLatency('[result-open-immediate]', {
        banId,
        authUserId: uid,
        role,
        source,
        elapsedMs,
      });
      openBanResult(payload, mode);

      logResultLatency('[result-show-decision]', {
        banId,
        authUserId: uid,
        role,
        source,
        elapsedMs,
        shouldShow: true,
        reason: decision.reason,
      });
    },
    [openBanResult],
  );

  const pollPendingResultOnce = useCallback(
    async (source: 'interval' | 'burst') => {
      const requestUserId = userIdRef.current;
      const requestToken = tokenRef.current;
      if (!requestUserId || !requestToken) return;
      if (resultOpenRef.current) return;

      try {
        const { result: pendingResult } = await api<{ result: BanResult | null }>(
          '/bans/result/pending',
          { token: requestToken, retries: 0 },
        );
        if (!pendingResult?.id) return;
        if (resultDeliveredBanIdsRef.current.has(pendingResult.id)) return;

        const submitAt = checkSubmitAtRef.current.get(pendingResult.id);
        const elapsedClientMs =
          submitAt != null
            ? Math.round(performance.now() - submitAt)
            : undefined;

        const role = resultParticipantRole(requestUserId, pendingResult);
        if (source === 'burst') {
          logResultLatency('[result-poll-burst]', {
            banId: pendingResult.id,
            authUserId: requestUserId,
            role,
            source: 'poll',
            elapsedMs: elapsedClientMs,
          });
        } else {
          logResultLatency('[result-poll-hit]', {
            banId: pendingResult.id,
            authUserId: requestUserId,
            role,
            source: 'poll',
            elapsedMs: elapsedClientMs,
          });
        }
        receiveResult(pendingResult, 'poll');
      } catch {
        /* fallback only */
      }
    },
    [receiveResult],
  );

  const scheduleResultPollBurst = useCallback(() => {
    cancelResultPollBurst();
    const uid = userIdRef.current;
    for (const [banId] of checkSubmitAtRef.current) {
      logResultLatency('[result-poll-burst-scheduled]', {
        banId,
        authUserId: uid,
        role: resultParticipantRole(uid, checkBanRef.current),
        delaysMs: [0, 200, 500, 900],
      });
    }
    for (const ms of [0, 200, 500, 900]) {
      const t = window.setTimeout(
        () => void pollPendingResultOnce('burst'),
        ms,
      );
      resultPollBurstTimersRef.current.push(t);
    }
  }, [cancelResultPollBurst, pollPendingResultOnce]);

  useEffect(() => () => cancelResultPollBurst(), [cancelResultPollBurst]);

  const setCheckBanSafe = useCallback(
    (b: BanInteraction | null) => {
      const viewerId = auth.user?.id ?? null;
      if (b !== null) {
        if (
          !shouldShowCheckOverlay(
            b,
            viewerId,
            dismissedCheckSessionRef.current,
            answeredCheckRef.current,
            checkAnswerInFlightRef.current,
            resultOpenRef.current,
          )
        ) {
          console.log('[check-overlay]', {
            event: 'reject-set',
            banId: b.id,
            authUserId: viewerId,
          });
          return;
        }
        challengeLog('check:set', { id: b.id, status: b.status });
        enqueueNotification({
          kind: 'check',
          ban: enrichBanInteraction(b),
        });
        return;
      }
      applyOverlayQueue(
        overlayQueueRef.current.filter((q) => q.kind !== 'check'),
      );
    },
    [auth.user?.id, applyOverlayQueue, enqueueNotification],
  );

  const submitCheckAnswer = useCallback(
    async (banId: string, completed: boolean) => {
      const uid = userIdRef.current;
      const token = tokenRef.current;
      if (!uid || !token) {
        return { ok: false, error: 'Нет авторизации' };
      }

      dismissedCheckSessionRef.current.add(banId);
      answeredCheckRef.current.add(banId);
      markCheckAnsweredLocally(uid, banId);
      checkAnswerInFlightRef.current.add(banId);
      const t0 = performance.now();
      checkSubmitAtRef.current.set(banId, t0);
      const role = resultParticipantRole(uid, checkBanRef.current);
      logResultLatency('[result-click-answer]', {
        banId,
        authUserId: uid,
        role,
        elapsedMs: 0,
      });
      applyOverlayQueue(
        removeOverlaysForBan(overlayQueueRef.current, banId, ['check']),
      );
      setCheckWaiting(false);

      try {
        logResultLatency('[result-http-start]', {
          banId,
          authUserId: uid,
          role,
          elapsedMs: Math.round(performance.now() - t0),
        });
        const res = await api<{
          done: boolean;
          waiting?: boolean;
          result?: BanResult;
        }>(`/bans/${banId}/check`, {
          method: 'POST',
          token,
          body: JSON.stringify({ completed }),
          retries: 0,
        });

        const elapsedMs = Math.round(performance.now() - t0);
        logResultLatency('[result-http-response]', {
          banId,
          authUserId: uid,
          role,
          source: 'http',
          elapsedMs,
          done: res.done,
          waiting: !!res.waiting,
          hasResult: !!res.result,
        });

        if (res.done && res.result) {
          challengeLog('check:done', { banId });
          receiveResult(res.result, 'http');
          queueMicrotask(() => {
            setOverlayQueue((prev) =>
              removeOverlaysForBan(prev, banId, ['check', 'incoming']),
            );
            void refreshUserRef.current().catch(() => {});
          });
        } else if (res.waiting) {
          challengeLog('check:waiting-partner', { banId });
          scheduleResultPollBurst();
        } else if (res.done) {
          scheduleResultPollBurst();
        }

        return { ok: true };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Ошибка отправки';
        challengeLog('check:submit-failed', { banId, message });
        return { ok: false, error: message };
      } finally {
        checkAnswerInFlightRef.current.delete(banId);
      }
    },
    [applyOverlayQueue, receiveResult, scheduleResultPollBurst],
  );

  const scheduleCheckWaitingDismiss = useCallback(() => {
    if (checkWaitingTimerRef.current) {
      clearTimeout(checkWaitingTimerRef.current);
    }
    checkWaitingTimerRef.current = setTimeout(() => {
      challengeLog('check-waiting:expired');
      setCheckWaiting(false);
      const prev = overlayQueueRef.current;
      const next =
        prev[0]?.kind === 'check'
          ? popOverlayHead(prev)
          : prev.filter((q) => q.kind !== 'check');
      applyOverlayQueue(next);
      checkWaitingTimerRef.current = null;
    }, CHECK_WAITING_UI_TTL_MS);
  }, [applyOverlayQueue]);

  const setIncomingBanSafe = useCallback(
    (b: BanInteraction | null) => {
      const viewerId = auth.user?.id;
      if (b !== null && (!viewerId || auth.loading)) {
        const why = explainIncomingHidden(
          b,
          viewerId,
          auth.loading,
          viewerId,
          dismissedIncomingRef.current,
        );
        logIncomingDebug({
          authUserId: viewerId,
          incomingId: b.id,
          incomingReceiverId: b.receiver?.id,
          incomingAcknowledged: b.incomingAcknowledged,
          shouldShow: false,
          reason: why.reason,
        });
        return;
      }
      if (
        b !== null &&
        !shouldShowIncomingBanModal(
          b,
          viewerId,
          dismissedIncomingRef.current,
        )
      ) {
        const why = explainIncomingHidden(
          b,
          viewerId,
          auth.loading,
          viewerId,
          dismissedIncomingRef.current,
        );
        logIncomingDebug({
          authUserId: viewerId,
          incomingId: b.id,
          incomingReceiverId: b.receiver?.id,
          incomingAcknowledged: b.incomingAcknowledged,
          shouldShow: false,
          reason: why.reason,
        });
        challengeLog('incoming:reject-set', {
          id: b.id,
          status: b.status,
          hasSender: !!b.sender?.id,
        });
        return;
      }
      challengeLog(b ? 'incoming:set' : 'incoming:clear', {
        id: b?.id ?? null,
        status: b?.status ?? null,
      });
      if (b !== null) {
        const why = explainIncomingHidden(
          b,
          viewerId,
          auth.loading,
          viewerId,
          dismissedIncomingRef.current,
        );
        logIncomingDebug({
          authUserId: viewerId,
          incomingId: b.id,
          incomingReceiverId: b.receiver?.id,
          incomingAcknowledged: b.incomingAcknowledged,
          shouldShow: why.shouldShow,
          reason: why.reason,
        });
      }
      if (b === null) {
        const prev = overlayQueueRef.current;
        if (prev[0]?.kind === 'incoming') {
          applyOverlayQueue(popOverlayHead(prev));
        }
        return;
      }
      enqueueNotification(
        { kind: 'incoming', ban: b },
        { source: 'session' },
      );
    },
    [auth.user?.id, auth.loading, applyOverlayQueue, enqueueNotification],
  );

  const removeIncomingFromQueue = useCallback(
    (banId: string) => {
      applyOverlayQueue(
        overlayQueueRef.current.filter(
          (q) => !(q.kind === 'incoming' && q.ban.id === banId),
        ),
      );
    },
    [applyOverlayQueue],
  );

  // Apply WS-buffered incoming after auth is ready (must run after setIncomingBanSafe exists).
  useEffect(() => {
    if (!auth.user?.id || auth.loading) return;
    if (!bufferedIncomingRef.current) return;
    const b = bufferedIncomingRef.current;
    bufferedIncomingRef.current = null;
    console.log('[incoming-buffer]', {
      action: 'apply',
      banId: b.id,
      receiverId: b.receiver?.id,
    });

    const incoming = pickIncomingForOverlay(
      b,
      dismissedIncomingRef.current,
      auth.user.id,
    );
    if (incoming) {
      enqueueNotification(
        { kind: 'incoming', ban: incoming },
        { live: true, source: 'ws' },
      );
    }
  }, [auth.user?.id, auth.loading, enqueueNotification]);

  const pushPopup = useCallback((p: EnergyPopup) => {
    setPopups((prev) => [...prev, p]);
    setTimeout(() => {
      setPopups((prev) => prev.filter((x) => x.id !== p.id));
    }, 2200);
  }, []);

  const applyOptimisticSend = useCallback(
    (params: {
      username: string;
      firstName?: string;
      banText: string;
      durationMinutes: number;
    }) => {
      clearCheckOverlay();
      const wait = createOptimisticSendWait(params);
      challengeLog('optimistic-send:set', {
        username: wait.username,
        expiresAt: wait.expiresAt,
      });
      setOptimisticSendWait(wait);
    },
    [clearCheckOverlay],
  );

  const confirmOptimisticSend = useCallback((username: string) => {
    const u = normalizeWaitUsername(username);
    setOptimisticSendWait((prev) => {
      if (!prev || normalizeWaitUsername(prev.username) !== u) return prev;
      challengeLog('optimistic-send:confirmed', { username: u });
      return { ...prev, resolved: true };
    });
    setActiveBans((prev) =>
      prev.filter((b) => !b.id.startsWith('optimistic-ban:')),
    );
  }, []);

  const rollbackOptimisticSend = useCallback(
    (params: { username: string; message: string }) => {
      const u = normalizeWaitUsername(params.username);
      challengeLog('optimistic-send:rollback', {
        username: u,
        message: params.message,
      });
      setOptimisticSendWait((prev) => {
        if (!prev || normalizeWaitUsername(prev.username) !== u) return prev;
        return {
          ...prev,
          resolved: true,
          failed: true,
          errorMessage: params.message,
        };
      });
      setActiveBans((prev) =>
        prev.filter((b) => !b.id.startsWith('optimistic-ban:')),
      );
      void reloadFriendsRef.current?.().catch(() => {});
    },
    [],
  );

  const resolveOptimisticFromSession = useCallback(
    (active: BanInteraction[]) => {
      setOptimisticSendWait((prev) => {
        if (!isOptimisticSendWaitActive(prev)) return prev;
        const match = active.some((b) => {
          const recv = (b.receiver?.username ?? '').toLowerCase();
          const send = (b.sender?.username ?? '').toLowerCase();
          return recv === prev!.username || send === prev!.username;
        });
        if (!match) return prev;
        challengeLog('optimistic-send:resolved-session', {
          username: prev!.username,
        });
        return { ...prev!, resolved: true };
      });
    },
    [],
  );

  const resolveOptimisticFromFriends = useCallback((list: FriendCard[]) => {
    setOptimisticSendWait((prev) => {
      if (!isOptimisticSendWaitActive(prev)) return prev;
      const hasReal = list.some(
        (f) =>
          normalizeWaitUsername(f.username ?? '') === prev!.username &&
          (f.userId != null || f.isRegistered),
      );
      if (!hasReal) return prev;
      challengeLog('optimistic-send:resolved', { username: prev!.username });
      return { ...prev!, resolved: true };
    });
  }, []);

  const commitFriendsWithAvatarPreload = useCallback(
    async (
      incomingList: FriendCard[],
      meta: { via: string; markReady?: boolean; allowEmpty?: boolean },
    ) => {
      const requestUid = userIdRef.current;
      const requestToken = tokenRef.current;
      const merged = mergeFriendsPreservingAvatars(
        friendsRef.current,
        incomingList,
        { allowEmpty: meta.allowEmpty },
      );
      logFriendsTiming('friends-committed', {
        userId: requestUid,
        count: merged.length,
        via: meta.via,
      });
      friendsRef.current = merged;
      setFriends(merged);
      if (requestUid) writeFriendsCache(requestUid, merged);
      resolveOptimisticFromFriends(merged);
      if (meta.markReady !== false) {
        setFriendsBootstrapped(true);
      }

      logFriendsTiming('avatar-preload-start', {
        userId: requestUid,
        count: merged.length,
        via: meta.via,
      });
      preloadAvatarUrls(merged.map((f) => f.avatarUrl ?? f.photoUrl));
      const preloadStartedAt = Date.now();
      void preloadFriendAvatars(merged, {
        timeoutMs: 1000,
        via: meta.via,
      }).then(() => {
        if (tokenRef.current !== requestToken) return;
        if (userIdRef.current !== requestUid) return;
        logFriendsTiming('avatar-preload-done', {
          userId: requestUid,
          ms: Date.now() - preloadStartedAt,
          via: meta.via,
        });
      });
    },
    [resolveOptimisticFromFriends],
  );

  useEffect(() => {
    if (!optimisticSendWait || optimisticSendWait.resolved) return;
    const ms = optimisticSendWait.expiresAt - Date.now();
    if (ms <= 0) {
      setOptimisticSendWait(null);
      return;
    }
    const t = setTimeout(() => {
      challengeLog('optimistic-send:expired', {
        username: optimisticSendWait.username,
      });
      setOptimisticSendWait(null);
    }, ms);
    return () => clearTimeout(t);
  }, [optimisticSendWait]);

  useEffect(() => {
    resolveOptimisticFromFriends(friends);
  }, [friends, resolveOptimisticFromFriends]);

  const receiveIncomingBan = useCallback(
    (payload: BanInteraction, source: 'ws' | 'session' | 'poll') => {
      const b = enrichBanInteraction(payload);
      const viewerId = userIdRef.current;

      if (source === 'ws' || source === 'poll') {
        incomingWsSeenRef.current.add(b.id);
      }

      const decision = incomingShowDecision(
        b,
        viewerId,
        dismissedIncomingRef.current,
      );
      console.log('[incoming-show-decision]', {
        banId: b.id,
        shouldShow: decision.shouldShow,
        reason: decision.reason,
        source,
      });

      const incoming = pickIncomingForOverlay(
        b,
        dismissedIncomingRef.current,
        viewerId,
      );
      if (incoming) {
        if (
          source === 'session' &&
          !incomingWsSeenRef.current.has(incoming.id)
        ) {
          const delayMs = incoming.createdAt
            ? Date.now() - new Date(incoming.createdAt).getTime()
            : null;
          console.log('[incoming-recovery-session]', {
            banId: incoming.id,
            delayMs,
          });
        }
        enqueueNotification(
          { kind: 'incoming', ban: incoming },
          {
            live:
              source === 'ws' ||
              (source === 'poll' && !startupInteractionsHoldRef.current),
            source,
          },
        );
        return;
      }

      console.log('INCOMING QUEUE PUSH', {
        banId: b.id,
        skipped: true,
        reason: decision.reason,
        source,
        authUserId: viewerId,
      });

      if (
        source === 'ws' &&
        b.receiver?.id &&
        (!viewerId || b.receiver.id === viewerId)
      ) {
        bufferedIncomingRef.current = b;
        console.log('INCOMING QUEUE PUSH', {
          banId: b.id,
          skipped: true,
          reason: 'buffered-no-auth',
          authUserId: viewerId,
        });
      }
    },
    [enqueueNotification],
  );

  const getOpenIncomingBan = useCallback(
    () => incomingBanRef.current,
    [],
  );

  useIncomingPoll({
    userId: auth.user?.id,
    token: auth.token,
    receiveIncomingBan,
    dismissedIncomingRef,
    getOpenIncomingBan,
    userIdRef,
    tokenRef,
  });

  const receiveCheckBan = useCallback(
    (payload: BanInteraction, source: 'ws' | 'session' | 'poll') => {
      const b = enrichBanInteraction(payload);
      const viewerId = userIdRef.current;

      if (source === 'ws') {
        checkWsSeenRef.current.add(b.id);
        const role = getCheckViewerRole(
          viewerId,
          b.sender.id,
          b.receiver.id,
        );
        console.log('[check-ws-received]', {
          banId: b.id,
          role,
          authUserId: viewerId,
        });
      }

      const decision = checkShowDecision(
        b,
        viewerId,
        dismissedCheckSessionRef.current,
        answeredCheckRef.current,
        checkAnswerInFlightRef.current,
        resultOpenRef.current,
      );
      console.log('[check-show-decision]', {
        banId: b.id,
        shouldShow: decision.shouldShow,
        reason: decision.reason,
        role: decision.role,
        source,
      });

      const check = pickCheckForOverlay(
        b,
        viewerId,
        dismissedCheckSessionRef.current,
        answeredCheckRef.current,
        checkAnswerInFlightRef.current,
        resultOpenRef.current,
      );
      if (check) {
        if (source === 'session' && !checkWsSeenRef.current.has(check.id)) {
          console.log('[check-recovery-session]', { banId: check.id });
        }
        enqueueNotification(
          { kind: 'check', ban: check },
          {
            live:
              source === 'ws' ||
              (source === 'poll' && !startupInteractionsHoldRef.current),
            source,
          },
        );
        setCheckWaiting(false);
      }
    },
    [enqueueNotification],
  );

  const getOpenCheckBan = useCallback(() => checkBanRef.current, []);

  useCheckPoll({
    userId: auth.user?.id,
    token: auth.token,
    receiveCheckBan,
    dismissedCheckSessionRef,
    answeredCheckRef,
    checkAnswerInFlightRef,
    resultOpenRef,
    getOpenCheckBan,
    userIdRef,
    tokenRef,
  });

  useEffect(() => {
    const userId = auth.user?.id;
    const token = auth.token;
    if (!userId || !token) {
      console.log('[result-poll-skip]', { reason: 'no-auth' });
      return;
    }
    console.log('[result-poll-start]', { userId });

    let stopped = false;
    const tick = () => {
      if (stopped) return;
      if (document.visibilityState !== 'visible') {
        console.log('[result-poll-skip]', { reason: 'hidden' });
        return;
      }
      if (result?.id) {
        console.log('[result-poll-skip]', {
          reason: 'already-open',
          banId: result.id,
        });
        return;
      }
      void pollPendingResultOnce('interval');
    };

    void tick();
    const timer = window.setInterval(tick, 2500);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [auth.user?.id, auth.token, result, pollPendingResultOnce]);

  const applySession = useCallback((s: SessionState) => {
    const viewerId = auth.user?.id ?? null;
    if (!viewerId) {
      logIncomingDebug({
        authUserId: viewerId,
        sessionUserId: s.userId,
        incomingId: s.incoming?.id,
        incomingReceiverId: s.incoming?.receiver?.id,
        shouldShow: false,
        reason: 'no-auth-user',
      });
      return;
    }
    if (s.userId && s.userId !== viewerId) {
      challengeLog('session:discard-user-mismatch', {
        sessionUserId: s.userId,
        viewerId,
      });
      logIncomingDebug({
        authUserId: viewerId,
        sessionUserId: s.userId,
        incomingId: s.incoming?.id,
        incomingReceiverId: s.incoming?.receiver?.id,
        shouldShow: false,
        reason: 'stale-session-discarded',
      });
      return;
    }

    const session = enrichSessionState(s);
    const nextIncoming = pickIncomingForOverlay(
      session.incoming,
      dismissedIncomingRef.current,
      viewerId,
    );
    if (session.incoming) {
      console.log('[incoming-session-received]', {
        banId: session.incoming.id,
        receiverId: session.incoming.receiver?.id ?? null,
        authUserId: viewerId,
        status: session.incoming.status,
      });
      receiveIncomingBan(session.incoming, 'session');
    }

    if (session.check) {
      const role = getCheckViewerRole(
        viewerId,
        session.check.sender.id,
        session.check.receiver.id,
      );
      console.log('[check-session-received]', {
        banId: session.check.id,
        role,
        authUserId: viewerId,
      });
      receiveCheckBan(session.check, 'session');
    }

    logIncomingDebug({
      authUserId: viewerId,
      sessionUserId: s.userId ?? viewerId,
      incomingId: s.incoming?.id ?? null,
      incomingReceiverId: s.incoming?.receiver?.id ?? null,
      incomingAcknowledged: s.incoming?.incomingAcknowledged ?? null,
      shouldShow: !!nextIncoming,
      reason: nextIncoming ? 'shown' : 'no-incoming',
    });

    if (banSentOpenRef.current) {
      pruneAndSyncOverlayQueue();
      return;
    }

    challengeLog('session:apply', {
      incoming: s.incoming?.id ?? null,
      incomingStatus: s.incoming?.status ?? null,
      incomingAck: s.incoming?.incomingAcknowledged ?? null,
      overlayIncoming: nextIncoming?.id ?? null,
      active: Array.isArray(s.active) ? s.active.length : 0,
    });
    const nextActive = Array.isArray(s.active) ? s.active : [];
    applySessionToState(
      enrichSessionState({
        ...s,
        incoming: nextIncoming,
        active: nextActive.filter((b) => !b.id.startsWith('optimistic-ban:')),
      }),
      {
        setActiveBans,
        setCheckWaiting,
      },
    );
    resolveOptimisticFromSession(nextActive);
    pruneAndSyncOverlayQueue();
    if (!nextIncoming) {
      setViralOnboarding(false);
    }
    setDataOwnerUserId(viewerId);
  }, [
    resolveOptimisticFromSession,
    auth.user?.id,
    receiveIncomingBan,
    receiveCheckBan,
    pruneAndSyncOverlayQueue,
  ]);

  useEffect(() => {
    if (!auth.boot || !auth.user?.id || auth.loading) return;
    const incoming = pickIncomingForOverlay(
      auth.boot.claimedIncoming,
      dismissedIncomingRef.current,
      auth.user.id,
    );
    if (incoming) {
      challengeLog('boot:claimed-incoming', { banId: incoming.id });
      enqueueNotification(
        { kind: 'incoming', ban: enrichBanInteraction(incoming) },
        { source: 'session' },
      );
      setViralOnboarding(true);
      setDataOwnerUserId(auth.user.id);
      setSessionBootstrapped(true);
    }
    auth.clearBoot();
  }, [auth.boot, auth.clearBoot, auth.user?.id, auth.loading, enqueueNotification]);

  const reloadFriends = useCallback(async () => {
    const token = tokenRef.current;
    const uid = userIdRef.current;
    if (!token || !uid) return;
    logFriendsTiming('started-fetch', { userId: uid, via: 'reloadFriends' });
    const fetchStartedAt = Date.now();
    const end = timingStart('friends fetch');
    try {
      const requestToken = token;
      const requestUid = uid;
      const { friends: list } = await api<{ friends: FriendCard[] }>(
        '/friends',
        { token },
      );
      if (tokenRef.current !== requestToken) return end();
      if (userIdRef.current !== requestUid) return end();
      const safe = coerceFriendList(list);
      logFriendsTiming('response-received', {
        userId: requestUid,
        count: safe.length,
        ms: Date.now() - fetchStartedAt,
        via: 'reloadFriends',
      });
      await commitFriendsWithAvatarPreload(safe, {
        via: 'reloadFriends',
        markReady: !friendsBootstrappedRef.current,
        allowEmpty: true,
      });
      setDataOwnerUserId(requestUid);
      end();
    } catch {
      logFriendsTiming('response-failed', {
        userId: uid,
        ms: Date.now() - fetchStartedAt,
        via: 'reloadFriends',
      });
      if (!friendsBootstrappedRef.current) setFriendsBootstrapped(true);
      end();
    }
  }, [commitFriendsWithAvatarPreload]);

  reloadFriendsRef.current = reloadFriends;

  const reloadPending = useCallback(async () => {
    const token = tokenRef.current;
    const requestUserId = userIdRef.current;
    if (!token || !requestUserId) {
      setSessionBootstrapped(true);
      setInitialNetworkBootstrapAttempted(true);
      return;
    }
    try {
      const requestedAt = Date.now();
      console.log('[session-fetch]', {
        authUserId: requestUserId,
        requestedAt,
      });
      const session = await fetchSession(token);
      // Discard if user/token switched while request in-flight.
      if (tokenRef.current !== token) return;
      if (userIdRef.current !== requestUserId) return;

      console.log('[session-fetch]', {
        authUserId: requestUserId,
        requestedAt,
        responseUserId: (session as SessionState & { userId?: string })?.userId ?? null,
        incomingId: session.incoming?.id ?? null,
        incomingReceiverId: session.incoming?.receiver?.id ?? null,
      });
      applySession(session);

      if (session.pendingResultId) {
        const pendingId = session.pendingResultId;
        logResultLatency('[result-diag-reload-pending]', {
          banId: pendingId,
          authUserId: requestUserId,
          pendingResultId: pendingId,
          alreadyDelivered: resultDeliveredBanIdsRef.current.has(pendingId),
        });
        if (isDismissedResultLocally(pendingId, requestUserId)) {
          void acknowledgeBanResultOnServer(pendingId, token);
        } else {
          try {
            const { result: pendingResult } = await api<{ result: BanResult }>(
              `/bans/${pendingId}/result`,
              { token },
            );
            if (tokenRef.current !== token) return;
            if (userIdRef.current !== requestUserId) return;
            if (pendingResult) {
              receiveResult(pendingResult, 'poll');
            }
          } catch {
            /* result not ready */
          }
        }
      }

      void refreshUserRef.current().catch(() => {});
      void api('/analytics/track', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: ANALYTICS_EVENTS.SESSION_RECOVERED,
        }),
      }).catch(() => {});
      setHasSuccessfulNetworkSync(true);
      setNetworkBootstrapCompleted(true);
      console.log('[connection-ui]', {
        phase: 'session-sync-ok',
        authUserId: requestUserId,
      });
    } catch {
      console.log('[connection-ui]', {
        phase: 'session-sync-failed',
        authUserId: requestUserId,
      });
    } finally {
      setSessionBootstrapped(true);
      setInitialNetworkBootstrapAttempted(true);
    }
  }, [applySession, receiveResult]);

  const openSendTo = useCallback((receiver: string, text = '') => {
    const trimmed = receiver.trim();
    const withAt =
      trimmed && !trimmed.startsWith('@') ? `@${trimmed}` : trimmed;
    setSendReceiver(withAt);
    setSendText(text);
  }, []);

  const clearIncomingReply = useCallback(() => {
    setIncomingReplyBanId(null);
  }, []);

  const startIncomingReply = useCallback((ban: BanInteraction) => {
    const u = ban.sender?.username?.replace(/^@/, '').trim();
    const label = u
      ? `@${u}`
      : formatSenderDisplayName(ban.sender?.username, ban.sender?.firstName);
    setIncomingReplyBanId(ban.id);
    setSendReceiver(label);
    setSendText('');
    setSendOpen(true);
  }, []);

  const acknowledgeIncomingSeen = useCallback(async (banId: string) => {
    dismissedIncomingRef.current.add(banId);
    setViralOnboarding(false);
    removeIncomingFromQueue(banId);
    console.log('[incoming-cleared]', {
      banId,
      reason: 'receiver-dismiss',
      authUserId: userIdRef.current,
    });
    const uid = userIdRef.current;
    if (uid) {
      await acknowledgeIncomingFully(banId, tokenRef.current, uid);
    }
    challengeLog('incoming:acked', { banId });
  }, [removeIncomingFromQueue]);

  const acknowledgeIncomingAndStartReply = useCallback(
    async (ban: BanInteraction) => {
      const banId = ban.id;
      dismissedIncomingRef.current.add(banId);
      setViralOnboarding(false);
      removeIncomingFromQueue(banId);
      challengeLog('incoming:reply-open', { banId });
      const token = tokenRef.current;
      if (token) {
        try {
          await api<{ ban: BanInteraction }>(`/bans/${banId}/accept`, {
            method: 'POST',
            token,
          });
        } catch (e) {
          challengeLog('incoming:accept-failed', {
            banId,
            message: (e as Error).message,
          });
        }
      }
      startIncomingReply(ban);
    },
    [removeIncomingFromQueue, startIncomingReply],
  );

  const dismissIncoming = useCallback(
    (banId?: string) => {
      if (banId) {
        void acknowledgeIncomingSeen(banId);
        return;
      }
      challengeLog('incoming:dismiss', { banId: null });
      setViralOnboarding(false);
      const prev = overlayQueueRef.current;
      if (prev[0]?.kind === 'incoming') {
        applyOverlayQueue(popOverlayHead(prev));
      }
    },
    [acknowledgeIncomingSeen, applyOverlayQueue],
  );

  const { status: wsStatus, eventLog } = useWebSocket(
    auth.token,
    (event) => {
      switch (event.type) {
        case 'ban:incoming': {
          receiveIncomingBan(event.payload as BanInteraction, 'ws');
          break;
        }
        case 'check:due': {
          receiveCheckBan(event.payload as BanInteraction, 'ws');
          break;
        }
        case 'check:waiting':
          setCheckWaiting(true);
          scheduleCheckWaitingDismiss();
          scheduleResultPollBurst();
          logResultLatency('[result-diag-check-waiting-ws]', {
            authUserId: userIdRef.current,
            role: resultParticipantRole(
              userIdRef.current,
              checkBanRef.current,
            ),
          });
          break;
        case 'check:completed': {
          const payload = event.payload as BanResult;
          const uid = userIdRef.current;
          const banId = payload?.id ?? null;
          const submitAt = banId ? checkSubmitAtRef.current.get(banId) : undefined;
          const role = resultParticipantRole(uid, payload);
          const elapsedMs = resultElapsedSinceSubmit(
            banId,
            checkSubmitAtRef.current,
          );
          logResultLatency('[result-ws-received]', {
            banId,
            authUserId: uid,
            role,
            source: 'ws',
            elapsedMs,
          });
          receiveResult(payload, 'ws');
          if (uid && banId) {
            answeredCheckRef.current.add(banId);
            dismissedCheckSessionRef.current.add(banId);
            markCheckAnsweredLocally(uid, banId);
          }
          queueMicrotask(() => {
            if (banId) {
              applyOverlayQueue(
                removeOverlaysForBan(overlayQueueRef.current, banId, [
                  'check',
                  'incoming',
                ]),
              );
            }
            void refreshUserRef.current().catch(() => {});
          });
          break;
        }
        case 'sync:session':
          applySession(event.payload as SessionState);
          break;
        case 'energy:popup':
          pushPopup(event.payload as EnergyPopup);
          queueMicrotask(() => {
            void refreshUserRef.current().catch(() => {});
          });
          break;
        case 'ban:updated':
          if (!banSentOpenRef.current) reloadPending();
          break;
        case 'friends:updated': {
          if (banSentOpenRef.current) break;
          const payload = event.payload as { friends?: unknown };
          const list = coerceFriendList(payload?.friends);
          const uid = userIdRef.current;
          if (!uid) break;
          void commitFriendsWithAvatarPreload(list, {
            via: 'ws-friends',
            markReady: false,
          }).then(() => {
            setDataOwnerUserId(uid);
          });
          break;
        }
      }
    },
    () => {
      logResultLatency('[result-diag-ws-reconnect]', {
        authUserId: userIdRef.current,
      });
      void reloadPendingRef.current().catch(() => {});
    },
  );

  useEffect(() => {
    if (wsStatus === 'connected') {
      setWsHasConnectedOnce(true);
    }
  }, [wsStatus]);

  useEffect(() => {
    if (!auth.user?.id || !auth.token || auth.loading) {
      setStartupGraceActive(true);
      return;
    }
    setStartupGraceActive(true);
    console.log('[connection-ui]', {
      phase: 'grace-start',
      ms: STARTUP_GRACE_MS,
      userId: auth.user.id,
    });
    const t = window.setTimeout(() => {
      setStartupGraceActive(false);
      console.log('[connection-ui]', { phase: 'grace-end', userId: auth.user?.id });
    }, STARTUP_GRACE_MS);
    return () => window.clearTimeout(t);
  }, [auth.user?.id, auth.token, auth.loading]);

  useEffect(() => {
    const sync = () => setNavigatorOffline(!navigator.onLine);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  useEffect(() => {
    if (startupGraceActive) return;
    if (hasSuccessfulNetworkSync) return;
    if (!initialNetworkBootstrapAttempted) return;
    setNetworkBootstrapCompleted(true);
    console.log('[connection-ui]', { phase: 'bootstrap-settled-without-sync' });
  }, [
    startupGraceActive,
    hasSuccessfulNetworkSync,
    initialNetworkBootstrapAttempted,
  ]);

  useEffect(() => {
    const uid = auth.user?.id;
    const token = auth.token;
    if (!uid || !token || auth.loading) return;
    void backfillAcknowledgedIncomingOnce(token, uid);
  }, [auth.user?.id, auth.token, auth.loading]);

  const reloadPendingRef = useRef(reloadPending);
  reloadPendingRef.current = reloadPending;

  useEffect(() => {
    resultOpenRef.current = !!result;
  }, [result]);

  useEffect(() => {
    const uid = auth.user?.id;
    const token = auth.token;
    if (!uid || !token) return;
    void reloadPendingRef.current().catch(() => {});
  }, [auth.user?.id, auth.token]);

  useEffect(() => {
    setFirstBanComplete(isFirstBanComplete());
  }, []);

  const completeFirstBan = useCallback(() => {
    markFirstBanComplete();
    setFirstBanComplete(true);
    void auth.onboard().catch(() => {});
  }, [auth.onboard]);

  const showFirstBanOnboarding = useMemo(() => {
    if (firstBanComplete) return false;
    if (auth.user?.isOnboarded) return false;
    return friends.length === 0;
  }, [firstBanComplete, auth.user?.isOnboarded, friends.length]);

  useEffect(() => {
    if (!result) return;
    if (
      isDismissedResultLocally(result.id, result.viewerId ?? null) ||
      !isValidBanResultPayload(result)
    ) {
      dismissBanResult();
    }
  }, [result, dismissBanResult]);

  useEffect(() => {
    resetScrollLock();
  }, []);

  useEffect(
    () => () => {
      if (checkWaitingTimerRef.current) {
        clearTimeout(checkWaitingTimerRef.current);
      }
      resetScrollLock();
    },
    [],
  );

  useEffect(() => {
    const uid = auth.user?.id;
    if (!uid || !auth.token || auth.loading) return;

    logFriendsTiming('started-fetch', {
      userId: uid,
      authReady: auth.authReady,
    });
    const fetchStartedAt = Date.now();
    const end = timingStart('/friends loaded');
    const requestToken = auth.token;
    const requestUid = uid;
    api<{ friends?: unknown }>('/friends', { token: requestToken })
      .then(async (r) => {
        const ms = Date.now() - fetchStartedAt;
        if (tokenRef.current !== requestToken || userIdRef.current !== requestUid) {
          logFriendsTiming('response-discarded', { userId: requestUid, ms });
          end();
          return;
        }
        const list = coerceFriendList(r?.friends);
        logFriendsTiming('response-received', {
          userId: requestUid,
          count: list.length,
          ms,
        });
        await commitFriendsWithAvatarPreload(list, {
          via: 'initial-fetch',
          allowEmpty: true,
        });
        setDataOwnerUserId(requestUid);
        end();
      })
      .catch(() => {
        logFriendsTiming('response-failed', {
          userId: requestUid,
          ms: Date.now() - fetchStartedAt,
        });
        setFriendsBootstrapped(true);
        end();
        timingLog('friends fetch failed', 0);
      });
  }, [
    auth.token,
    auth.user?.id,
    auth.loading,
    auth.authReady,
    commitFriendsWithAvatarPreload,
  ]);

  const displayFriends = useMemo(
    () => mergeFriendsWithOptimistic(friends, optimisticSendWait),
    [friends, optimisticSendWait],
  );

  const displayActiveBans = useMemo(
    () => mergeActiveBansWithOptimistic(activeBans, optimisticSendWait),
    [activeBans, optimisticSendWait],
  );

  const displayFriendsRef = useRef(displayFriends);
  displayFriendsRef.current = displayFriends;
  const displayActiveBansRef = useRef(displayActiveBans);
  displayActiveBansRef.current = displayActiveBans;
  const optimisticSendWaitRef = useRef(optimisticSendWait);
  optimisticSendWaitRef.current = optimisticSendWait;

  const flushDeferredSync = useCallback(async () => {
    if (!deferredSyncRef.current) return;
    deferredSyncRef.current = false;
    await reloadPending();
    await reloadFriends();
    await auth.refreshUser().catch(() => {});
    await auth.onboard().catch(() => {});
  }, [reloadPending, reloadFriends, auth.refreshUser, auth.onboard]);

  const scheduleDeferredSync = useCallback(() => {
    deferredSyncRef.current = true;
  }, []);

  const setBanSentOpen = useCallback(
    (open: boolean) => {
      if (open) {
        setUiFreeze({
          friends: displayFriendsRef.current,
          activeBans: displayActiveBansRef.current,
          optimisticSendWait: optimisticSendWaitRef.current,
        });
        banSentOpenRef.current = true;
        setBanSentOpenRaw(true);
        return;
      }
      banSentOpenRef.current = false;
      setBanSentOpenRaw(false);
      setUiFreeze(null);
      console.log('[success-done-click]', {
        banId: null,
        senderId: userIdRef.current,
      });
      void flushDeferredSync();
    },
    [flushDeferredSync],
  );

  const completeBanSendSuccess = useCallback(() => {
    blurActiveInputs();
    setSendText('');
    setInlineBanError(null);
    afterKeyboardCollapse(() => {
      setBanSentOpen(true);
    }, 100);
  }, [setBanSentOpen]);

  banSentOpenRef.current = banSentOpen;

  const optimisticForUi =
    banSentOpen && uiFreeze ? uiFreeze.optimisticSendWait : optimisticSendWait;

  useEffect(() => {
    const uid = auth.user?.id;
    if (!uid || auth.loading || !friendsBootstrapped || !auth.user) return;

    const timer = window.setTimeout(() => {
      writeHomeSnapshot(uid, {
        friends: displayFriendsRef.current,
        user: auth.user,
        sendDuration,
        sendReceiver,
        activeBansCount: displayActiveBansRef.current.length,
        checkBan: checkBan?.status === 'checking' ? checkBan : null,
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    auth.user,
    auth.loading,
    friendsBootstrapped,
    sendDuration,
    sendReceiver,
    displayFriends,
    displayActiveBans.length,
    checkBan,
  ]);

  // Show user data as soon as backend user id + token exist (do not wait authReady / session).
  const isAppReady = !!auth.user?.id && !!auth.token && !auth.loading;
  const friendsReady = friendsBootstrapped;
  const sessionReady = sessionBootstrapped;
  const incomingGateActive = useMemo(() => {
    if (!auth.user?.id || auth.loading) return false;
    return shouldShowIncomingBanModal(
      incomingBan,
      auth.user.id,
      dismissedIncomingRef.current,
    );
  }, [incomingBan, auth.user?.id, auth.loading]);

  const checkGateActive = useMemo(
    () =>
      shouldShowCheckOverlay(
        checkBan,
        auth.user?.id ?? null,
        dismissedCheckSessionRef.current,
        answeredCheckRef.current,
        checkAnswerInFlightRef.current,
        !!result,
      ),
    [checkBan, auth.user?.id, result],
  );

  const notificationOverlayActive =
    incomingGateActive || checkGateActive || !!result;

  const overlayActiveKinds = useMemo(() => {
    const kinds: string[] = [];
    if (incomingGateActive) kinds.push('incoming');
    if (checkGateActive) kinds.push('check');
    if (result) kinds.push('result');
    return kinds;
  }, [incomingGateActive, checkGateActive, result]);

  const closeLobby = useCallback(() => {
    console.log('[lobby-enter-click]', { userId: userIdRef.current ?? null });
    setLobbyOpen(false);
    console.log('[lobby-closed]', { userId: userIdRef.current ?? null });
  }, []);

  const [newBanWhoFlowRequest, setNewBanWhoFlowRequest] = useState(0);

  const openNewBanWhoFlow = useCallback(() => {
    closeLobby();
    setNewBanWhoFlowRequest((n) => n + 1);
  }, [closeLobby]);

  useEffect(() => {
    setLobbyOpen(true);
    lobbyShownLoggedRef.current = false;
  }, [auth.user?.id]);

  useEffect(() => {
    if (!lobbyOpen || lobbyShownLoggedRef.current) return;
    if (!auth.user?.id || auth.loading) return;
    lobbyShownLoggedRef.current = true;
    console.log('[lobby-show]', { userId: auth.user.id });
  }, [lobbyOpen, auth.user?.id, auth.loading]);

  useEffect(() => {
    if (!lobbyOpen) return;
    if (incomingGateActive && incomingBan) {
      console.log('[lobby-gated-overlay]', {
        type: 'incoming',
        banId: incomingBan.id,
      });
    }
    if (checkGateActive && checkBan) {
      console.log('[lobby-gated-overlay]', {
        type: 'check',
        banId: checkBan.id,
      });
    }
    if (result) {
      console.log('[lobby-gated-overlay]', {
        type: 'result',
        banId: result.id,
      });
    }
  }, [
    lobbyOpen,
    incomingGateActive,
    checkGateActive,
    incomingBan,
    checkBan,
    result,
  ]);

  const scopedFriends = isAppReady
    ? banSentOpen && uiFreeze
      ? uiFreeze.friends
      : displayFriends
    : [];
  const scopedActiveBans = isAppReady
    ? banSentOpen && uiFreeze
      ? uiFreeze.activeBans
      : displayActiveBans
    : [];
  const scopedIncomingBan =
    auth.user?.id && !auth.loading ? incomingBan : null;
  const scopedCheckBan = checkGateActive ? checkBan : null;

  const connectionUiState = useMemo(
    () =>
      resolveConnectionUiState({
        wsStatus,
        startupGraceActive,
        networkBootstrapCompleted,
        hasSuccessfulNetworkSync,
        wsHasConnectedOnce,
        navigatorOffline,
      }),
    [
      wsStatus,
      startupGraceActive,
      networkBootstrapCompleted,
      hasSuccessfulNetworkSync,
      wsHasConnectedOnce,
      navigatorOffline,
    ],
  );

  useEffect(() => {
    if (!auth.user?.id) {
      logFriendsTiming('why-not-rendered', { reason: 'no-user-id' });
      return;
    }
    if (auth.loading) {
      logFriendsTiming('why-not-rendered', { reason: 'auth-loading' });
      return;
    }
    if (!auth.token) {
      logFriendsTiming('why-not-rendered', { reason: 'no-token' });
      return;
    }
    if (!isAppReady) {
      logFriendsTiming('why-not-rendered', { reason: 'not-app-ready' });
      return;
    }
    if (!friendsReady) {
      logFriendsTiming('why-not-rendered', { reason: 'friends-loading' });
      return;
    }
    if (scopedFriends.length === 0 && friends.length === 0) {
      logFriendsTiming('why-not-rendered', {
        reason: 'empty-list',
        fetchMayBeInFlight: true,
      });
    }
  }, [
    auth.user?.id,
    auth.loading,
    auth.token,
    isAppReady,
    friendsReady,
    sessionReady,
    incomingGateActive,
    scopedFriends.length,
    friends.length,
  ]);

  const pendingStartupInteractions = pendingStartupInteractionsCount > 0;

  const contextValue = useMemo(
    () => ({
      token: auth.token,
      user: auth.user,
      loading: auth.loading,
      authReady: auth.authReady,
      isAppReady,
      friendsReady,
      homeSnapshotReady,
      sessionReady,
      incomingGateActive,
      error: auth.error,
      refreshUser: auth.refreshUser,
      onboard: auth.onboard,
      incomingBan: scopedIncomingBan,
      setIncomingBan: setIncomingBanSafe,
      dismissIncoming,
      checkBan: scopedCheckBan,
      checkGateActive,
      setCheckBan: setCheckBanSafe,
      submitCheckAnswer,
      checkWaiting,
      setCheckWaiting,
      result,
      openBanResult,
      dismissBanResult,
      popups,
      pushPopup,
      activeBans: scopedActiveBans,
      friends: scopedFriends,
      sendOpen,
      setSendOpen,
      sendReceiver,
      setSendReceiver,
      sendText,
      setSendText,
      sendDuration,
      setSendDuration,
      openSendTo,
      startIncomingReply,
      acknowledgeIncomingAndStartReply,
      acknowledgeIncomingSeen,
      incomingReplyBanId,
      clearIncomingReply,
      applySession,
      reloadPending,
      reloadFriends,
      wsStatus,
      connectionUiState,
      networkBootstrapCompleted,
      hasSuccessfulNetworkSync,
      eventLog,
      viralOnboarding,
      banSentOpen,
      setBanSentOpen,
      completeBanSendSuccess,
      scheduleDeferredSync,
      optimisticSendWait: optimisticForUi,
      applyOptimisticSend,
      confirmOptimisticSend,
      rollbackOptimisticSend,
      clearCheckOverlay,
      showFirstBanOnboarding,
      completeFirstBan,
      inlineBanError,
      setInlineBanError,
      banInputShake,
      triggerBanInputShake,
      lobbyOpen,
      closeLobby,
      newBanWhoFlowRequest,
      openNewBanWhoFlow,
      pendingStartupInteractions,
      releaseStartupInteractions,
      markSessionBanSendSuccess,
    }),
    [
      auth.token,
      auth.user,
      auth.loading,
      auth.authReady,
      isAppReady,
      friendsReady,
      homeSnapshotReady,
      sessionReady,
      incomingGateActive,
      auth.error,
      auth.refreshUser,
      auth.onboard,
      scopedIncomingBan,
      setIncomingBanSafe,
      dismissIncoming,
      scopedCheckBan,
      checkGateActive,
      setCheckBanSafe,
      submitCheckAnswer,
      checkWaiting,
      setCheckWaiting,
      result,
      openBanResult,
      dismissBanResult,
      popups,
      pushPopup,
      scopedActiveBans,
      scopedFriends,
      sendOpen,
      sendReceiver,
      sendText,
      sendDuration,
      openSendTo,
      startIncomingReply,
      acknowledgeIncomingAndStartReply,
      acknowledgeIncomingSeen,
      incomingReplyBanId,
      clearIncomingReply,
      applySession,
      reloadPending,
      reloadFriends,
      wsStatus,
      connectionUiState,
      networkBootstrapCompleted,
      hasSuccessfulNetworkSync,
      eventLog,
      viralOnboarding,
      banSentOpen,
      uiFreeze,
      optimisticForUi,
      scheduleDeferredSync,
      setBanSentOpen,
      completeBanSendSuccess,
      applyOptimisticSend,
      confirmOptimisticSend,
      rollbackOptimisticSend,
      clearCheckOverlay,
      showFirstBanOnboarding,
      completeFirstBan,
      inlineBanError,
      banInputShake,
      triggerBanInputShake,
      lobbyOpen,
      closeLobby,
      newBanWhoFlowRequest,
      openNewBanWhoFlow,
      pendingStartupInteractions,
      releaseStartupInteractions,
      markSessionBanSendSuccess,
    ],
  );

  return (
    <AppContext.Provider value={contextValue}>
      <ShellErrorBoundary name="app">
        {children}
        <GlobalOverlayHost
          active={notificationOverlayActive}
          activeIncomingBanId={
            incomingGateActive ? (incomingBan?.id ?? null) : null
          }
        >
          <ChallengeErrorBoundary
            name="incoming"
            onRecover={() => dismissIncoming()}
          >
            <IncomingBanOverlay embedded />
          </ChallengeErrorBoundary>
          <ChallengeErrorBoundary
            name="check"
            onRecover={() => clearCheckOverlay()}
          >
            <CheckOverlay embedded />
          </ChallengeErrorBoundary>
          <ChallengeErrorBoundary
            name="result"
            onRecover={() => dismissBanResult()}
          >
            {result ? (
              <ResultOverlay
                key={result.id}
                result={result}
                onClose={dismissBanResult}
                embedded
              />
            ) : null}
          </ChallengeErrorBoundary>
        </GlobalOverlayHost>
        {!result ? (
          <ShellErrorBoundary name="energy" fallback={null}>
            <EnergyPopupStack popups={popups} />
          </ShellErrorBoundary>
        ) : null}
      </ShellErrorBoundary>
    </AppContext.Provider>
  );
}
