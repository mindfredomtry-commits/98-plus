'use client';

import { useCallback, useEffect, useState } from 'react';
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
    setIncomingBan,
    openDeepLinkCheck,
    openDeepLinkRepeat,
    openDeepLinkReply,
    openDeepLinkActive,
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
  } = useApp();
  const overlayHandoffDbgVisible =
    process.env.NODE_ENV === 'development' && overlayHandoffDebug != null;
  const { ready, webApp, startParam } = useTelegram();
  const [tab, setTab] = useState<Tab>('home');
  const [debugOpen, setDebugOpen] = useState(false);
  const [instantBanOpen, setInstantBanOpen] = useState(false);
  const [apiUrlDisplay, setApiUrlDisplay] = useState('');

  const handleCloseInstantBan = useCallback(() => {
    setInstantBanOpen(false);
  }, []);

  useSocialBoot({
    token,
    userId: user?.id ?? null,
    ready,
    setIncomingBan,
    openDeepLinkCheck,
    openDeepLinkRepeat,
    openDeepLinkReply,
    openDeepLinkActive,
    openBanResult,
    reloadPending,
  });

  useEffect(() => {
    if (!deepLinkRepeatBan && !deepLinkReplyBan && !deepLinkActiveBan) return;
    closeLobby();
    setInstantBanOpen(true);
  }, [deepLinkRepeatBan, deepLinkReplyBan, deepLinkActiveBan, closeLobby]);

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
  const lobbyPrefetch = loading && !hasAuthSession;

  const handleLobbyEnter = useCallback(() => {
    closeLobby();
    setInstantBanOpen(true);
  }, [closeLobby]);

  useEffect(() => {
    if (newBanWhoFlowRequest > 0) {
      setInstantBanOpen(true);
    }
  }, [newBanWhoFlowRequest]);

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
      </div>
    );
  }

  const arenaVisible = lobbyOpen || instantBanOpen || lobbyPrefetch;
  const shellView = lobbyPrefetch ? 'LobbyPrefetch' : 'HomeShell';

  return (
    <div
      className={`app-page min-h-[100dvh]${
        incomingGateActive ? ' app-page--incoming-overlay-active' : ''
      }${
        checkGateActive ? ' app-page--check-overlay-active' : ''
      }${banSentOpen ? ' app-page--success-modal' : ''}${
        arenaVisible ? ' app-page--instant-ban-active' : ''
      }`}
      data-shell-view={shellView}
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
          {tab === 'home' && user ? (
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

      {!lobbyPrefetch ? (
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
          wsStatus={wsStatus}
          eventLog={eventLog}
          open={debugOpen}
          onClose={() => setDebugOpen(false)}
        />
      ) : null}

      {arenaVisible ? (
        <InstantBanFlow
          sendStarted={instantBanOpen}
          onStartSend={handleLobbyEnter}
          influencePercent={
            hasAuthSession ? lobbyInfluence.influencePercent : 0
          }
          energyLoaded={hasAuthSession && !lobbyInfluence.fromFallback}
          inviteUsername={user?.username ?? null}
          onClose={handleCloseInstantBan}
        />
      ) : null}
    </div>
  );
}
