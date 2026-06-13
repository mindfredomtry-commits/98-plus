'use client';

import { useEffect, useMemo, useState } from 'react';
import { InfluenceRing } from './lobby/InfluenceRing';
import { LOBBY_MIN_INFLUENCE_PERCENT } from '@/lib/lobby-influence';
import { shareLobbyAskInvite } from '@/lib/share';
import './lobby-screen.css';

type Props = {
  onEnter: () => void;
  /** 0–100 display influence (UserPublic.energyPercent from API). */
  influencePercent: number;
  /** For low-influence share deep link (invite to ban this user). */
  inviteUsername?: string | null;
  className?: string;
};

function triggerEnterHaptic(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(30);
    }
    const telegramHaptic = (
      window as Window & {
        Telegram?: {
          WebApp?: {
            HapticFeedback?: {
              notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
            };
          };
        };
      }
    ).Telegram?.WebApp?.HapticFeedback;
    telegramHaptic?.notificationOccurred?.('success');
  } catch {
    // no-op
  }
}

function triggerBlockedHaptic(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([12, 40, 12]);
    }
    const telegramHaptic = (
      window as Window & {
        Telegram?: {
          WebApp?: {
            HapticFeedback?: {
              notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
            };
          };
        };
      }
    ).Telegram?.WebApp?.HapticFeedback;
    telegramHaptic?.notificationOccurred?.('warning');
  } catch {
    // no-op
  }
}

export function LobbyScreen({
  onEnter,
  influencePercent,
  inviteUsername = null,
  className = '',
}: Props) {
  const [lowInfluenceRevealed, setLowInfluenceRevealed] = useState(false);
  const [hintPulse, setHintPulse] = useState(false);
  const [ctaNudge, setCtaNudge] = useState(false);

  const influence = useMemo(
    () => Math.min(100, Math.max(0, influencePercent)),
    [influencePercent],
  );
  const lowInfluence = influence < LOBBY_MIN_INFLUENCE_PERCENT;
  const askMode = lowInfluence && lowInfluenceRevealed;

  useEffect(() => {
    if (!lowInfluence) {
      setLowInfluenceRevealed(false);
    }
  }, [lowInfluence]);

  const handleEnter = () => {
    if (!lowInfluence) {
      triggerEnterHaptic();
      console.log('[lobby-haptic]', { method: 'enter' });
      onEnter();
      return;
    }

    if (!lowInfluenceRevealed) {
      triggerBlockedHaptic();
      setLowInfluenceRevealed(true);
      setHintPulse(true);
      setCtaNudge(true);
      window.setTimeout(() => {
        setHintPulse(false);
        setCtaNudge(false);
      }, 900);
      return;
    }

    shareLobbyAskInvite(inviteUsername);
  };

  const buttonLabel = askMode ? '🚫 ХОЧУ ЗАПРЕЩАТЬ' : '🚫 ЗАПРЕЩАТЬ';

  return (
    <div
      className={`lobby-screen ${className}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-label="98+ lobby"
    >
      <div className="lobby-screen__grid" aria-hidden />
      <div className="lobby-screen__particles" aria-hidden>
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className="lobby-screen__particle" />
        ))}
      </div>

      <div className="lobby-screen__orb-wrap">
        <InfluenceRing value={influence} />
        <div className="lobby-screen__orb">
          <span className="lobby-screen__title" data-logo-source="arena">
            98+
          </span>
        </div>
      </div>

      <div className="lobby-screen__cta-wrap">
        {lowInfluence ? (
          <p
            className={`lobby-screen__cta-hint${
              !lowInfluenceRevealed ? ' lobby-screen__cta-hint--muted' : ''
            }${hintPulse ? ' lobby-screen__cta-hint--pulse' : ''}`}
          >
            Выполни пару запретов от других —<br />
            и сможешь запрещать снова!
          </p>
        ) : null}
        <button
          type="button"
          className={`btn-98-primary lobby-screen__cta${ctaNudge ? ' lobby-screen__cta--nudge' : ''}`}
          onClick={handleEnter}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
