'use client';

import { memo, useEffect, useRef } from 'react';
import type { FriendCard, UserPublic } from '@98plus/shared';
import { InfluenceRing } from '../lobby/InfluenceRing';
import { LobbyOrbFace } from '../lobby/LobbyOrbFace';
import { SuccessPayoffReveal } from './SuccessPayoffReveal';
import type { useConfirmOrbController } from './useConfirmOrbController';

type ConfirmOrb = ReturnType<typeof useConfirmOrbController>;

type Props = {
  sendPhase: string;
  confirmActive: boolean;
  orbCompressActive: boolean;
  confirmOrb: ConfirmOrb;
  /** Lobby ring fill (0 → actual on first open); ignored during confirm/compress. */
  lobbyRingDisplayPercent: number;
  senderUser: UserPublic | null | undefined;
  selectedUser: FriendCard | null;
  banText: string;
  durationMinutes: number;
  onAgain?: () => void;
};

const ArenaInfluenceRing = memo(function ArenaInfluenceRing({
  value,
  debugId,
  disableTransition = false,
}: {
  value: number;
  debugId: string;
  disableTransition?: boolean;
}) {
  const ringMountLogged = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || ringMountLogged.current) return;
    ringMountLogged.current = true;
    console.log('[InfluenceRing-mount]', debugId);
    return () => {
      console.log('[InfluenceRing-unmount]', debugId);
    };
  }, [debugId]);

  return (
    <InfluenceRing
      value={value}
      className="instant-ban-confirm-influence-ring"
      disableTransition={disableTransition}
    />
  );
});

export function ArenaLobbyOrb({
  sendPhase,
  confirmActive,
  orbCompressActive,
  confirmOrb,
  lobbyRingDisplayPercent,
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
    ringValue,
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
  }, [sendPhase, confirmActive, confirmOrb.enterPhase]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    return () => {
      console.log('[ArenaLobbyOrb-unmount]', debugIdRef.current);
    };
  }, []);

  const payoffWrap = payoffPhase !== 'none';

  const useLobbyRingDisplay = !confirmActive && !orbCompressActive;
  const ringDisplayValue = useLobbyRingDisplay
    ? lobbyRingDisplayPercent
    : ringValue;

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
              ring={
                <ArenaInfluenceRing
                  value={ringDisplayValue}
                  debugId={debugIdRef.current}
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
