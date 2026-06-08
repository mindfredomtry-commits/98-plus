'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { clearLocalOverlayDismissCache } from '@/lib/overlay-arbiter';
import type { WsStatus } from '@/hooks/useWebSocket';

interface DebugData {
  userId: string;
  telegramId: string;
  session: unknown;
  activeBans: unknown[];
  analytics: { name: string; count: number }[];
  wsConnectedUsers: number;
}

export function DebugPanel({
  token,
  userId,
  wsStatus,
  eventLog,
  open,
  onClose,
}: {
  token: string;
  userId?: string | null;
  wsStatus: WsStatus;
  eventLog: string[];
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<DebugData | null>(null);
  const [banId, setBanId] = useState('');

  useEffect(() => {
    if (!open || !token) return;
    api<DebugData>('/admin/debug', { token })
      .then(setData)
      .catch(() => setData(null));
  }, [open, token]);

  if (!open) return null;

  async function run(path: string) {
    if (!banId.trim()) return alert('ban id');
    await api(`/admin/bans/${banId.trim()}${path}`, {
      method: 'POST',
      token,
    });
    alert('ok');
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/95 overflow-auto p-4 pb-24 text-xs font-mono">
      <div className="flex justify-between mb-4">
        <span className="text-accent">ALPHA DEBUG</span>
        <button type="button" onClick={onClose} className="text-muted">
          ✕
        </button>
      </div>
      <p>WS: {wsStatus}</p>
      <pre className="mt-2 text-muted whitespace-pre-wrap">
        {JSON.stringify(data, null, 2)}
      </pre>
      <p className="mt-4 text-accent">Events</p>
      <ul className="text-muted max-h-32 overflow-auto">
        {eventLog.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      <input
        value={banId}
        onChange={(e) => setBanId(e.target.value)}
        placeholder="ban id"
        className="w-full mt-4 bg-card p-2 rounded"
      />
      <div className="flex flex-wrap gap-2 mt-2">
        <button
          type="button"
          className="bg-card px-2 py-1 rounded"
          onClick={() => run('/expire')}
        >
          expire
        </button>
        <button
          type="button"
          className="bg-card px-2 py-1 rounded"
          onClick={() => run('/reset')}
        >
          reset
        </button>
        <button
          type="button"
          className="bg-card px-2 py-1 rounded"
          onClick={() => run('/complete')}
        >
          complete
        </button>
        <button
          type="button"
          className="bg-card px-2 py-1 rounded"
          onClick={() =>
            api('/admin/redis/clear', { method: 'POST', token }).then(() =>
              alert('redis cleared'),
            )
          }
        >
          clear redis
        </button>
        {process.env.NODE_ENV !== 'production' && userId ? (
          <button
            type="button"
            className="bg-card px-2 py-1 rounded"
            onClick={() => {
              clearLocalOverlayDismissCache(userId);
              if (typeof window !== 'undefined') {
                (
                  window as Window & {
                    __clearOverlayDismissCache?: (uid?: string) => void;
                  }
                ).__clearOverlayDismissCache?.(userId);
              }
              alert('overlay dismiss cache cleared — reload mini app');
            }}
          >
            clear overlay cache
          </button>
        ) : null}
      </div>
    </div>
  );
}
