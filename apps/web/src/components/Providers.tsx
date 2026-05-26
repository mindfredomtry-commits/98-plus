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
  ResultOpenMode,
} from '@98plus/shared';
import { isValidBanResultPayload } from '@98plus/shared';
import {
  ANALYTICS_EVENTS,
  coerceFriendList,
  formatSenderDisplayName,
} from '@98plus/shared';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { EnergyPopupStack } from './EnergyPopupStack';
import { ShellErrorBoundary } from './ShellErrorBoundary';
import { resetScrollLock } from '@/lib/scroll-lock';
import { fetchSession } from '@/lib/session';
import { api } from '@/lib/api';
import { challengeLog } from '@/lib/challenge-log';
import {
  isValidIncomingOverlayPayload,
  shouldShowIncomingBanModal,
} from '@/lib/incoming-challenge';
import { acknowledgeIncomingBan } from '@/lib/incoming-ack-flow';
import { hydrateAcknowledgedIncomingIds } from '@/lib/acknowledged-incoming';
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
import { readFriendsCache, writeFriendsCache } from '@/lib/friends-cache';
import { timingLog, timingStart } from '@/lib/timing-log';
import {
  acknowledgeBanResultOnServer,
  dismissBanResultLocally,
  shouldShowBanResult,
} from '@/lib/ban-result-flow';
import { isDismissedResultLocally } from '@/lib/dismissed-results';

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
  eventLog: string[];
  viralOnboarding: boolean;
  banSentOpen: boolean;
  setBanSentOpen: (v: boolean) => void;
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
  return ban!;
}

function applySessionToState(
  s: SessionState,
  dismissed: Set<string>,
  viewerId: string | null | undefined,
  setters: {
    setActiveBans: (b: BanInteraction[]) => void;
    setIncomingBan: (b: BanInteraction | null) => void;
    setCheckBan: (b: BanInteraction | null) => void;
    setCheckWaiting: (v: boolean) => void;
  },
) {
  setters.setActiveBans(Array.isArray(s.active) ? s.active : []);
  setters.setIncomingBan(pickIncomingForOverlay(s.incoming, dismissed, viewerId));

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
  const [friends, setFriends] = useState<FriendCard[]>(() => {
    if (typeof window === 'undefined') return [];
    const cached = readFriendsCache();
    if (cached.length > 0) {
      timingLog('friends cache hit on init', 0, cached.length);
    }
    return cached;
  });
  const [sendOpen, setSendOpen] = useState(false);
  const [sendReceiver, setSendReceiver] = useState('');
  const [sendText, setSendText] = useState('');
  const [sendDuration, setSendDuration] = useState(10);
  const [incomingReplyBanId, setIncomingReplyBanId] = useState<string | null>(
    null,
  );
  const [viralOnboarding, setViralOnboarding] = useState(false);
  const [banSentOpen, setBanSentOpen] = useState(false);
  const [optimisticSendWait, setOptimisticSendWait] =
    useState<OptimisticSendWait | null>(null);
  const [firstBanComplete, setFirstBanComplete] = useState(false);
  const [inlineBanError, setInlineBanError] = useState<string | null>(null);
  const [banInputShake, setBanInputShake] = useState(false);

  const triggerBanInputShake = useCallback(() => {
    setBanInputShake(true);
    window.setTimeout(() => setBanInputShake(false), 500);
  }, []);

  const dismissedIncomingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const id of hydrateAcknowledgedIncomingIds()) {
      dismissedIncomingRef.current.add(id);
    }
  }, []);
  const checkWaitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(auth.token);
  tokenRef.current = auth.token;
  const refreshUserRef = useRef(auth.refreshUser);
  refreshUserRef.current = auth.refreshUser;
  const reloadFriendsRef = useRef<() => Promise<void>>(async () => {});

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
    if (banId) {
      dismissedIncomingRef.current.add(banId);
      acknowledgeIncomingBan(banId, tokenRef.current);
    }
    challengeLog('incoming:dismiss', { banId: banId ?? null });
    setIncomingBan(null);
    setViralOnboarding(false);
  }, []);

  const setIncomingBanSafe = useCallback(
    (b: BanInteraction | null) => {
      const viewerId = auth.user?.id;
      if (
        b !== null &&
        !shouldShowIncomingBanModal(
          b,
          viewerId,
          dismissedIncomingRef.current,
        )
      ) {
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
    },
    [auth.user?.id],
  );

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
    const viewerId = auth.user?.id ?? null;
    const nextIncoming = pickIncomingForOverlay(
      s.incoming,
      dismissedIncomingRef.current,
      viewerId,
    );
    challengeLog('session:apply', {
      incoming: s.incoming?.id ?? null,
      incomingStatus: s.incoming?.status ?? null,
      overlayIncoming: nextIncoming?.id ?? null,
      active: Array.isArray(s.active) ? s.active.length : 0,
    });
    const nextActive = Array.isArray(s.active) ? s.active : [];
    applySessionToState(
      { ...s, active: nextActive.filter((b) => !b.id.startsWith('optimistic-ban:')) },
      dismissedIncomingRef.current,
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
  }, [resolveOptimisticFromSession, auth.user?.id]);

  useEffect(() => {
    if (!auth.boot) return;
    const incoming = pickIncomingForOverlay(
      auth.boot.claimedIncoming,
      dismissedIncomingRef.current,
      auth.user?.id ?? null,
    );
    if (incoming) {
      challengeLog('boot:claimed-incoming', { banId: incoming.id });
      setIncomingBan(incoming);
      setViralOnboarding(true);
    }
    auth.clearBoot();
  }, [auth.boot, auth.clearBoot, auth.user?.id]);

  const reloadFriends = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    const end = timingStart('friends fetch');
    try {
      const { friends: list } = await api<{ friends: FriendCard[] }>(
        '/friends',
        { token },
      );
      const safe = coerceFriendList(list);
      writeFriendsCache(safe);
      setFriends(safe);
      resolveOptimisticFromFriends(safe);
      end();
    } catch {
      end();
    }
  }, [resolveOptimisticFromFriends]);

  reloadFriendsRef.current = reloadFriends;

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

  const { status: wsStatus, eventLog } = useWebSocket(
    auth.token,
    (event) => {
      switch (event.type) {
        case 'ban:incoming': {
          const b = event.payload as BanInteraction;
          const incoming = pickIncomingForOverlay(
            b,
            dismissedIncomingRef.current,
            auth.user?.id ?? null,
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
          openBanResult(event.payload as BanResult, 'live');
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
          writeFriendsCache(list);
          setFriends(list);
          resolveOptimisticFromFriends(list);
          break;
        }
      }
    },
    reloadPending,
    openBanResult,
    dismissBanResult,
    clearCheckOverlay,
    dismissIncoming,
    scheduleCheckWaitingDismiss,
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

  const reloadPendingRef = useRef(reloadPending);
  reloadPendingRef.current = reloadPending;

  useEffect(() => {
    if (!auth.token) return;
    const cached = readFriendsCache();
    if (cached.length > 0) {
      setFriends((prev) => (prev.length > 0 ? prev : cached));
      timingLog('friends cache hit on boot', 0, cached.length);
    } else {
      timingLog('friends cache miss on boot', 0);
    }
    const end = timingStart('/friends loaded');
    api<{ friends?: unknown }>('/friends', { token: auth.token })
      .then((r) => {
        const list = coerceFriendList(r?.friends);
        writeFriendsCache(list);
        setFriends(list);
        resolveOptimisticFromFriends(list);
        end();
      })
      .catch(() => {
        end();
        timingLog('friends fetch failed, keeping cache', 0);
      });
    reloadPendingRef.current().catch(() => {});
  }, [auth.token, resolveOptimisticFromFriends]);

  const displayFriends = useMemo(
    () => mergeFriendsWithOptimistic(friends, optimisticSendWait),
    [friends, optimisticSendWait],
  );

  const displayActiveBans = useMemo(
    () => mergeActiveBansWithOptimistic(activeBans, optimisticSendWait),
    [activeBans, optimisticSendWait],
  );

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
      openBanResult,
      dismissBanResult,
      popups,
      pushPopup,
      activeBans: displayActiveBans,
      friends: displayFriends,
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
      incomingReplyBanId,
      clearIncomingReply,
      applySession,
      reloadPending,
      reloadFriends,
      wsStatus,
      eventLog,
      viralOnboarding,
      banSentOpen,
      setBanSentOpen,
      optimisticSendWait,
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
      openBanResult,
      dismissBanResult,
      popups,
      pushPopup,
      displayActiveBans,
      displayFriends,
      sendOpen,
      sendReceiver,
      sendText,
      sendDuration,
      openSendTo,
      startIncomingReply,
      incomingReplyBanId,
      clearIncomingReply,
      applySession,
      reloadPending,
      reloadFriends,
      wsStatus,
      eventLog,
      viralOnboarding,
      banSentOpen,
      optimisticSendWait,
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
