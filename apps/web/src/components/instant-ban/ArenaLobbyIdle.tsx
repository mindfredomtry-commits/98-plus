'use client';

import { useEffect, useMemo, useState } from 'react';
import { DAILY_BAN_LIMIT_ERROR } from '@98plus/shared';
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
  /** Increment to replay daily-limit hint pulse. */
  dailyLimitBlockedSignal?: number;
  /** Lobby hint after send was blocked server-side. */
  sendBlockReason?: 'low-energy' | 'daily-limit' | null;
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
  dailyLimitBlockedSignal = 0,
  sendBlockReason = null,
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
  const dailyLimitMode = sendBlockReason === 'daily-limit';
  const showDailyLimitHint = dailyLimitMode && !lobbyRingIntroFilling;
  const showLowEnergyHint =
    !dailyLimitMode && lowInfluence && !lobbyRingIntroFilling;
  const askMode = !dailyLimitMode && lowInfluence && lowInfluenceRevealed;

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

  useEffect(() => {
    if (dailyLimitBlockedSignal <= 0) return;
    setHintPulse(true);
    setCtaNudge(true);
    const t = window.setTimeout(() => {
      setHintPulse(false);
      setCtaNudge(false);
    }, 900);
    return () => window.clearTimeout(t);
  }, [dailyLimitBlockedSignal]);

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
    if (dailyLimitMode) {
      triggerLobbyBlockedHaptic();
      setHintPulse(true);
      setCtaNudge(true);
      window.setTimeout(() => {
        setHintPulse(false);
        setCtaNudge(false);
      }, 900);
      return;
    }

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
      {showDailyLimitHint ? (
        <p
          className={`lobby-screen__cta-hint lobby-screen__cta-hint--daily-limit${
            hintPulse ? ' lobby-screen__cta-hint--pulse' : ''
          }`}
        >
          {DAILY_BAN_LIMIT_ERROR}
        </p>
      ) : showLowEnergyHint ? (
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
        disabled={!ctaInteractive && !lowInfluence && !dailyLimitMode}
        onClick={handleEnter}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
