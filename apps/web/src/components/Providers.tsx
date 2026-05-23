'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import type {
  EnergyPopup,
  BanInteraction,
  BanResult,
  SessionState,
  FriendCard,
} from '@98plus/shared';
import { ANALYTICS_EVENTS, coerceFriendList } from '@98plus/shared';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { EnergyPopupStack } from './EnergyPopupStack';
import { ShellErrorBoundary } from './ShellErrorBoundary';
import { resetScrollLock } from '@/lib/scroll-lock';
import { fetchSession } from '@/lib/session';
import { api } from '@/lib/api';
import { challengeLog } from '@/lib/challenge-log';
import { isValidIncomingOverlayPayload } from '@/lib/incoming-challenge';
import {
  type OptimisticSendWait,
  CHECK_WAITING_UI_TTL_MS,
  createOptimisticSendWait,
  isOptimisticSendWaitActive,
  normalizeWaitUsername,
} from '@/lib/waiting-lifecycle';
import { isFirstBanComplete, markFirstBanComplete } from '@/lib/first-ban';

interface AppContextValue {
  token: string | null;
  user: ReturnType<typeof useAuth>['user'];
  loading: boolean;
  error: string | null;
  refreshUser: () => Promise<void>;
  onboard: () => Promise<void>;
  incomingBan: BanInteraction | null;
  setIncomingBan: (b: BanInteraction | null) => void;
  dismissIncoming: (banId?: string) => void;
  checkBan: BanInteraction | null;
  setCheckBan: (b: BanInteraction | null) => void;
  checkWaiting: boolean;
  setCheckWaiting: (v: boolean) => void;
  result: BanResult | null;
  setResult: (r: BanResult | null) => void;
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
  applySession: (s: SessionState) => void;
  reloadPending: () => Promise<void>;
  reloadFriends: () => Promise<void>;
  wsStatus: ReturnType<typeof useWebSocket>['status'];
  eventLog: string[];
  viralOnboarding: boolean;
  banSentOpen: boolean;
  setBanSentOpen: (v: boolean) => void;
  optimisticSendWait: OptimisticSendWait | null;
  notifySendSuccess: (username: string, firstName?: string) => void;
  clearCheckOverlay: () => void;
  showFirstBanOnboarding: boolean;
  completeFirstBan: () => void;
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
): BanInteraction | null {
  if (!isValidIncomingOverlayPayload(ban)) return null;
  if (dismissed.has(ban!.id)) return null;
  return ban!;
}

function applySessionToState(
  s: SessionState,
  dismissed: Set<string>,
  setters: {
    setActiveBans: (b: BanInteraction[]) => void;
    setIncomingBan: (b: BanInteraction | null) => void;
    setCheckBan: (b: BanInteraction | null) => void;
    setCheckWaiting: (v: boolean) => void;
    setResult: (r: BanResult | null) => void;
  },
) {
  setters.setActiveBans(Array.isArray(s.active) ? s.active : []);
  setters.setIncomingBan(pickIncomingForOverlay(s.incoming, dismissed));

  if (s.check?.status === 'checking') {
    setters.setCheckBan(s.check);
    setters.setCheckWaiting(false);
  } else if (!s.needsOnboardingRecovery) {
    setters.setCheckBan(null);
    setters.setCheckWaiting(false);
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [incomingBan, setIncomingBan] = useState<BanInteraction | null>(null);
  const [checkBan, setCheckBan] = useState<BanInteraction | null>(null);
  const [checkWaiting, setCheckWaiting] = useState(false);
  const [result, setResult] = useState<BanResult | null>(null);
  const [popups, setPopups] = useState<EnergyPopup[]>([]);
  const [activeBans, setActiveBans] = useState<BanInteraction[]>([]);
  const [friends, setFriends] = useState<FriendCard[]>([]);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendReceiver, setSendReceiver] = useState('');
  const [sendText, setSendText] = useState('');
  const [sendDuration, setSendDuration] = useState(10);
  const [viralOnboarding, setViralOnboarding] = useState(false);
  const [banSentOpen, setBanSentOpen] = useState(false);
  const [optimisticSendWait, setOptimisticSendWait] =
    useState<OptimisticSendWait | null>(null);
  const [firstBanComplete, setFirstBanComplete] = useState(false);

  const dismissedIncomingRef = useRef<Set<string>>(new Set());
  const checkWaitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(auth.token);
  tokenRef.current = auth.token;
  const refreshUserRef = useRef(auth.refreshUser);
  refreshUserRef.current = auth.refreshUser;

  const clearCheckOverlay = useCallback(() => {
    if (checkWaitingTimerRef.current) {
      clearTimeout(checkWaitingTimerRef.current);
      checkWaitingTimerRef.current = null;
    }
    setCheckBan(null);
    setCheckWaiting(false);
  }, []);

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

  const dismissIncoming = useCallback((banId?: string) => {
    if (banId) dismissedIncomingRef.current.add(banId);
    challengeLog('incoming:dismiss', { banId: banId ?? null });
    setIncomingBan(null);
    setViralOnboarding(false);
  }, []);

  const setIncomingBanSafe = useCallback((b: BanInteraction | null) => {
    if (b !== null && !isValidIncomingOverlayPayload(b)) {
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
    setIncomingBan(b);
  }, []);

  const pushPopup = useCallback((p: EnergyPopup) => {
    setPopups((prev) => [...prev, p]);
    setTimeout(() => {
      setPopups((prev) => prev.filter((x) => x.id !== p.id));
    }, 2200);
  }, []);

  const notifySendSuccess = useCallback(
    (username: string, firstName?: string) => {
      clearCheckOverlay();
      const wait = createOptimisticSendWait(username, firstName);
      challengeLog('optimistic-send:set', {
        username: wait.username,
        expiresAt: wait.expiresAt,
      });
      setOptimisticSendWait(wait);
    },
    [clearCheckOverlay],
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

  const applySession = useCallback((s: SessionState) => {
    const nextIncoming = pickIncomingForOverlay(
      s.incoming,
      dismissedIncomingRef.current,
    );
    challengeLog('session:apply', {
      incoming: s.incoming?.id ?? null,
      incomingStatus: s.incoming?.status ?? null,
      overlayIncoming: nextIncoming?.id ?? null,
      active: Array.isArray(s.active) ? s.active.length : 0,
    });
    applySessionToState(s, dismissedIncomingRef.current, {
      setActiveBans,
      setIncomingBan,
      setCheckBan,
      setCheckWaiting,
      setResult,
    });
    if (!nextIncoming) {
      setViralOnboarding(false);
    }
  }, []);

  useEffect(() => {
    if (!auth.boot) return;
    const incoming = pickIncomingForOverlay(
      auth.boot.claimedIncoming,
      dismissedIncomingRef.current,
    );
    if (incoming) {
      challengeLog('boot:claimed-incoming', { banId: incoming.id });
      setIncomingBan(incoming);
      setViralOnboarding(true);
    }
    auth.clearBoot();
  }, [auth.boot, auth.clearBoot]);

  const reloadFriends = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    try {
      const { friends: list } = await api<{ friends: FriendCard[] }>(
        '/friends',
        { token },
      );
      setFriends(coerceFriendList(list));
    } catch {
      /* ignore */
    }
  }, []);

  const reloadPending = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    try {
      const session = await fetchSession(token);
      applySession(session);
      await refreshUserRef.current();
      await api('/analytics/track', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: ANALYTICS_EVENTS.SESSION_RECOVERED,
        }),
      }).catch(() => {});
    } catch {
      /* session endpoint may fail — ignore */
    }
  }, [applySession]);

  const openSendTo = useCallback((receiver: string, text = '') => {
    setSendReceiver(receiver.startsWith('@') ? receiver : `@${receiver}`);
    setSendText(text);
  }, []);

  const { status: wsStatus, eventLog } = useWebSocket(
    auth.token,
    (event) => {
      switch (event.type) {
        case 'ban:incoming': {
          const b = event.payload as BanInteraction;
          const incoming = pickIncomingForOverlay(
            b,
            dismissedIncomingRef.current,
          );
          if (incoming) setIncomingBanSafe(incoming);
          break;
        }
        case 'check:due': {
          const ban = event.payload as BanInteraction;
          if (ban?.status === 'checking') {
            setCheckBan(ban);
            setCheckWaiting(false);
          }
          break;
        }
        case 'check:waiting':
          setCheckWaiting(true);
          scheduleCheckWaitingDismiss();
          break;
        case 'check:completed':
          clearCheckOverlay();
          dismissIncoming();
          setResult(event.payload as BanResult);
          auth.refreshUser();
          break;
        case 'sync:session':
          applySession(event.payload as SessionState);
          break;
        case 'energy:popup':
          pushPopup(event.payload as EnergyPopup);
          auth.refreshUser();
          break;
        case 'ban:updated':
          reloadPending();
          break;
        case 'friends:updated': {
          const payload = event.payload as { friends?: unknown };
          const list = coerceFriendList(payload?.friends);
          setFriends(list);
          resolveOptimisticFromFriends(list);
          break;
        }
      }
    },
    reloadPending,
  );

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

  const reloadPendingRef = useRef(reloadPending);
  reloadPendingRef.current = reloadPending;

  useEffect(() => {
    if (!auth.token) return;
    api<{ friends?: unknown }>('/friends', { token: auth.token })
      .then((r) => {
        const list = coerceFriendList(r?.friends);
        setFriends(list);
        resolveOptimisticFromFriends(list);
      })
      .catch(() => setFriends([]));
    reloadPendingRef.current().catch(() => {});
  }, [auth.token]);

  const contextValue = useMemo(
    () => ({
      token: auth.token,
      user: auth.user,
      loading: auth.loading,
      error: auth.error,
      refreshUser: auth.refreshUser,
      onboard: auth.onboard,
      incomingBan,
      setIncomingBan: setIncomingBanSafe,
      dismissIncoming,
      checkBan,
      setCheckBan,
      checkWaiting,
      setCheckWaiting,
      result,
      setResult,
      popups,
      pushPopup,
      activeBans,
      friends,
      sendOpen,
      setSendOpen,
      sendReceiver,
      setSendReceiver,
      sendText,
      setSendText,
      sendDuration,
      setSendDuration,
      openSendTo,
      applySession,
      reloadPending,
      reloadFriends,
      wsStatus,
      eventLog,
      viralOnboarding,
      banSentOpen,
      setBanSentOpen,
      optimisticSendWait,
      notifySendSuccess,
      clearCheckOverlay,
      showFirstBanOnboarding,
      completeFirstBan,
    }),
    [
      auth.token,
      auth.user,
      auth.loading,
      auth.error,
      auth.refreshUser,
      auth.onboard,
      incomingBan,
      setIncomingBanSafe,
      dismissIncoming,
      checkBan,
      setCheckBan,
      checkWaiting,
      setCheckWaiting,
      result,
      setResult,
      popups,
      pushPopup,
      activeBans,
      friends,
      sendOpen,
      sendReceiver,
      sendText,
      sendDuration,
      openSendTo,
      applySession,
      reloadPending,
      reloadFriends,
      wsStatus,
      eventLog,
      viralOnboarding,
      banSentOpen,
      optimisticSendWait,
      notifySendSuccess,
      clearCheckOverlay,
      showFirstBanOnboarding,
      completeFirstBan,
    ],
  );

  return (
    <AppContext.Provider value={contextValue}>
      <ShellErrorBoundary name="app">
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
