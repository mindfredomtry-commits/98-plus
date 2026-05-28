'use client';

import './lobby-screen.css';

type Props = {
  onEnter: () => void;
  className?: string;
};

export function LobbyScreen({ onEnter, className = '' }: Props) {
  const handleEnter = () => {
    let method: 'telegram' | 'vibrate' | 'none' = 'none';
    let error: string | null = null;
    const telegram = (
      window as Window & {
        Telegram?: {
          WebApp?: {
            HapticFeedback?: {
              impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
            };
          };
        };
      }
    ).Telegram;
    const telegramHaptic = telegram?.WebApp?.HapticFeedback;
    const hasTelegram = !!telegram?.WebApp;
    const hasHaptic = typeof telegramHaptic?.impactOccurred === 'function';
    const hasVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

    try {
      if (hasHaptic) {
        telegramHaptic.impactOccurred('medium');
        method = 'telegram';
      } else if (hasVibrate) {
        navigator.vibrate([20, 20, 20]);
        method = 'vibrate';
      }
    } catch (err) {
      method = 'none';
      error = err instanceof Error ? err.message : String(err);
    }
    console.log('[lobby-haptic]', { method });
    console.log('[lobby-haptic-debug]', {
      hasTelegram,
      hasHaptic,
      hasVibrate,
      method,
      error,
    });
    onEnter();
  };

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
        <div className="lobby-screen__orb-ring" aria-hidden />
        <div className="lobby-screen__orb">
          <span className="lobby-screen__title">98+</span>
        </div>
      </div>

      <div className="lobby-screen__cta-wrap">
        <button
          type="button"
          className="btn-98-primary lobby-screen__cta"
          onClick={handleEnter}
        >
          🚫 ЗАПРЕЩАТЬ
        </button>
      </div>
    </div>
  );
}
