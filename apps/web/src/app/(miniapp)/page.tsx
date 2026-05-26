'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { useApp } from '@/components/Providers';
import { useTelegram } from '@/hooks/useTelegram';
import { useSocialBoot } from '@/hooks/useSocialBoot';
import { HomeArena } from '@/components/HomeArena';
import { SendBanDock } from '@/components/SendBanDock';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { BottomNav, type Tab } from '@/components/BottomNav';
import { ShellErrorBoundary } from '@/components/ShellErrorBoundary';
import { getApiUrl } from '@/lib/config';

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
    <div className="min-h-[100dvh] flex items-center justify-center challenge-bg">
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
    sessionReady,
    incomingGateActive,
    setIncomingBan,
    setCheckBan,
    openBanResult,
    reloadPending,
    banSentOpen,
    wsStatus,
    eventLog,
  } = useApp();
  const { ready } = useTelegram();
  const [tab, setTab] = useState<Tab>('home');
  const [debugOpen, setDebugOpen] = useState(false);
  const [apiUrlDisplay, setApiUrlDisplay] = useState('');

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

  const canRenderShell =
    incomingGateActive || (sessionReady && friendsReady);

  if (!canRenderShell) {
    return <BootLobby />;
  }

  return (
    <div
      className={`app-page${
        incomingGateActive ? ' app-page--incoming-overlay-active' : ''
      }${banSentOpen ? ' app-page--success-modal' : ''}`}
    >
      <ShellErrorBoundary name="ambience" fallback={null}>
        <ArenaAmbience />
      </ShellErrorBoundary>

      <ConnectionBanner status={wsStatus} onRetry={reloadPending} />

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
    </div>
  );
}
