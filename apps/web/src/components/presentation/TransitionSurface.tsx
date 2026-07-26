'use client';

import type { PresentationTransitionReason } from '@/notification-runtime/notification-runtime.presentation';

/** Neutral gap frame — no Lobby nodes, no empty notification card shell. */
export function TransitionSurface({
  reason,
}: {
  reason: PresentationTransitionReason;
}) {
  return (
    <div
      data-presentation-surface="transition"
      data-presentation-transition-reason={reason}
      data-testid="presentation-transition"
      aria-hidden
    />
  );
}
