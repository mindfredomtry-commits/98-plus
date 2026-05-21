'use client';

import { SYSTEM_VOICE } from '@98plus/shared';
import type { WsStatus } from '@/hooks/useWebSocket';

export function ConnectionBanner({
  status,
  onRetry,
}: {
  status: WsStatus;
  onRetry?: () => void;
}) {
  if (status === 'connected' || status === 'skipped') return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[80] px-4 py-2 text-center text-sm pointer-events-none ${
        status === 'connecting'
          ? 'bg-accent/30 text-accent'
          : 'bg-warning/25 text-warning'
      }`}
      style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}
    >
      {status === 'connecting' ? 'Подключаем…' : SYSTEM_VOICE.offline}
      {status === 'disconnected' && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-2 underline font-medium pointer-events-auto"
        >
          Повторить
        </button>
      )}
    </div>
  );
}
