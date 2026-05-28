'use client';

import { useEffect, useRef, useState } from 'react';
import './lobby-screen.css';

type Props = {
  onEnter: () => void;
  className?: string;
};

export function LobbyScreen({ onEnter, className = '' }: Props) {
  const [hapticDebugLabel, setHapticDebugLabel] = useState<string | null>(null);
  const debugHideTimerRef = useRef<number | null>(null);

  const showHapticDebug = (label: 'telegram' | 'vibrate' | 'none' | 'error') => {
    setHapticDebugLabel(label);
    if (debugHideTimerRef.current != null) {
      window.clearTimeout(debugHideTimerRef.current);
    }
    debugHideTimerRef.current = window.setTimeout(() => {
      setHapticDebugLabel(null);
      debugHideTimerRef.current = null;
    }, 1200);
  };

  useEffect(() => {
    return () => {
      if (debugHideTimerRef.current != null) {
        window.clearTimeout(debugHideTimerRef.current);
      }
    };
  }, []);

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
        showHapticDebug('telegram');
      } else if (hasVibrate) {
        navigator.vibrate([20, 20, 20]);
        method = 'vibrate';
        showHapticDebug('vibrate');
      } else {
        showHapticDebug('none');
      }
    } catch (err) {
      method = 'none';
      error = err instanceof Error ? err.message : String(err);
      showHapticDebug('error');
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
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          left: '50%',
          bottom: '110px',
          transform: 'translateX(-50%)',
          zIndex: 80,
          pointerEvents: 'none',
          padding: '0.32rem 0.6rem',
          borderRadius: '999px',
          border: '1px solid rgba(124, 58, 237, 0.55)',
          background: 'rgba(24, 10, 40, 0.82)',
          color: '#f5f3ff',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          boxShadow: '0 0 14px rgba(124, 58, 237, 0.35)',
          opacity: hapticDebugLabel ? 1 : 0,
          transition: 'opacity 160ms ease',
        }}
      >
        {hapticDebugLabel === 'error'
          ? 'HAPTIC ERROR'
          : hapticDebugLabel
            ? `HAPTIC: ${hapticDebugLabel}`
            : 'HAPTIC'}
      </div>
    </div>
  );
}
