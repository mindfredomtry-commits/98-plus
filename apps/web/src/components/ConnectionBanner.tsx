'use client';

import { SYSTEM_VOICE } from '@98plus/shared';
import type { ConnectionUiState } from '@/lib/connection-ui';

export function ConnectionBanner({
  state,
  onRetry,
}: {
  state: ConnectionUiState;
  onRetry?: () => void;
}) {
  if (state === 'hidden') return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[80] px-4 py-2 text-center text-sm pointer-events-none bg-warning/25 text-warning"
      style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}
    >
      {SYSTEM_VOICE.offline}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="ml-2 underline font-medium pointer-events-auto"
        >
          Повторить
        </button>
      ) : null}
    </div>
  );
}
