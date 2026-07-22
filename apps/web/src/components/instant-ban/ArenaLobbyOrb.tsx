'use client';

import { useEffect, useRef } from 'react';
import type { FriendCard, UserPublic } from '@98plus/shared';
import { traceZazhmiRenderSourceDiag } from '@/lib/zazhmi-render-source-debug';
import { logConfirmHoldComponentMounted } from '@/lib/confirm-hold-render-diag';
import { GlobalRelationshipRing } from '../lobby/GlobalRelationshipRing';
import { LobbyOrbFace } from '../lobby/LobbyOrbFace';
import type { GlobalRelationshipOrbRingState } from '@/lib/use-global-relationship-orb';
import { SuccessPayoffReveal } from './SuccessPayoffReveal';
import type { useConfirmOrbController } from './useConfirmOrbController';

type ConfirmOrb = ReturnType<typeof useConfirmOrbController>;

type Props = {
  sendPhase: string;
  confirmActive: boolean;
  orbCompressActive: boolean;
  confirmOrb: ConfirmOrb;
  /** Global Relationship Orb ring — same primitive on lobby / WHAT / CONFIRM / hold. */
  globalRelationshipRing: GlobalRelationshipOrbRingState;
  /** When true, 98+ is rendered by LobbyPersistentLogoSlot — never duplicate in face. */
  suppressOrbFaceTitle?: boolean;
  senderUser: UserPublic | null | undefined;
  selectedUser: FriendCard | null;
  banText: string;
  durationMinutes: number;
  onAgain?: () => void;
};

export function ArenaLobbyOrb({
  sendPhase,
  confirmActive,
  orbCompressActive,
  confirmOrb,
  globalRelationshipRing,
  suppressOrbFaceTitle = false,
  senderUser,
  selectedUser,
  banText,
  durationMinutes,
  onAgain,
}: Props) {
  const debugIdRef = useRef(
    typeof Math.random === 'function'
      ? Math.random().toString(36).slice(2, 9)
      : 'orb',
  );
  const mountLogged = useRef(false);

  const {
    orbBtnRef,
    orbBtnClass,
    payoffActive,
    payoffPhase,
    holdProgress,
    showOrbFace,
    showPayoffContent,
    showPayoffCta,
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
    buttonDisabled,
  } = confirmOrb;

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (!mountLogged.current) {
      mountLogged.current = true;
      console.log('[ArenaLobbyOrb-mount]', debugIdRef.current);
    }
    console.log('[orb-id]', debugIdRef.current, {
      sendPhase,
      confirmActive,
      enterPhase: confirmOrb.enterPhase,
    });
    if (confirmActive) {
      logConfirmHoldComponentMounted({
        source: 'ArenaLobbyOrb',
        component: 'ArenaLobbyOrb',
        confirmActive,
        sendPhase,
        enterPhase: confirmOrb.enterPhase,
        holdPhase: confirmOrb.holdPhase,
        showOrbFace,
        buttonDisabled,
        orbDebugId: debugIdRef.current,
      });
    }
  }, [sendPhase, confirmActive, confirmOrb.enterPhase, confirmOrb.holdPhase, showOrbFace, buttonDisabled]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    return () => {
      console.log('[ArenaLobbyOrb-unmount]', debugIdRef.current);
    };
  }, []);

  const payoffWrap = payoffPhase !== 'none';

  const useLobbyChrome = !confirmActive && !orbCompressActive;
  const hideOrbFaceTitle = suppressOrbFaceTitle || useLobbyChrome;

  if (confirmActive) {
    traceZazhmiRenderSourceDiag({
      file: 'ArenaLobbyOrb.tsx',
      component: 'ArenaLobbyOrb',
      source: 'arena-lobby-orb-confirm-active',
      phase: sendPhase,
      sendComposePhase: null,
      confirmActive,
      statusLabel: 'Зажми 98+ чтобы отправить запрет',
      showLobbyOrb: true,
      lobbyOrbVisible: true,
      queueLen: -1,
      pendingLen: -1,
      overlayQueueLength: -1,
      queueClaimsNotificationScreen: false,
    });
  }

  return (
    <div
      className={`instant-ban-arena-lobby-orb${
        confirmActive ? ' instant-ban-arena-lobby-orb--confirm-active' : ''
      }${payoffWrap ? ' instant-ban-confirm-orb-wrap--payoff' : ''}`}
      data-arena-lobby-orb
      data-debug-orb-id={debugIdRef.current}
    >
      <div className="instant-ban-arena-lobby-orb__stage">
        <button
          ref={orbBtnRef}
          type="button"
          className={orbBtnClass}
          disabled={buttonDisabled}
          aria-label={
            payoffActive
              ? 'Запрет отправлен'
              : confirmActive
                ? 'Зажми 98+ чтобы отправить запрет'
                : '98+'
          }
          onPointerDown={confirmActive ? handlePointerDown : undefined}
          onPointerUp={confirmActive ? handlePointerUp : undefined}
          onPointerCancel={confirmActive ? handlePointerCancel : undefined}
          onPointerLeave={confirmActive ? handlePointerLeave : undefined}
        >
            <LobbyOrbFace
              hidden={!showOrbFace}
              hideTitle={hideOrbFaceTitle}
              ring={
                <GlobalRelationshipRing
                  ringState={globalRelationshipRing}
                  holdProgress={confirmActive ? holdProgress : 0}
                  className="instant-ban-confirm-influence-ring"
                />
              }
            />
          {showPayoffContent && selectedUser ? (
            <SuccessPayoffReveal
              senderUser={senderUser}
              selectedUser={selectedUser}
              banText={banText}
              durationMinutes={durationMinutes}
              showCta={showPayoffCta}
              onAgain={payoffPhase === 'ready' ? onAgain : undefined}
            />
          ) : null}
        </button>
      </div>
    </div>
  );
}
