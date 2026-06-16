'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getDebug98Events,
  installDebug98log,
  type Debug98Event,
} from '@/lib/debug98log';

export function DebugOverlay({ enabled }: { enabled: boolean }) {
  const [events, setEvents] = useState<Debug98Event[]>([]);

  useEffect(() => {
    if (!enabled) return;

    installDebug98log();
    setEvents(getDebug98Events());

    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<Debug98Event>).detail;
      if (!detail?.event) return;
      setEvents((prev) => [...prev, detail].slice(-30));
    };

    window.addEventListener('__debug98log', onEvent);
    return () => window.removeEventListener('__debug98log', onEvent);
  }, [enabled]);

  const lines = useMemo(() => {
    const now = Date.now();
    return events.map((ev, idx) => {
      const ageMs = now - ev.t;
      const age = ageMs >= 0 ? `${Math.round(ageMs)}ms` : '';
      let data = '';
      try {
        if (ev.data !== undefined) {
          const s = JSON.stringify(ev.data);
          data = s.length > 180 ? s.slice(0, 180) + '…' : s;
        }
      } catch {
        data = '[unserializable]';
      }
      return `${idx + 1}. ${ev.event} ${age ? `(${age})` : ''}${data ? ` ${data}` : ''}`;
    });
  }, [events]);

  if (!enabled) return null;

  return (
    <div
      className="debug98-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 2147483647,
        width: 320,
        maxWidth: '92vw',
        maxHeight: '46vh',
        overflow: 'auto',
        background: 'rgba(0,0,0,0.7)',
        color: '#e8e8e8',
        fontSize: 11,
        lineHeight: '13px',
        padding: '6px 8px',
        borderBottomRightRadius: 10,
        pointerEvents: 'none',
        whiteSpace: 'pre-wrap',
        boxShadow: '0 8px 18px rgba(0,0,0,0.35)',
      }}
    >
      {lines.length ? lines.join('\n') : 'debug98: waiting…'}
    </div>
  );
}

