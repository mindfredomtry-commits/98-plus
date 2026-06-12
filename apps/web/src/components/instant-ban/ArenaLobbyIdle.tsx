'use client';

import { useEffect, useMemo, useState } from 'react';
import { isLobbyLowEnergy } from '@/lib/lobby-influence';
import {
  clearPillSourceIf,
  reportPillSource,
} from '@/lib/pill-source-debug';
import { triggerLobbyBlockedHaptic } from './lobby-cta-haptics';

export type LobbyCtaState = 'visible' | 'exiting' | 'hidden' | 'entering';

type Props = {
  /** Real lobby energy 0–100 (not ring intro display percent). */
  influencePercent: number;
  /** True when UserPublic.energyPercent is known (not prefetch / fallback). */
  energyLoaded: boolean;
  /** Ring intro animating 0 → actual — must not trigger low-energy hint. */
  lobbyRingIntroFilling: boolean;
  ctaState: LobbyCtaState;
  ctaInteractive: boolean;
  lowInfluenceRevealed: boolean;
  onLowInfluenceRevealedChange: (revealed: boolean) => void;
  /** Increment to replay hint pulse (e.g. repeat-ban blocked). */
  lowEnergyBlockedSignal?: number;
  onBeginSend: () => void;
  onLowEnergyAsk: () => void;
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

export function ArenaLobbyIdle({
  influencePercent,
  energyLoaded,
  lobbyRingIntroFilling,
  ctaState,
  ctaInteractive,
  lowInfluenceRevealed,
  onLowInfluenceRevealedChange,
  lowEnergyBlockedSignal = 0,
  onBeginSend,
  onLowEnergyAsk,
}: Props) {
  const [hintPulse, setHintPulse] = useState(false);
  const [ctaNudge, setCtaNudge] = useState(false);

  const influence = useMemo(
    () => Math.min(100, Math.max(0, influencePercent)),
    [influencePercent],
  );
  const lowInfluence = isLobbyLowEnergy(energyLoaded, influence);
  const showLowEnergyHint = lowInfluence && !lobbyRingIntroFilling;
  const askMode = lowInfluence && lowInfluenceRevealed;

  useEffect(() => {
    if (!lowInfluence) {
      onLowInfluenceRevealedChange(false);
    }
  }, [lowInfluence, onLowInfluenceRevealedChange]);

  useEffect(() => {
    if (lowEnergyBlockedSignal <= 0) return;
    setHintPulse(true);
    setCtaNudge(true);
    const t = window.setTimeout(() => {
      setHintPulse(false);
      setCtaNudge(false);
    }, 900);
    return () => window.clearTimeout(t);
  }, [lowEnergyBlockedSignal]);

  const revealLowEnergy = () => {
    triggerLobbyBlockedHaptic();
    onLowInfluenceRevealedChange(true);
    setHintPulse(true);
    setCtaNudge(true);
    window.setTimeout(() => {
      setHintPulse(false);
      setCtaNudge(false);
    }, 900);
  };

  const handleEnter = () => {
    if (!lowInfluence) {
      if (!ctaInteractive) return;
      triggerEnterHaptic();
      onBeginSend();
      return;
    }

    if (!lowInfluenceRevealed) {
      revealLowEnergy();
      return;
    }

    onLowEnergyAsk();
  };

  const buttonLabel = askMode ? '🚫 ХОЧУ ЗАПРЕЩАТЬ' : '🚫 ЗАПРЕЩАТЬ';

  useEffect(() => {
    reportPillSource('ArenaLobbyIdle');
    return () => clearPillSourceIf('ArenaLobbyIdle');
  }, [ctaState, ctaInteractive, buttonLabel]);

  return (
    <div
      className={`lobby-screen__cta-wrap instant-ban-lobby-cta instant-ban-lobby-cta--${ctaState}`}
      data-pill-source="ArenaLobbyIdle"
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
