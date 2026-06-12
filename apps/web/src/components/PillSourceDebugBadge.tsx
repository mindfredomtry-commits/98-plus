'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { getPillSource, subscribePillSource } from '@/lib/pill-source-debug';
import {
  getIncomingDirectDebug,
  subscribeIncomingDirectDebug,
} from '@/lib/incoming-direct-debug';
import {
  getLobbyBootIntroDebug,
  subscribeLobbyBootIntroDebug,
} from '@/lib/lobby-boot-intro-debug';

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
  const ringIntro = useSyncExternalStore(
    subscribeLobbyBootIntroDebug,
    getLobbyBootIntroDebug,
    () => getLobbyBootIntroDebug(),
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
      <div className="pill-source-debug-badge pill-source-debug-badge--ring-intro">
        <div>ring-intro:</div>
        <div>state={ringIntro.ringIntroState}</div>
        <div>energyKnown={String(ringIntro.energyKnown)}</div>
        <div>target={ringIntro.targetProgress}</div>
        <div>class={ringIntro.ringClass || '—'}</div>
        <div>dashoffset={ringIntro.strokeDashoffset}</div>
        <div>ringBox={ringIntro.ringBox}</div>
        <div>scaleLayer={ringIntro.scaleLayerTransform}</div>
        <div>ringTransform={ringIntro.ringTransform}</div>
        <div>wrapper={ringIntro.wrapperTransform}</div>
        <div>scaleClass={ringIntro.scaleLayerClass}</div>
        <div>ringClass={ringIntro.ringRootClass}</div>
      </div>
    </div>,
    document.body,
  );
}
