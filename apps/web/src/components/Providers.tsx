'use client';

import dynamic from 'next/dynamic';
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
import { preloadFriendAvatars } from '@/lib/avatar-preload';
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
  dismissBanResultLocally,
  resultShowDecision,
  shouldShowBanResult,
} from '@/lib/ban-result-flow';
import { useResultPoll } from '@/hooks/useResultPoll';
import { isDismissedResultLocally } from '@/lib/dismissed-results';
import {
  resolveConnectionUiState,
  STARTUP_GRACE_MS,
  type ConnectionUiState,
} from '@/lib/connection-ui';

// Break circular import: Providers -> ResultOverlay -> Providers (useApp).
const ResultOverlayLazy = dynamic(
  () => import('./ResultOverlay').then((m) => ({ default: m.ResultOverlay })),
  { ssr: false },
);

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
  dismissedIncoming: Set<string>,
  checkGuards: {
    sessionDismissed: Set<string>;
    answeredLocally: Set<string>;
    inFlight: Set<string>;
    resultOpen: boolean;
  },
  viewerId: string | null | undefined,
  setters: {
    setActiveBans: (b: BanInteraction[]) => void;
    setIncomingBan: (b: BanInteraction | null | ((prev: BanInteraction | null) => BanInteraction | null)) => void;
    setCheckBan: (b: BanInteraction | null) => void;
    setCheckWaiting: (v: boolean) => void;
  },
) {
  const session = enrichSessionState(s);
  setters.setActiveBans(Array.isArray(session.active) ? session.active : []);
  setters.setIncomingBan((prev: BanInteraction | null) => {
    const fromSession = pickIncomingForOverlay(
      session.incoming,
      dismissedIncoming,
      viewerId,
    );
    if (fromSession) return fromSession;
    if (prev && shouldShowIncomingBanModal(prev, viewerId, dismissedIncoming)) {
      return prev;
    }
    return null;
  });

  const fromSessionCheck = pickCheckForOverlay(
    session.check,
    viewerId,
    checkGuards.sessionDismissed,
    checkGuards.answeredLocally,
    checkGuards.inFlight,
    checkGuards.resultOpen,
  );

  if (fromSessionCheck) {
    setters.setCheckBan(fromSessionCheck);
    setters.setCheckWaiting(false);
  } else if (!session.needsOnboardingRecovery) {
    setters.setCheckBan(null);
    setters.setCheckWaiting(false);
  }
}

/** Hard remount on Telegram account switch — wipes in-memory friends/session. */
export function Providers({ children }: { children: React.ReactNode }) {
  const { ready, telegramId } = useTelegram();

  if (!ready) {
    console.log('[boot]', { phase: 'telegram-not-ready' });
    return (
      <div className="min-h-[100dvh] flex items-center justify-center challenge-bg">
        <span className="text-accent text-2xl font-bold text-glow">98+</span>
      </div>
    );
  }

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
  const resultRef = useRef<BanResult | null>(null);
  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  const openBanResult = useCallback(
    (r: BanResult | null | undefined, mode: ResultOpenMode) => {
      if (!r) {
        setResult(null);
        return;
      }
      if (!shouldShowBanResult(r, mode, r.id)) {
        challengeLog('result:reject-open', {
          banId: r.id,
          outcome: r.outcome,
          mode,
        });
        dismissBanResultLocally(r.id);
        void acknowledgeBanResultOnServer(r.id, tokenRef.current);
        return;
      }
      setResult(r);
    },
    [],
  );

  const dismissBanResult = useCallback(() => {
    setResult((prev) => {
      if (prev?.id) {
        dismissBanResultLocally(prev.id);
        void acknowledgeBanResultOnServer(prev.id, tokenRef.current);
      }
      return null;
    });
  }, []);
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
        setCheckBan(cachedCheck);
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
      void preloadFriendAvatars(cached, { timeoutMs: 2000 });
    }
  }, [auth.user?.id]);

  const clearCheckOverlay = useCallback(() => {
    if (checkWaitingTimerRef.current) {
      clearTimeout(checkWaitingTimerRef.current);
      checkWaitingTimerRef.current = null;
    }
    setCheckBan(null);
    setCheckWaiting(false);
  }, []);

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
        setCheckBan(enrichBanInteraction(b));
        return;
      }
      setCheckBan(null);
    },
    [auth.user?.id],
  );

  const scheduleCheckWaitingDismiss = useCallback(() => {
    if (checkWaitingTimerRef.current) {
      clearTimeout(checkWaitingTimerRef.current);
    }
    checkWaitingTimerRef.current = setTimeout(() => {
      challengeLog('check-waiting:expired');
      setCheckWaiting(false);
      setCheckBan(null);
      checkWaitingTimerRef.current = null;
    }, CHECK_WAITING_UI_TTL_MS);
  }, []);

  const receiveResult = useCallback(
    (payload: BanResult, source: 'ws' | 'session' | 'poll' | 'http') => {
      const viewerId = userIdRef.current;
      const role =
        getCheckViewerRole(
          viewerId,
          payload.sender.id,
          payload.receiver.id,
        ) ?? null;

      if (source === 'ws') {
        console.log('[result-ws-received]', {
          banId: payload.id,
          authUserId: viewerId,
          role,
        });
      } else if (source === 'session') {
        console.log('[result-session-received]', {
          banId: payload.id,
          authUserId: viewerId,
          role,
        });
      }

      const decision = resultShowDecision(payload, viewerId, 'live');
      console.log('[result-show-decision]', {
        banId: payload.id,
        shouldShow: decision.shouldShow,
        reason: decision.reason,
        source,
      });

      if (!decision.shouldShow) return;

      if (payload.id) {
        answeredCheckRef.current.add(payload.id);
        dismissedCheckSessionRef.current.add(payload.id);
      }
      clearCheckOverlay();
      dismissIncoming();
      setResult(payload);
      void refreshUserRef.current().catch(() => {});
    },
    [clearCheckOverlay, dismissIncoming],
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
      setCheckBan(null);

      try {
        const res = await api<{
          done: boolean;
          waiting?: boolean;
          result?: BanResult;
        }>(`/bans/${banId}/check`, {
          method: 'POST',
          token,
          body: JSON.stringify({ completed }),
        });

        if (res.done && res.result) {
          challengeLog('check:done', { banId });
          receiveResult(res.result, 'http');
        } else if (res.waiting) {
          challengeLog('check:waiting-partner', { banId });
          setCheckWaiting(true);
          scheduleCheckWaitingDismiss();
        } else {
          setCheckWaiting(false);
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
    [receiveResult, scheduleCheckWaitingDismiss],
  );

  const getOpenResult = useCallback(() => resultRef.current, []);

  useResultPoll({
    userId: auth.user?.id,
    token: auth.token,
    receiveResult,
    getOpenResult,
    userIdRef,
    tokenRef,
  });

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
      setIncomingBan(b);
    },
    [auth.user?.id, auth.loading],
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
      setIncomingBan(incoming);
    }
  }, [auth.user?.id, auth.loading]);

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
      const preloadStartedAt = Date.now();
      void preloadFriendAvatars(merged, { timeoutMs: 1000 }).then(() => {
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

      if (source === 'ws') {
        incomingWsSeenRef.current.add(b.id);
        console.log('[incoming-ws-received]', {
          banId: b.id,
          receiverId: b.receiver?.id ?? null,
          authUserId: viewerId,
          status: b.status,
        });
      } else if (source === 'poll') {
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
        setIncomingBan(incoming);
        return;
      }

      if (
        source === 'ws' &&
        b.receiver?.id &&
        (!viewerId || b.receiver.id === viewerId)
      ) {
        bufferedIncomingRef.current = b;
        console.log('[incoming-buffer]', {
          action: 'store',
          banId: b.id,
          receiverId: b.receiver?.id,
          authUserId: viewerId,
        });
      }
    },
    [],
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
        setCheckBan(check);
        setCheckWaiting(false);
      }
    },
    [],
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

    if (s.pendingResultId && !isDismissedResultLocally(s.pendingResultId)) {
      void api<{ result: BanResult }>(`/bans/${s.pendingResultId}/result`, {
        token: tokenRef.current!,
      })
        .then(({ result: pendingResult }) => {
          if (
            pendingResult &&
            tokenRef.current &&
            userIdRef.current === viewerId
          ) {
            receiveResult(pendingResult, 'session');
          }
        })
        .catch(() => {});
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
      setIncomingBan((prev) => {
        if (nextIncoming) return nextIncoming;
        if (
          prev &&
          shouldShowIncomingBanModal(prev, viewerId, dismissedIncomingRef.current)
        ) {
          return prev;
        }
        return null;
      });
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
      dismissedIncomingRef.current,
      {
        sessionDismissed: dismissedCheckSessionRef.current,
        answeredLocally: answeredCheckRef.current,
        inFlight: checkAnswerInFlightRef.current,
        resultOpen: resultOpenRef.current,
      },
      viewerId,
      {
        setActiveBans,
        setIncomingBan,
        setCheckBan,
        setCheckWaiting,
      },
    );
    resolveOptimisticFromSession(nextActive);
    if (!nextIncoming) {
      setViralOnboarding(false);
    }
    setDataOwnerUserId(viewerId);
  }, [
    resolveOptimisticFromSession,
    auth.user?.id,
    receiveIncomingBan,
    receiveCheckBan,
    receiveResult,
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
      setIncomingBan(enrichBanInteraction(incoming));
      setViralOnboarding(true);
      setDataOwnerUserId(auth.user.id);
      setSessionBootstrapped(true);
    }
    auth.clearBoot();
  }, [auth.boot, auth.clearBoot, auth.user?.id, auth.loading]);

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
        if (isDismissedResultLocally(pendingId)) {
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
              if (shouldShowBanResult(pendingResult, 'auto', pendingId)) {
                openBanResult(pendingResult, 'auto');
              } else {
                dismissBanResultLocally(pendingId);
                void acknowledgeBanResultOnServer(pendingId, token);
              }
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
  }, [applySession, openBanResult]);

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
    setIncomingBan(null);
    setViralOnboarding(false);
    const uid = userIdRef.current;
    if (uid) {
      await acknowledgeIncomingFully(banId, tokenRef.current, uid);
    }
    challengeLog('incoming:acked', { banId });
  }, []);

  const acknowledgeIncomingAndStartReply = useCallback(
    async (ban: BanInteraction) => {
      const banId = ban.id;
      dismissedIncomingRef.current.add(banId);
      setIncomingBan(null);
      setViralOnboarding(false);
      challengeLog('incoming:ack-before-reply', { banId });
      const uid = userIdRef.current;
      if (uid) {
        await acknowledgeIncomingFully(banId, tokenRef.current, uid);
      }
      startIncomingReply(ban);
    },
    [startIncomingReply],
  );

  const dismissIncoming = useCallback(
    (banId?: string) => {
      if (banId) {
        void acknowledgeIncomingSeen(banId);
        return;
      }
      challengeLog('incoming:dismiss', { banId: null });
      setIncomingBan(null);
      setViralOnboarding(false);
    },
    [acknowledgeIncomingSeen],
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
          break;
        case 'check:completed': {
          receiveResult(event.payload as BanResult, 'ws');
          break;
        }
        case 'sync:session':
          applySession(event.payload as SessionState);
          break;
        case 'energy:popup':
          pushPopup(event.payload as EnergyPopup);
          auth.refreshUser();
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
    receiveIncomingBan,
    receiveCheckBan,
    receiveResult,
    reloadPending,
    openBanResult,
    dismissBanResult,
    clearCheckOverlay,
    dismissIncoming,
    scheduleCheckWaitingDismiss,
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
      isDismissedResultLocally(result.id) ||
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
    ],
  );

  return (
    <AppContext.Provider value={contextValue}>
      <ShellErrorBoundary name="app">
        <ChallengeErrorBoundary
          name="incoming"
          onRecover={() => dismissIncoming()}
        >
          <IncomingBanOverlay />
        </ChallengeErrorBoundary>
        <ChallengeErrorBoundary
          name="check"
          onRecover={() => clearCheckOverlay()}
        >
          <CheckOverlay />
        </ChallengeErrorBoundary>
        {result ? (
          <ChallengeErrorBoundary
            name="result"
            onRecover={() => dismissBanResult()}
          >
            <ResultOverlayLazy result={result} onClose={dismissBanResult} />
          </ChallengeErrorBoundary>
        ) : null}
        {children}
        {!result ? (
          <ShellErrorBoundary name="energy" fallback={null}>
            <EnergyPopupStack popups={popups} />
          </ShellErrorBoundary>
        ) : null}
      </ShellErrorBoundary>
    </AppContext.Provider>
  );
}
