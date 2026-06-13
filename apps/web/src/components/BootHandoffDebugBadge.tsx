'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  getBootHandoffDebug,
  subscribeBootHandoffDebug,
} from '@/lib/boot-handoff-debug';

export function BootHandoffDebugBadge() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const debug = useSyncExternalStore(
    subscribeBootHandoffDebug,
    getBootHandoffDebug,
    getBootHandoffDebug,
  );

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div className="boot-handoff-debug" aria-live="polite">
      <div>bootSceneVisible={String(debug.bootSceneVisible)}</div>
      <div>introEnded={String(debug.introEnded)}</div>
      <div>introPrimed={String(debug.introPrimed)}</div>
      <div>showLobbyChrome={String(debug.showLobbyChrome)}</div>
      <div>showLobbyCta={String(debug.showLobbyCta)}</div>
      <div>showBottomNav={String(debug.showBottomNav)}</div>
      <div>showBootScene={String(debug.showBootScene)}</div>
      <div>hasPlayedIntro={String(debug.hasPlayedIntro)}</div>
      <div>orbSource={debug.orbSource}</div>
      <div>introRunCount={debug.introRunCount}</div>
      <div>orbInstanceId={debug.orbInstanceId || '—'}</div>
      <div>onIntroEnd×{debug.onIntroEndCalls}</div>
      <div>markPrimed×{debug.markPrimedCalls}</div>
    </div>,
    document.body,
  );
}
