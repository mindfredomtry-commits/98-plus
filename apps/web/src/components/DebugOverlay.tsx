'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getDebug98Events,
  installDebug98log,
  mergeDebug98Events,
  readDebug98OverlayEnabled,
  type Debug98Event,
} from '@/lib/debug98log';

function formatDebug98EventData(ev: Debug98Event): string {
  if (ev.data === undefined) return '';
  if (
    ev.event === 'QUEUE_BREAK_SNAPSHOT' &&
    ev.data &&
    typeof ev.data === 'object'
  ) {
    const d = ev.data as Record<string, unknown>;
    const rem = Array.isArray(d.remainingBanIds)
      ? (d.remainingBanIds as string[]).join(',')
      : '';
    return (
      ` phase=${String(d.phase ?? '')}` +
      ` src=${String(d.source ?? '')}` +
      ` reason=${String(d.reason ?? '')}` +
      ` out=${String(d.lastOutcome ?? '-')}` +
      ` q=${String(d['overlayQueue.length'] ?? '')}` +
      ` p=${String(d['pending.length'] ?? '')}` +
      ` active=${String(d.activeBanId ?? '-')}` +
      ` head=${String(d.headBanId ?? '-')}` +
      ` pendHead=${String(d.pendingHeadBanId ?? '-')}` +
      ` rem=[${rem}]` +
      ` vis=${String(d.visibleOverlayKind ?? '-')}` +
      ` disp=${String(d.displayKind ?? '-')}` +
      ` activeKind=${String(d.activeKind ?? '-')}`
    );
  }
  try {
    const s = JSON.stringify(ev.data);
    return s.length > 180 ? ` ${s.slice(0, 180)}…` : ` ${s}`;
  } catch {
    return ' [unserializable]';
  }
}

export function DebugOverlay() {
  const [events, setEvents] = useState<Debug98Event[]>([]);
  const [overlayVisible, setOverlayVisible] = useState(false);

  useEffect(() => {
    installDebug98log();
    const enabled = readDebug98OverlayEnabled();
    setOverlayVisible(enabled);
    if (enabled) {
      window.__debug98log?.('[debug98-overlay-mounted]');
    }
  }, []);

  useEffect(() => {
    if (!overlayVisible) return;

    setEvents(mergeDebug98Events(getDebug98Events()));

    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<Debug98Event>).detail;
      if (!detail?.event) return;
      setEvents((prev) => mergeDebug98Events(prev, detail));
    };

    window.addEventListener('__debug98log', onEvent);
    return () => window.removeEventListener('__debug98log', onEvent);
  }, [overlayVisible]);

  const lines = useMemo(() => {
    const now = Date.now();
    return events.map((ev, idx) => {
      const ageMs = now - ev.t;
      const age = ageMs >= 0 ? `${Math.round(ageMs)}ms` : '';
      const data = formatDebug98EventData(ev);
      return `${idx + 1}. ${ev.event} ${age ? `(${age})` : ''}${data}`;
    });
  }, [events]);

  const copyChainTrace = () => {
    const text = window.__dump98ChainTrace?.().join('\n') ?? '';
    if (typeof copy === 'function') {
      copy(text);
      return;
    }
    void window.__copy98ChainTrace?.();
  };

  if (!overlayVisible) return null;

  return createPortal(
    <div
      className="debug98-overlay"
      data-debug98-overlay="1"
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
      <button
        type="button"
        data-debug98-copy-chain="1"
        onClick={() => {
          void copyChainTrace();
        }}
        style={{
          display: 'block',
          marginTop: 6,
          pointerEvents: 'auto',
          cursor: 'pointer',
          fontSize: 10,
          lineHeight: '14px',
          padding: '2px 6px',
          borderRadius: 4,
          border: '1px solid rgba(255,255,255,0.35)',
          background: 'rgba(255,255,255,0.12)',
          color: '#fff',
        }}
      >
        Copy chain trace
      </button>
    </div>,
    document.body,
  );
}
