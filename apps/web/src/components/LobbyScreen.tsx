'use client';

import './lobby-screen.css';

type Props = {
  onEnter: () => void;
  className?: string;
};

export function LobbyScreen({ onEnter, className = '' }: Props) {
  const handleEnter = () => {
    let method: 'telegram' | 'vibrate' | 'none' = 'none';
    try {
      const telegramHaptic = (
        window as Window & {
          Telegram?: {
            WebApp?: {
              HapticFeedback?: {
                impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
              };
            };
          };
        }
      ).Telegram?.WebApp?.HapticFeedback;
      if (typeof telegramHaptic?.impactOccurred === 'function') {
        telegramHaptic.impactOccurred('light');
        method = 'telegram';
      } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(12);
        method = 'vibrate';
      }
    } catch {
      method = 'none';
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
