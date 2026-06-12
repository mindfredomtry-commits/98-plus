'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { getPillSource, subscribePillSource } from '@/lib/pill-source-debug';

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

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pill-source-debug-badge"
      aria-live="polite"
      data-pill-source-badge={source ?? 'none'}
    >
      pill-source: {source ?? '—'}
    </div>,
    document.body,
  );
}
