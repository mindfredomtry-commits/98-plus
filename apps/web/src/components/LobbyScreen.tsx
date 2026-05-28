'use client';

import './lobby-screen.css';

type Props = {
  onEnter: () => void;
  className?: string;
};

export function LobbyScreen({ onEnter, className = '' }: Props) {
  const handleEnter = () => {
    let method: 'telegram' | 'vibrate' | 'none' = 'none';
    const telegram = (
      window as Window & {
        Telegram?: {
          WebApp?: {
            HapticFeedback?: {
              notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
            };
          };
        };
      }
    ).Telegram;
    const telegramHaptic = telegram?.WebApp?.HapticFeedback;

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(30);
        method = 'vibrate';
      }
      if (typeof telegramHaptic?.notificationOccurred === 'function') {
        telegramHaptic.notificationOccurred('success');
        method = 'telegram';
      }
    } catch {
      // Haptic must never block lobby enter.
    }

    console.log('[lobby-haptic]', { method });
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
