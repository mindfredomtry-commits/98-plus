'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import dynamic from 'next/dynamic';
import { useApp } from '@/components/Providers';
import {
  isDeepLinkRouteBootPending,
  subscribeDeepLinkRouteBoot,
} from '@/lib/deep-link-route-boot';
import { useBootRouteRelease } from '@/hooks/useBootRouteRelease';
import { useTelegram } from '@/hooks/useTelegram';
import { useSocialBoot } from '@/hooks/useSocialBoot';
import { BootHandoffDebugBadge } from '@/components/BootHandoffDebugBadge';
import { PillSourceDebugBadge } from '@/components/PillSourceDebugBadge';
import { HomeArena } from '@/components/HomeArena';
import { NotificationOwnerHost } from '@/notification-owner/NotificationOwnerHost';
import { useBootSceneIntro } from '@/components/instant-ban/useBootSceneIntro';
import { SendBanDock } from '@/components/SendBanDock';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { BottomNav, type Tab } from '@/components/BottomNav';
import { ShellErrorBoundary } from '@/components/ShellErrorBoundary';
import { getApiUrl } from '@/lib/config';
import { logBootGate } from '@/lib/boot-gate-diag';
import {
  logLobbyInfluenceDebug,
  resolveLobbyInfluencePercent,
} from '@/lib/lobby-influence';
import { isLobbyBootIntroPrimed, subscribeLobbyBootIntroSession } from '@/lib/lobby-boot-intro-session';
import { patchBootHandoffDebug } from '@/lib/boot-handoff-debug';
import { instantBanDebug } from '@/lib/instant-ban-debug';
import {
  getDeepLinkBootDebug,
  subscribeDeepLinkBootDebug,
} from '@/lib/deep-link-boot-debug';

const ArenaAmbience = dynamic(
  () =>
    import('@/components/ArenaAmbience').then((m) => ({
      default: m.ArenaAmbience,
    })),
  { ssr: false },
);

const ChallengeOverlays = dynamic(
  () =>
    import('@/components/ChallengeOverlays').then((m) => ({
      default: m.ChallengeOverlays,
    })),
  { ssr: false },
);

const DebugPanel = dynamic(
  () =>
    import('@/components/DebugPanel').then((m) => ({
      default: m.DebugPanel,
    })),
  { ssr: false },
);

/** Bump when diagnosing shell / deploy mismatches. */
const APP_SHELL_BUILD = 'arena-v2@confirm-hold-orb-split-v55';

export default function HomePage() {
  const {
    token,
    user,
    loading,
    error,
    friendsReady,
    homeSnapshotReady,
    sessionReady,
    incomingGateActive,
    checkGateActive,
    lobbyOpen,
    closeLobby,
    newBanWhoFlowRequest,
    openBansOverlayRequest,
    bansCtaQueueSuppress,
    bansReturnToLobbyLatch,
    closeSendFlow,
    setIncomingBan,
    openDeepLinkCheck,
    openDeepLinkRepeat,
    openDeepLinkInviteToBan,
    openDeepLinkReply,
    openDeepLinkActive,
    armActiveBanDeepLinkEarly,
    deepLinkRepeatBan,
    deepLinkReplyBan,
    deepLinkActiveBan,
    openBanResult,
    reloadPending,
    banSentOpen,
    wsStatus,
    connectionUiState,
    eventLog,
    deepLinkSelectedBanId,
    sendFlowOpen,
    deepLinkReplyBooting,
    setDeepLinkReplyBooting,
    activeOverlayKind,
    replyUiShellActive,
    replyUiShellDark,
    replyDeepLinkBanId,
    armReplyDeepLink,
    activeBanUiShellActive,
    resultReplyPending,
    replyDeeplinkFastShell,
    abortReplyDeepLinkFast,
    incomingCardFullyReady,
    incomingCardDisplayBan,
    routeOverlayAboveBoot,
    replyHandoffLock,
    replyComposeActive,
    checkDeepLinkBanId,
    checkOverlayMounted,
    checkDeeplinkDirectPending,
  } = useApp();
  const { ready } = useTelegram();
  const deepLinkRouteBootPending = useSyncExternalStore(
    subscribeDeepLinkRouteBoot,
    isDeepLinkRouteBootPending,
    () => false,
  );
  const hasAuthSession = !!user?.id && !!token;
  const lobbyPrefetch = loading && !hasAuthSession;
  /** v2 arena shell — never drop to legacy HomeArena while session is active. */
  const arenaVisible = lobbyPrefetch || hasAuthSession;
  const lobbyBootIntroDone = useSyncExternalStore(
    subscribeLobbyBootIntroSession,
    isLobbyBootIntroPrimed,
    () => false,
  );
  /** SSR + hydration: auth starts loading=true, deeplink boot pending=false. */
  const showBootScreen = useSyncExternalStore(
    subscribeDeepLinkRouteBoot,
    () => loading || deepLinkRouteBootPending,
    () => true,
  );

  useEffect(() => {
    if (showBootScreen) {
      logBootGate('BOOT_GATE_APP_SCREEN_BLOCKED', {
        userId: user?.id ?? null,
        telegramId: user?.telegramId ?? null,
        authStatus: loading ? 'loading' : 'ready',
        blockingGate: loading
          ? 'auth.loading'
          : deepLinkRouteBootPending
            ? 'deepLinkRouteBootPending'
            : 'showBootScreen',
      });
    } else {
      logBootGate('BOOT_GATE_APP_SCREEN_RELEASED', {
        userId: user?.id ?? null,
        telegramId: user?.telegramId ?? null,
        authStatus: 'ready',
        blockingGate: null,
      });
    }
  }, [showBootScreen, loading, deepLinkRouteBootPending, user?.id, user?.telegramId]);

  useLayoutEffect(() => {
    patchBootHandoffDebug({
      showBottomNav: !lobbyPrefetch && lobbyBootIntroDone,
    });
  }, [lobbyBootIntroDone, lobbyPrefetch]);
  const replyDeeplinkPending =
    !replyComposeActive &&
    !incomingCardFullyReady &&
    Boolean(
      replyDeepLinkBanId ||
        deepLinkReplyBan ||
        replyDeeplinkFastShell ||
        deepLinkReplyBooting ||
        replyHandoffLock ||
        replyUiShellActive,
    );
  useBootRouteRelease(showBootScreen, deepLinkRouteBootPending, {
    incomingCardReady: incomingCardFullyReady,
    incomingBanId: incomingCardDisplayBan?.id ?? null,
    checkOverlayReady: activeOverlayKind === 'check' && checkGateActive,
    checkBanId: deepLinkSelectedBanId,
    resultOverlayReady: activeOverlayKind === 'result',
    resultBanId:
      activeOverlayKind === 'result' ? deepLinkSelectedBanId : null,
    repeatReady: deepLinkRepeatBan != null,
    repeatBanId: deepLinkRepeatBan?.id ?? null,
    activeBanReady: deepLinkActiveBan != null,
    activeBanId: deepLinkActiveBan?.id ?? null,
  });
  const deepLinkBoot = useSyncExternalStore(
    subscribeDeepLinkBootDebug,
    getDeepLinkBootDebug,
    getDeepLinkBootDebug,
  );
  const [tab, setTab] = useState<Tab>('home');
  const [debugOpen, setDebugOpen] = useState(false);
  const [instantBanOpen, setInstantBanOpen] = useState(false);
  const [apiUrlDisplay, setApiUrlDisplay] = useState('');

  const handleCloseInstantBan = useCallback(() => {
    setInstantBanOpen(false);
    closeSendFlow();
  }, [closeSendFlow]);

  useSocialBoot({
    token,
    userId: user?.id ?? null,
    ready,
    setIncomingBan,
    openDeepLinkCheck,
    openDeepLinkRepeat,
    openDeepLinkInviteToBan,
    openDeepLinkReply,
    openDeepLinkActive,
    armActiveBanDeepLinkEarly,
    openBanResult,
    reloadPending,
    setDeepLinkReplyBooting,
    armReplyDeepLink,
    replyDeeplinkFastShell,
    replyDeepLinkBanId,
    abortReplyDeepLinkFast,
  });

  const sendStarted = instantBanOpen || sendFlowOpen;
  const replyTargetBanId = replyDeepLinkBanId ?? deepLinkBoot.parsedBanId;
  const replyIncomingReady =
    activeOverlayKind === 'incoming' &&
    replyTargetBanId != null &&
    deepLinkSelectedBanId === replyTargetBanId;
  /** Block lobby only after incoming card is actually mounted for reply deeplink. */
  const replyDeepLinkLobbyHidden =
    replyIncomingReady || activeBanUiShellActive;

  const checkDeepLinkLobbyHidden =
    Boolean(checkDeepLinkBanId) &&
    (checkOverlayMounted || checkDeeplinkDirectPending);

  /** Reply deeplink incoming card is top layer — suppress page dim/blur shells. */
  const replyIncomingDirectDimSuppressed =
    Boolean(replyDeepLinkBanId) && incomingCardFullyReady;

  /** Check deeplink card is top layer — suppress page dim/blur shells. */
  const checkDirectDimSuppressed =
    Boolean(checkDeepLinkBanId) &&
    (checkOverlayMounted || checkDeeplinkDirectPending);

  /** Parent layout effect latches send UI early. */
  const shellBlocksLobbyClose =
    bansCtaQueueSuppress || bansReturnToLobbyLatch;

  useLayoutEffect(() => {
    if (shellBlocksLobbyClose) return;
    if (replyDeepLinkLobbyHidden || checkDeepLinkLobbyHidden) closeLobby();
  }, [shellBlocksLobbyClose, replyDeepLinkLobbyHidden, checkDeepLinkLobbyHidden, closeLobby]);

  useLayoutEffect(() => {
    if (shellBlocksLobbyClose) return;
    if (!deepLinkRepeatBan && !deepLinkReplyBan && !deepLinkActiveBan) return;
    closeLobby();
    setInstantBanOpen(true);
  }, [
    shellBlocksLobbyClose,
    deepLinkRepeatBan,
    deepLinkReplyBan,
    deepLinkActiveBan,
    closeLobby,
  ]);

  useLayoutEffect(() => {
    if (shellBlocksLobbyClose) return;
    if (!resultReplyPending) return;
    closeLobby();
    setInstantBanOpen(true);
  }, [shellBlocksLobbyClose, resultReplyPending, closeLobby]);

  useEffect(() => {
    setApiUrlDisplay(getApiUrl());
  }, []);

  useEffect(() => {
    if (!token || !ready) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') {
      setDebugOpen(true);
    }
  }, [token, ready]);

  useEffect(() => {
    if (!token) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        reloadPending();
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [token, reloadPending]);

  const lobbyInfluence = resolveLobbyInfluencePercent(user);
  // Side-effect only: primes lobby boot intro session for chrome timing.
  useBootSceneIntro(
    hasAuthSession ? lobbyInfluence.influencePercent : 0,
    hasAuthSession && !lobbyInfluence.fromFallback,
  );

  useEffect(() => {
    if (!lobbyOpen) return;
    logLobbyInfluenceDebug(user, lobbyInfluence);
  }, [lobbyOpen, user, lobbyInfluence.influencePercent, lobbyInfluence.fromFallback]);


  const legacyHomeVisible = hasAuthSession && !arenaVisible;
  const shellModeForDebug = !arenaVisible
    ? 'legacy-home'
    : sendStarted
      ? 'arena-send'
      : lobbyOpen
        ? 'arena-lobby'
        : 'arena-deep-link';

  const handleLobbyEnter = useCallback(() => {
    closeLobby();
    setInstantBanOpen(true);
  }, [closeLobby]);

  useEffect(() => {
    if (shellBlocksLobbyClose) return;
    if (newBanWhoFlowRequest > 0) {
      setInstantBanOpen(true);
    }
  }, [shellBlocksLobbyClose, newBanWhoFlowRequest]);

  useLayoutEffect(() => {
    if (openBansOverlayRequest === 0) return;
    setInstantBanOpen(false);
    closeSendFlow();
  }, [openBansOverlayRequest, closeSendFlow]);

  useLayoutEffect(() => {
    if (!bansReturnToLobbyLatch) return;
    setInstantBanOpen(false);
    closeSendFlow();
  }, [bansReturnToLobbyLatch, closeSendFlow]);

  useEffect(() => {
    console.log('SHELL_RENDER_BRANCH', {
      shellMode: shellModeForDebug,
      lobbyOpen,
      activeOverlayKind,
      checkDeepLinkBanId,
      replyDeepLinkBanId,
      instantBanOpen,
    });
  }, [
    shellModeForDebug,
    lobbyOpen,
    activeOverlayKind,
    checkDeepLinkBanId,
    replyDeepLinkBanId,
    instantBanOpen,
  ]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (lobbyPrefetch) {
      instantBanDebug('shell-view', { view: 'LobbyPrefetch' });
      return;
    }
    if (error || (!loading && !user)) {
      instantBanDebug('shell-view', { view: 'Error' });
      return;
    }
    instantBanDebug('shell-view', {
      view: 'HomeShell',
      lobbyOpen,
      instantBanOpen,
      homeSnapshotReady,
      sessionReady,
      friendsReady,
    });
  }, [
    lobbyPrefetch,
    loading,
    user?.id,
    token,
    error,
    user,
    lobbyOpen,
    instantBanOpen,
    homeSnapshotReady,
    sessionReady,
    friendsReady,
  ]);

  if (error || (!loading && !user)) {
    return (
      <div className="min-h-[100dvh] flex flex-col challenge-bg">
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center gap-4">
          <p className="text-4xl text-glow">98+</p>
          <p className="text-muted text-sm whitespace-pre-wrap max-w-sm">
            {error ?? 'Открой через Telegram'}
          </p>
          {apiUrlDisplay ? (
            <p className="text-xs text-muted/70 break-all max-w-sm">
              API: {apiUrlDisplay}
            </p>
          ) : null}
          <button
            type="button"
            className="text-accent underline"
            onClick={() => window.location.reload()}
          >
            Обновить
          </button>
        </div>
      </div>
    );
  }

  const shellView = lobbyPrefetch ? 'LobbyPrefetch' : 'HomeShell';

  return (
    <div
      className={`app-page min-h-[100dvh]${
        incomingGateActive && !replyIncomingDirectDimSuppressed
          ? ' app-page--incoming-overlay-active'
          : ''
      }${
        checkGateActive && !checkDirectDimSuppressed
          ? ' app-page--check-overlay-active'
          : ''
      }${banSentOpen ? ' app-page--success-modal' : ''}${
        replyUiShellDark && !replyIncomingDirectDimSuppressed
          ? ' app-page--reply-deeplink-loading'
          : ''
      }${
        replyUiShellActive && !replyIncomingDirectDimSuppressed
          ? ' app-page--reply-ui-shell'
          : ''
      }${
        activeBanUiShellActive ? ' app-page--active-ban-deeplink-loading' : ''
      }${
        arenaVisible ? ' app-page--instant-ban-active' : ''
      }${
        replyDeeplinkPending && !replyIncomingDirectDimSuppressed
          ? ' app-page--reply-deeplink-pending'
          : ''
      }${showBootScreen ? ' app-page--boot-active' : ''}`}
      data-shell-view={shellView}
      data-shell-mode={shellModeForDebug}
      data-shell-build={APP_SHELL_BUILD}
    >
      <PillSourceDebugBadge />
      <BootHandoffDebugBadge />

      <ShellErrorBoundary name="ambience" fallback={null}>
        <ArenaAmbience />
      </ShellErrorBoundary>

      {!lobbyPrefetch ? (
        <ConnectionBanner state={connectionUiState} onRetry={reloadPending} />
      ) : null}

      {!lobbyPrefetch ? (
        <main
          className={`app-main challenge-bg ${
            tab === 'home'
              ? 'app-main--with-cta app-main--compact-home'
              : 'app-main--nav-only'
          }`}
        >
          {tab === 'home' && user && legacyHomeVisible ? (
            <ShellErrorBoundary name="home">
              <HomeArena user={user} />
            </ShellErrorBoundary>
          ) : user ? (
            <div className="pt-12 pb-8">
              <p className="text-muted text-sm text-center py-8">
                @{user.username ?? user.firstName}
              </p>
            </div>
          ) : null}
        </main>
      ) : null}

      {!lobbyPrefetch && legacyHomeVisible ? (
        <ShellErrorBoundary name="cta" fallback={null}>
          <SendBanDock visible={tab === 'home'} />
        </ShellErrorBoundary>
      ) : null}

      {!lobbyPrefetch && arenaVisible ? (
        <BottomNav tab={tab} onChange={setTab} />
      ) : null}

      <ShellErrorBoundary name="overlays" fallback={null}>
        <ChallengeOverlays />
      </ShellErrorBoundary>

      {token ? (
        <DebugPanel
          token={token}
          userId={user?.id}
          wsStatus={wsStatus}
          eventLog={eventLog}
          open={debugOpen}
          onClose={() => setDebugOpen(false)}
        />
      ) : null}

      {arenaVisible ? <NotificationOwnerHost /> : null}

    </div>
  );
}

