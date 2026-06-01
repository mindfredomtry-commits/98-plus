'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { useApp } from '@/components/Providers';
import { useTelegram } from '@/hooks/useTelegram';
import { useSocialBoot } from '@/hooks/useSocialBoot';
import { HomeArena } from '@/components/HomeArena';
import { LobbyScreen } from '@/components/LobbyScreen';
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

function BootLobby() {
  return (
    <div
      className="min-h-[100dvh] flex items-center justify-center challenge-bg"
      data-shell-view="BootLobby"
    >
      <motion.div
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ repeat: Infinity, duration: 1.2 }}
        className="text-accent text-2xl font-bold text-glow"
      >
        98+
      </motion.div>
    </div>
  );
}

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
    setIncomingBan,
    setCheckBan,
    openBanResult,
    reloadPending,
    banSentOpen,
    wsStatus,
    connectionUiState,
    eventLog,
  } = useApp();
  const { ready } = useTelegram();
  const [tab, setTab] = useState<Tab>('home');
  const [debugOpen, setDebugOpen] = useState(false);
  const [instantBanOpen, setInstantBanOpen] = useState(false);
  const [apiUrlDisplay, setApiUrlDisplay] = useState('');

  const handleCloseInstantBan = useCallback(() => {
    setInstantBanOpen(false);
  }, []);

  useSocialBoot({
    token,
    ready,
    setIncomingBan,
    setCheckBan,
    openBanResult,
    reloadPending,
  });

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

  const canRenderShell =
    incomingGateActive ||
    checkGateActive ||
    homeSnapshotReady ||
    (sessionReady && friendsReady);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (loading || !user?.id || !token) {
      instantBanDebug('shell-view', { view: 'BootLobby-auth' });
      return;
    }
    if (error || !user) {
      instantBanDebug('shell-view', { view: 'Error' });
      return;
    }
    if (!canRenderShell) {
      instantBanDebug('shell-view', { view: 'BootLobby-shell' });
      return;
    }
    instantBanDebug('shell-view', {
      view: 'HomeShell',
      lobbyOpen,
      instantBanOpen,
    });
  }, [
    loading,
    user?.id,
    token,
    error,
    user,
    canRenderShell,
    lobbyOpen,
    instantBanOpen,
  ]);

  if (loading || !user?.id || !token) {
    return <BootLobby />;
  }

  if (error || !user) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center gap-4 challenge-bg">
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
    );
  }

  if (!canRenderShell) {
    return <BootLobby />;
  }

  const overlaysUiActive = !lobbyOpen && !instantBanOpen;

  const handleLobbyEnter = () => {
    closeLobby();
    setInstantBanOpen(true);
  };

  return (
    <div
      className={`app-page${
        incomingGateActive && overlaysUiActive
          ? ' app-page--incoming-overlay-active'
          : ''
      }${
        checkGateActive && overlaysUiActive
          ? ' app-page--check-overlay-active'
          : ''
      }${banSentOpen ? ' app-page--success-modal' : ''}${
        instantBanOpen ? ' app-page--instant-ban-active' : ''
      }`}
      data-shell-view="HomeShell"
    >
      <ShellErrorBoundary name="ambience" fallback={null}>
        <ArenaAmbience />
      </ShellErrorBoundary>

      <ConnectionBanner state={connectionUiState} onRetry={reloadPending} />

      <main
        className={`app-main challenge-bg ${
          tab === 'home'
            ? 'app-main--with-cta app-main--compact-home'
            : 'app-main--nav-only'
        }`}
      >
        {tab === 'home' ? (
          <ShellErrorBoundary name="home">
            <HomeArena user={user} />
          </ShellErrorBoundary>
        ) : (
          <div className="pt-12 pb-8">
            <p className="text-muted text-sm text-center py-8">
              @{user.username ?? user.firstName}
            </p>
          </div>
        )}
      </main>

      <ShellErrorBoundary name="cta" fallback={null}>
        <SendBanDock visible={tab === 'home'} />
      </ShellErrorBoundary>

      <BottomNav tab={tab} onChange={setTab} />

      <button
        type="button"
        onClick={() => setDebugOpen(true)}
        className="fixed right-4 text-[10px] text-muted/40 z-30 above-bottom-chrome pointer-events-auto"
      >
        dbg
      </button>

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

      {lobbyOpen ? (
        <LobbyScreen
          onEnter={handleLobbyEnter}
          influencePercent={lobbyInfluence.influencePercent}
          inviteUsername={user.username ?? null}
        />
      ) : null}
      {instantBanOpen ? (
        <InstantBanFlow onClose={handleCloseInstantBan} />
      ) : null}
    </div>
  );
}
