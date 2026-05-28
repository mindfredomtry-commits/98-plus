'use client';

import './lobby-screen.css';

type Props = {
  onEnter: () => void;
  className?: string;
};

export function LobbyScreen({ onEnter, className = '' }: Props) {
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
          className="lobby-screen__cta"
          onClick={onEnter}
        >
          🚫 ЗАПРЕЩАТЬ
        </button>
      </div>
    </div>
  );
}
