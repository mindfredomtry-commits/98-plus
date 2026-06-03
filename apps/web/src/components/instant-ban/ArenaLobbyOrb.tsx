'use client';

import { memo, useEffect, useRef } from 'react';
import type { FriendCard, UserPublic } from '@98plus/shared';
import { InfluenceRing } from '../lobby/InfluenceRing';
import { SuccessPayoffReveal } from './SuccessPayoffReveal';
import type { useConfirmOrbController } from './useConfirmOrbController';

type ConfirmOrb = ReturnType<typeof useConfirmOrbController>;

type Props = {
  sendPhase: string;
  confirmActive: boolean;
  confirmOrb: ConfirmOrb;
  senderUser: UserPublic | null | undefined;
  selectedUser: FriendCard | null;
  banText: string;
  durationMinutes: number;
  onAgain?: () => void;
};

const ArenaInfluenceRing = memo(function ArenaInfluenceRing({
  value,
  debugId,
}: {
  value: number;
  debugId: string;
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
    />
  );
});

export function ArenaLobbyOrb({
  sendPhase,
  confirmActive,
  confirmOrb,
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

  const payoffWrap =
    payoffPhase === 'morph' ||
    payoffPhase === 'settle' ||
    payoffPhase === 'reveal' ||
    payoffPhase === 'cta' ||
    payoffPhase === 'ready';

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
          <span
            className={`instant-ban-arena-lobby-orb__face instant-ban-confirm-orb-face${
              showOrbFace ? '' : ' instant-ban-arena-lobby-orb__face--hidden'
            }`}
          >
            <span className="instant-ban-arena-lobby-orb__ring-layer instant-ban-confirm-orb-ring">
              <ArenaInfluenceRing
                value={ringValue}
                debugId={debugIdRef.current}
              />
            </span>
            <span className="instant-ban-arena-lobby-orb__title-layer">
              <span className="lobby-screen__orb" data-orb-core>
                <span className="lobby-screen__title">98+</span>
              </span>
            </span>
          </span>
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
