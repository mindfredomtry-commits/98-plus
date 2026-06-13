'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  LOGO_SOURCE_DEBUG_COLORS,
  LOGO_SOURCE_DEBUG_ENABLED,
  logLogoSourceDiagnostics,
  pickPrimaryLogoSource,
  scanVisibleLogoSources,
  type VisibleLogoSourceEntry,
} from '@/lib/lobby-logo-source-debug';
import './lobby-logo-source-debug.css';

type LabelPlacement = {
  key: string;
  source: VisibleLogoSourceEntry['source'];
  left: number;
  top: number;
  opacity: number;
  transform: string;
};

type HudState = {
  primary: string;
  active: string;
  labels: LabelPlacement[];
  frame: number;
};

const EMPTY_HUD: HudState = {
  primary: 'none',
  active: 'none',
  labels: [],
  frame: 0,
};

function buildHudState(): HudState {
  const entries = scanVisibleLogoSources();

  const labels = entries.map((entry, index) => ({
    key: entry.source,
    source: entry.source,
    left: entry.rect.right + 4,
    top: entry.rect.top + entry.rect.height / 2 + index * 11,
    opacity: entry.opacity,
    transform: entry.chain[0]?.transform ?? 'none',
  }));

  return {
    primary: pickPrimaryLogoSource(entries),
    active: entries.map((entry) => entry.source).join(', ') || 'none',
    labels,
    frame: performance.now(),
  };
}

export function LobbyLogoSourceDebugOverlay() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);

  useEffect(() => {
    if (!LOGO_SOURCE_DEBUG_ENABLED || typeof document === 'undefined') return undefined;

    document.documentElement.setAttribute('data-logo-source-debug', 'on');
    logLogoSourceDiagnostics('overlay-mount');

    let raf = 0;
    const tick = () => {
      setHud(buildHudState());
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      document.documentElement.removeAttribute('data-logo-source-debug');
    };
  }, []);

  if (!LOGO_SOURCE_DEBUG_ENABLED || !mounted || typeof document === 'undefined') {
    return null;
  }

  const primaryColor =
    hud.primary in LOGO_SOURCE_DEBUG_COLORS
      ? LOGO_SOURCE_DEBUG_COLORS[hud.primary as keyof typeof LOGO_SOURCE_DEBUG_COLORS]
      : '#ffffff';

  return createPortal(
    <>
      <div className="logo-source-debug-hud" aria-live="polite">
        <p className="logo-source-debug-hud__title">Logo source debug</p>
        <p className="logo-source-debug-hud__primary" style={{ color: primaryColor }}>
          active: {hud.primary}
        </p>
        <p className="logo-source-debug-hud__line">visible: {hud.active}</p>
        <p className="logo-source-debug-hud__line">frame: {Math.round(hud.frame)}</p>
        {hud.labels.map((label) => (
          <p key={`hud-${label.key}`} className="logo-source-debug-hud__line">
            {label.source}: o={label.opacity.toFixed(2)} t={label.transform.slice(0, 28)}
          </p>
        ))}
      </div>

      {hud.labels.map((label) => (
        <span
          key={label.key}
          className={`logo-source-debug-label logo-source-debug-label--${label.source}`}
          style={{ left: label.left, top: label.top, transform: 'translateY(-50%)' }}
        >
          {label.source}
        </span>
      ))}
    </>,
    document.body,
  );
}
