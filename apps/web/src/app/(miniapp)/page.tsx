'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import dynamic from 'next/dynamic';
import { useApp } from '@/components/Providers';
import { useTelegram } from '@/hooks/useTelegram';
import { useSocialBoot } from '@/hooks/useSocialBoot';
import { HomeArena } from '@/components/HomeArena';
import { InstantBanFlow } from '@/components/instant-ban/InstantBanFlow';
import { SendBanDock } from '@/components/SendBanDock';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { BottomNav, type Tab } from '@/components/BottomNav';
import { ShellErrorBoundary } from '@/components/ShellErrorBoundary';
import { getApiUrl } from '@/lib/config';
import {
  logLobbyInfluenceDebug,
  resolveLobbyInfluencePercent,
} from '@/lib/lobby-influence';
import { instantBanDebug } from '@/lib/instant-ban-debug';
import {
  getDeepLinkBootDebug,
  subscribeDeepLinkBootDebug,
} from '@/lib/deep-link-boot-debug';
import {
  formatOverboardFlowTraceLines,
  getOverboardFlowTrace,
  subscribeOverboardFlowTrace,
} from '@/lib/overboard-flow-debug';
import {
  formatResultOpenTraceLines,
  getResultOpenTrace,
  subscribeResultOpenTrace,
} from '@/lib/result-open-trace';

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
const APP_SHELL_BUILD = 'arena-v2@overboard-diag-v43';

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
    overlayHandoffDebug,
    overlayQueueLength,
    deepLinkSelectedBanId,
    sendFlowOpen,
    deepLinkReplyBooting,
    setDeepLinkReplyBooting,
    activeOverlayKind,
    replyUiShellActive,
    replyUiShellDark,
    replyDeepLinkBanId,
    replyToBanId,
    replyComposeActive,
    replyHandoffLock,
    armReplyDeepLink,
    activeBanUiShellActive,
    resultReplyPending,
    replyDeeplinkFastShell,
    abortReplyDeepLinkFast,
  } = useApp();
  const overlayHandoffDbgVisible =
    process.env.NODE_ENV === 'development' && overlayHandoffDebug != null;
  const { ready, webApp, startParam } = useTelegram();
  const deepLinkBoot = useSyncExternalStore(
    subscribeDeepLinkBootDebug,
    getDeepLinkBootDebug,
    getDeepLinkBootDebug,
  );
  const overboardTrace = useSyncExternalStore(
    subscribeOverboardFlowTrace,
    getOverboardFlowTrace,
    getOverboardFlowTrace,
  );
  const resultOpenTrace = useSyncExternalStore(
    subscribeResultOpenTrace,
    getResultOpenTrace,
    getResultOpenTrace,
  );
  const overboardTraceLine = useMemo(
    () =>
      overboardTrace.events.length > 0
        ? formatOverboardFlowTraceLines(overboardTrace)
        : null,
    [overboardTrace],
  );
  const [tab, setTab] = useState<Tab>('home');
  const [debugOpen, setDebugOpen] = useState(false);
  const [instantBanOpen, setInstantBanOpen] = useState(false);
  const [apiUrlDisplay, setApiUrlDisplay] = useState('');
  const [shellDebugLine, setShellDebugLine] = useState<string | null>(null);

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

  /** Parent layout effect runs before InstantBanFlow effects — latch send UI early. */
  const shellBlocksLobbyClose =
    bansCtaQueueSuppress || bansReturnToLobbyLatch;

  useLayoutEffect(() => {
    if (shellBlocksLobbyClose) return;
    if (replyDeepLinkLobbyHidden) closeLobby();
  }, [shellBlocksLobbyClose, replyDeepLinkLobbyHidden, closeLobby]);

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

  useEffect(() => {
    if (!lobbyOpen) return;
    logLobbyInfluenceDebug(user, lobbyInfluence);
  }, [lobbyOpen, user, lobbyInfluence.influencePercent, lobbyInfluence.fromFallback]);

  const hasAuthSession = !!user?.id && !!token;
  const resultOpenTraceLine = useMemo(() => {
    if (resultOpenTrace.length === 0) {
      return hasAuthSession
        ? '[RESULT OPEN TRACE] (empty — ждём [RESULT OPEN ATTEMPT])'
        : null;
    }
    return `[RESULT OPEN TRACE — last ${resultOpenTrace.length}]\n${formatResultOpenTraceLines(resultOpenTrace)}`;
  }, [resultOpenTrace, hasAuthSession]);
  const lobbyPrefetch = loading && !hasAuthSession;
  /** v2 arena shell — never drop to legacy HomeArena while session is active. */
  const arenaVisible = lobbyPrefetch || hasAuthSession;
  const legacyHomeVisible = hasAuthSession && !arenaVisible;
  const shellModeForDebug = !arenaVisible
    ? 'legacy-home'
    : sendStarted
      ? 'arena-send'
      : lobbyOpen
        ? 'arena-lobby'
        : 'arena-deep-link';

  const deepLinkDebugLine = useMemo(
    () =>
      `[DEEP LINK DEBUG]\nstartParamRaw: ${deepLinkBoot.startParamRaw ?? '—'}\nstartParamResolved: ${deepLinkBoot.startParamResolved ?? '—'}\nparsedType: ${deepLinkBoot.parsedType ?? '—'}\nparsedBanId: ${deepLinkBoot.parsedBanId ?? '—'}\ndeepLinkDetected: ${deepLinkBoot.deepLinkDetected}\ndeepLinkConsumed: ${deepLinkBoot.deepLinkConsumed}\nbootBlocker: ${deepLinkBoot.bootBlocker ?? '—'}\nlastHandler: ${deepLinkBoot.lastHandler ?? '—'}\ninstantBanOpen: ${instantBanOpen}\nsendFlowOpen: ${sendFlowOpen}\nsendStarted: ${sendStarted}\nreplyComposeActive: ${replyComposeActive}\nreplyToBanId: ${replyToBanId ?? '—'}\nactiveOverlayKind: ${activeOverlayKind ?? '—'}\nselectedBanId: ${deepLinkSelectedBanId ?? '—'}\noverlayQueueLength: ${overlayQueueLength}\nincomingGateActive: ${incomingGateActive}\nreplyUiShellActive: ${replyUiShellActive}\nreplyUiShellDark: ${replyUiShellDark}\nreplyDeeplinkFastShell: ${replyDeeplinkFastShell}\nreplyIncomingReady: ${replyIncomingReady}\nreplyHandoffLock: ${replyHandoffLock}`,
    [
      deepLinkBoot,
      instantBanOpen,
      sendFlowOpen,
      sendStarted,
      activeOverlayKind,
      deepLinkSelectedBanId,
      overlayQueueLength,
      incomingGateActive,
      replyUiShellActive,
      replyUiShellDark,
      replyDeeplinkFastShell,
      replyIncomingReady,
      replyHandoffLock,
      replyComposeActive,
      replyToBanId,
    ],
  );

  const showDeepLinkDebug =
    Boolean(deepLinkBoot.startParamRaw) ||
    Boolean(deepLinkBoot.startParamResolved) ||
    Boolean(startParam) ||
    hasAuthSession;

  useEffect(() => {
    if (!hasAuthSession) {
      setShellDebugLine(null);
      return;
    }
    setShellDebugLine(
      `[SHELL DEBUG]\nbuild: ${APP_SHELL_BUILD}\nhost: ${window.location.host}\nhref: ${window.location.href}\nstartParam: ${startParam ?? webApp?.initDataUnsafe?.start_param ?? '—'}\nmode: ${shellModeForDebug}\nroute: /(miniapp)\nlobbyOpen: ${lobbyOpen}\ninstantBanOpen: ${instantBanOpen}\nsendFlowOpen: ${sendFlowOpen}\narenaVisible: ${arenaVisible}\nlegacyHome: ${legacyHomeVisible}`,
    );
  }, [
    hasAuthSession,
    startParam,
    webApp,
    shellModeForDebug,
    lobbyOpen,
    instantBanOpen,
    sendFlowOpen,
    arenaVisible,
    legacyHomeVisible,
  ]);

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
    const showTgAuthDebug = error?.includes('Нет связи с API') ?? false;
    const tgAuthDebug = showTgAuthDebug
      ? {
          hasTelegram:
            typeof window !== 'undefined' ? !!window.Telegram : false,
          hasWebApp: !!webApp,
          platform: webApp?.platform ?? null,
          initDataLength: webApp?.initData?.length ?? 0,
          startParam:
            webApp?.initDataUnsafe?.start_param ?? startParam ?? null,
          'error.message': error ?? null,
        }
      : null;

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
        {tgAuthDebug ? (
          <div className="px-4 pb-6 pt-2 w-full max-w-sm mx-auto">
            <p className="text-[10px] leading-relaxed text-muted/55 font-mono text-left whitespace-pre-wrap break-all">
              {`[TG AUTH DEBUG]\nhasTelegram: ${tgAuthDebug.hasTelegram}\nhasWebApp: ${tgAuthDebug.hasWebApp}\nplatform: ${tgAuthDebug.platform ?? '—'}\ninitDataLength: ${tgAuthDebug.initDataLength}\nstartParam: ${tgAuthDebug.startParam ?? '—'}\nerror.message: ${tgAuthDebug['error.message'] ?? '—'}`}
            </p>
          </div>
        ) : null}
        {showDeepLinkDebug ? (
          <div className="px-4 pb-6 pt-2 w-full max-w-sm mx-auto">
            <p className="text-[9px] leading-snug text-muted/45 font-mono text-left whitespace-pre-wrap break-all">
              {deepLinkDebugLine}
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  const shellView = lobbyPrefetch ? 'LobbyPrefetch' : 'HomeShell';

  return (
    <div
      className={`app-page min-h-[100dvh]${
        incomingGateActive ? ' app-page--incoming-overlay-active' : ''
      }${
        checkGateActive ? ' app-page--check-overlay-active' : ''
      }${banSentOpen ? ' app-page--success-modal' : ''}${
        replyUiShellDark ? ' app-page--reply-deeplink-loading' : ''
      }${
        replyUiShellActive ? ' app-page--reply-ui-shell' : ''
      }${
        activeBanUiShellActive ? ' app-page--active-ban-deeplink-loading' : ''
      }${
        arenaVisible ? ' app-page--instant-ban-active' : ''
      }`}
      data-shell-view={shellView}
      data-shell-mode={shellModeForDebug}
      data-shell-build={APP_SHELL_BUILD}
    >
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

      {!lobbyPrefetch ? (
        <BottomNav tab={tab} onChange={setTab} />
      ) : null}

      <div className="fixed right-4 z-30 above-bottom-chrome flex flex-col items-end gap-0.5">
        {overlayHandoffDbgVisible ? (
          <div
            className="text-[10px] text-muted/50 font-mono text-right leading-tight pointer-events-none"
            aria-hidden
          >
            <div>delay: {overlayHandoffDebug.delayMs}ms</div>
            <div>cause: {overlayHandoffDebug.cause}</div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setDebugOpen(true)}
          className="text-[10px] text-muted/40 pointer-events-auto"
        >
          dbg
        </button>
      </div>

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

      {arenaVisible ? (
        <InstantBanFlow
          sendStarted={sendStarted}
          onStartSend={handleLobbyEnter}
          influencePercent={
            hasAuthSession ? lobbyInfluence.influencePercent : 0
          }
          energyLoaded={hasAuthSession && !lobbyInfluence.fromFallback}
          inviteUsername={user?.username ?? null}
          onClose={handleCloseInstantBan}
        />
      ) : null}

      {overboardTrace.emergencyHint ? (
        <div
          className="fixed top-16 left-0 right-0 z-[120] flex justify-center px-4 pointer-events-none"
          role="status"
        >
          <p className="rounded-2xl bg-card/95 border border-white/10 px-4 py-2 text-sm text-muted shadow-glow">
            {overboardTrace.emergencyHint}
          </p>
        </div>
      ) : null}

      {shellDebugLine ||
      showDeepLinkDebug ||
      overboardTraceLine ||
      (hasAuthSession && resultOpenTraceLine) ? (
        <div
          className="fixed bottom-0 left-0 right-0 z-[9999] px-2 pb-2 pointer-events-none"
          aria-hidden
        >
          {resultOpenTraceLine ? (
            <p className="text-[8px] leading-snug text-lime-300/90 font-mono text-left whitespace-pre-wrap break-all max-h-[36dvh] overflow-y-auto mb-1">
              {resultOpenTraceLine}
            </p>
          ) : null}
          {overboardTraceLine ? (
            <p className="text-[8px] leading-snug text-amber-300/80 font-mono text-left whitespace-pre-wrap break-all max-h-[32dvh] overflow-y-auto mb-1">
              {overboardTraceLine}
            </p>
          ) : null}
          {shellDebugLine ? (
            <p className="text-[9px] leading-snug text-muted/45 font-mono text-left whitespace-pre-wrap break-all max-h-[14dvh] overflow-hidden">
              {shellDebugLine}
            </p>
          ) : null}
          {showDeepLinkDebug ? (
            <p className="text-[9px] leading-snug text-muted/45 font-mono text-left whitespace-pre-wrap break-all max-h-[28dvh] overflow-hidden">
              {deepLinkDebugLine}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

