'use client';

import { useEffect, useMemo, useState } from 'react';
import { LOBBY_MIN_INFLUENCE_PERCENT } from '@/lib/lobby-influence';
import { shareLobbyAskInvite } from '@/lib/share';

export type LobbyCtaState = 'visible' | 'exiting' | 'hidden' | 'entering';

type Props = {
  /** Real lobby energy 0–100 (not ring intro display percent). */
  influencePercent: number;
  /** True when UserPublic.energyPercent is known (not prefetch / fallback). */
  energyLoaded: boolean;
  /** Ring intro animating 0 → actual — must not trigger low-energy hint. */
  lobbyRingIntroFilling: boolean;
  inviteUsername?: string | null;
  ctaState: LobbyCtaState;
  ctaInteractive: boolean;
  onBeginSend: () => void;
};

function triggerEnterHaptic(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(30);
    }
    (
      window as Window & {
        Telegram?: {
          WebApp?: {
            HapticFeedback?: {
              notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
            };
          };
        };
      }
    ).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');
  } catch {
    // no-op
  }
}

function triggerBlockedHaptic(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([12, 40, 12]);
    }
    (
      window as Window & {
        Telegram?: {
          WebApp?: {
            HapticFeedback?: {
              notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
            };
          };
        };
      }
    ).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('warning');
  } catch {
    // no-op
  }
}

export function ArenaLobbyIdle({
  influencePercent,
  energyLoaded,
  lobbyRingIntroFilling,
  inviteUsername = null,
  ctaState,
  ctaInteractive,
  onBeginSend,
}: Props) {
  const [lowInfluenceRevealed, setLowInfluenceRevealed] = useState(false);
  const [hintPulse, setHintPulse] = useState(false);
  const [ctaNudge, setCtaNudge] = useState(false);

  const influence = useMemo(
    () => Math.min(100, Math.max(0, influencePercent)),
    [influencePercent],
  );
  const lowInfluence =
    energyLoaded && influence < LOBBY_MIN_INFLUENCE_PERCENT;
  const showLowEnergyHint = lowInfluence && !lobbyRingIntroFilling;
  const askMode = lowInfluence && lowInfluenceRevealed;

  useEffect(() => {
    if (!lowInfluence) {
      setLowInfluenceRevealed(false);
    }
  }, [lowInfluence]);

  const handleEnter = () => {
    if (!lowInfluence) {
      if (!ctaInteractive) return;
      triggerEnterHaptic();
      onBeginSend();
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
      className={`lobby-screen__cta-wrap instant-ban-lobby-cta instant-ban-lobby-cta--${ctaState}`}
    >
      {showLowEnergyHint ? (
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
        disabled={!ctaInteractive && !lowInfluence}
        onClick={handleEnter}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
