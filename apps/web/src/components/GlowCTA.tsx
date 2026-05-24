'use client';

import { memo } from 'react';

interface Props {
  children: React.ReactNode;
  onClick?: () => void;
  ready: boolean;
  busy?: boolean;
  helperText?: string;
  className?: string;
}

/** Stable CTA — no framer remounts, single persistent button node */
export const GlowCTA = memo(function GlowCTA({
  children,
  onClick,
  ready,
  busy = false,
  helperText,
  className = '',
}: Props) {
  return (
    <div className={`cta-block ${className}`}>
      {helperText ? (
        <p className="cta-block-hint cta-block-hint--visible" aria-live="polite">
          {helperText}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (!busy) onClick?.();
        }}
        disabled={busy}
        className={`glow-cta touch-manipulation select-none ${ready ? 'glow-cta--ready' : ''} ${busy ? 'glow-cta--busy' : ''}`}
        aria-busy={busy}
      >
        <span className="glow-cta-label inline-flex items-center justify-center gap-2">
          {busy ? (
            <span
              className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0"
              aria-hidden
            />
          ) : null}
          {children}
        </span>
      </button>
    </div>
  );
});
