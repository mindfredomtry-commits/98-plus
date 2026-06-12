'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { getPillSource, subscribePillSource } from '@/lib/pill-source-debug';
import {
  getIncomingDirectDebug,
  subscribeIncomingDirectDebug,
} from '@/lib/incoming-direct-debug';

export function PillSourceDebugBadge() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const source = useSyncExternalStore(
    subscribePillSource,
    getPillSource,
    () => null,
  );
  const incomingDirect = useSyncExternalStore(
    subscribeIncomingDirectDebug,
    getIncomingDirectDebug,
    () => getIncomingDirectDebug(),
  );

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div className="pill-source-debug-stack" aria-live="polite">
      <div
        className="pill-source-debug-badge"
        data-pill-source-badge={source ?? 'none'}
      >
        pill-source: {source ?? '—'}
      </div>
      <div className="pill-source-debug-badge pill-source-debug-badge--incoming-direct">
        <div>incoming-direct:</div>
        <div>routeReply={String(incomingDirect.routeReply)}</div>
        <div>displayBan={String(incomingDirect.displayBan)}</div>
        <div>ready={String(incomingDirect.ready)}</div>
        <div>overlayMounted={String(incomingDirect.overlayMounted)}</div>
        <div>reason={incomingDirect.reason}</div>
      </div>
    </div>,
    document.body,
  );
}
