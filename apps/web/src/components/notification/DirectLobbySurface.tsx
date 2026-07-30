/**
 * Phase 0 — Direct lobby surface (CTA + indicator). No queue ownership.
 */
'use client';

import { BigButton } from '@/components/BigButton';

export type DirectLobbySurfaceProps = {
  ctaVisible: boolean;
  indicatorVisible: boolean;
  pendingCount: number;
  onStartBan: () => void;
  influencePercent?: number;
};

export function DirectLobbySurface({
  ctaVisible,
  indicatorVisible,
  pendingCount,
  onStartBan,
  influencePercent = 0,
}: DirectLobbySurfaceProps) {
  return (
    <div className="direct-lobby-surface" data-phase="lobby">
      <div className="direct-lobby-surface__orb" aria-hidden />
      <div className="direct-lobby-surface__meta">
        {indicatorVisible ? (
          <div
            className="direct-lobby-surface__indicator"
            data-pending-count={pendingCount}
          >
            {pendingCount > 0 ? pendingCount : ''}
          </div>
        ) : null}
        <div className="direct-lobby-surface__influence">
          {Math.round(influencePercent)}%
        </div>
      </div>
      {ctaVisible ? (
        <div className="direct-lobby-surface__cta">
          <BigButton onClick={onStartBan}>Запрещать</BigButton>
        </div>
      ) : null}
    </div>
  );
}
