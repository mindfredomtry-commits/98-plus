'use client';

import type { FriendCard, UserPublic } from '@98plus/shared';
import { InfluenceRing } from '../lobby/InfluenceRing';
import { SuccessPayoffReveal } from './SuccessPayoffReveal';
import type { useConfirmOrbController } from './useConfirmOrbController';

type ConfirmOrb = ReturnType<typeof useConfirmOrbController>;

type Props = {
  confirmActive: boolean;
  confirmOrb: ConfirmOrb;
  senderUser: UserPublic | null | undefined;
  selectedUser: FriendCard | null;
  banText: string;
  durationMinutes: number;
  sending: boolean;
  error: string | null;
  onRetry: () => void;
  onAgain?: () => void;
};

export function ArenaLobbyOrb({
  confirmActive,
  confirmOrb,
  senderUser,
  selectedUser,
  banText,
  durationMinutes,
  sending,
  error,
  onRetry,
  onAgain,
}: Props) {
  const {
    orbBtnRef,
    orbBtnClass,
    payoffActive,
    payoffPhase,
    ringValue,
    showOrbFace,
    showPayoffContent,
    showPayoffCta,
    statusLabel,
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
    buttonDisabled,
  } = confirmOrb;

  const payoffWrap =
    payoffPhase === 'morph' ||
    payoffPhase === 'settle' ||
    payoffPhase === 'reveal' ||
    payoffPhase === 'cta' ||
    payoffPhase === 'ready';

  return (
    <div
      className={`instant-ban-arena-lobby-orb${
        confirmActive ? ' instant-ban-arena-lobby-orb--confirm' : ''
      }${payoffWrap ? ' instant-ban-confirm-orb-wrap--payoff' : ''}`}
    >
      <div className="instant-ban-confirm-orb-stage instant-ban-arena-lobby-orb__stage">
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
          {showOrbFace ? (
            <span className="instant-ban-confirm-orb-face">
              <span className="instant-ban-confirm-orb-ring">
                <InfluenceRing
                  value={ringValue}
                  className="instant-ban-confirm-influence-ring"
                />
              </span>
              <span className="lobby-screen__orb" data-orb-core>
                <span className="lobby-screen__title">98+</span>
              </span>
            </span>
          ) : null}
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
      {confirmActive && !payoffActive ? (
        <>
          <p
            className={`instant-ban-status instant-ban-confirm-enter instant-ban-confirm-enter--5${
              error ? ' instant-ban-status--error' : ''
            }`}
          >
            {statusLabel}
          </p>
          {error ? (
            <button type="button" className="instant-ban-secondary" onClick={onRetry}>
              Попробовать снова
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
