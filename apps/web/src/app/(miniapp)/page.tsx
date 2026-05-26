'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import type { BanResult } from '@98plus/shared';
import {
  acknowledgeBanResultOnServer,
  dismissBanResultLocally,
  shouldShowBanResult,
} from '@/lib/ban-result-flow';
import { isDismissedResultLocally } from '@/lib/dismissed-results';
import { useApp } from '@/components/Providers';
import { useTelegram } from '@/hooks/useTelegram';
import { useSocialBoot } from '@/hooks/useSocialBoot';
import { HomeArena } from '@/components/HomeArena';
import { SendBanDock } from '@/components/SendBanDock';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { BottomNav, type Tab } from '@/components/BottomNav';
import { ShellErrorBoundary } from '@/components/ShellErrorBoundary';
import { fetchSession } from '@/lib/session';
import { backfillAcknowledgedIncomingOnce } from '@/lib/incoming-backfill';
import { api } from '@/lib/api';
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

export default function HomePage() {
  const {
    token,
    user,
    loading,
    error,
    setIncomingBan,
    setCheckBan,
    openBanResult,
    applySession,
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

  const applySessionRef = useRef(applySession);
  applySessionRef.current = applySession;
  const reloadPendingRef = useRef(reloadPending);
  reloadPendingRef.current = reloadPending;
  const openBanResultRef = useRef(openBanResult);
  openBanResultRef.current = openBanResult;

  useEffect(() => {
    if (!token || !ready) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') {
      setDebugOpen(true);
    }

    let cancelled = false;
    const authToken = token;

    async function loadSession() {
      try {
        const uid = user?.id ?? null;
        if (!uid) return;
        await backfillAcknowledgedIncomingOnce(authToken, uid);
        const requestedAt = Date.now();
        console.log('[session-fetch]', {
          authUserId: uid,
          requestedAt,
        });
        const session = await fetchSession(authToken);
        if (cancelled) return;

        console.log('[session-fetch]', {
          authUserId: uid,
          requestedAt,
          responseUserId: (session as any)?.userId ?? null,
          incomingId: (session as any)?.incoming?.id ?? null,
          incomingReceiverId: (session as any)?.incoming?.receiver?.id ?? null,
        });

        applySessionRef.current(session);

        if (session.pendingResultId) {
          const pendingId = session.pendingResultId;
          if (isDismissedResultLocally(pendingId)) {
            void acknowledgeBanResultOnServer(pendingId, authToken);
          } else {
            try {
              const { result: pendingResult } = await api<{ result: BanResult }>(
                `/bans/${pendingId}/result`,
                { token: authToken },
              );
              if (!cancelled && pendingResult) {
                if (shouldShowBanResult(pendingResult, 'auto', pendingId)) {
                  openBanResultRef.current(pendingResult, 'auto');
                } else {
                  dismissBanResultLocally(pendingId);
                  void acknowledgeBanResultOnServer(pendingId, authToken);
                }
              }
            } catch {
              /* result not ready */
            }
          }
        }
      } catch {
        if (!cancelled) {
          reloadPendingRef.current();
        }
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [token, ready, user?.id]);

  useEffect(() => {
    if (!token) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        reloadPendingRef.current();
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [token]);

  if (loading || !user?.id || !token) {
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

  return (
    <div
      className={`app-page${banSentOpen ? ' app-page--success-modal' : ''}`}
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
