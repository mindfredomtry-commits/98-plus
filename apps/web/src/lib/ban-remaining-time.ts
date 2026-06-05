'use client';

import { useEffect, useMemo, useState } from 'react';

export type BanTimeFormat = 'compact' | 'clock';

export type BanTimerSource = {
  remainingMs?: number;
  expiresAt?: string | null;
  checkDueAt?: string | null;
  serverNow?: string;
};

function normalizeTimerSource(
  source: BanTimerSource | number | undefined | null,
): BanTimerSource | null {
  if (source == null) return null;
  if (typeof source === 'number') return { remainingMs: source };
  return source;
}

function hasTimerSource(source: BanTimerSource): boolean {
  return (
    source.checkDueAt != null ||
    source.expiresAt != null ||
    source.remainingMs != null
  );
}

/** Real remaining time from absolute end or server snapshot (not durationMinutes). */
export function computeBanRemainingMs(
  source: BanTimerSource,
): number | null {
  const endIso = source.checkDueAt ?? source.expiresAt;
  if (endIso) {
    const endMs = Date.parse(endIso);
    if (!Number.isNaN(endMs)) {
      return Math.max(0, endMs - Date.now());
    }
  }

  if (source.serverNow != null && source.remainingMs != null) {
    const endMs =
      new Date(source.serverNow).getTime() + Math.max(0, source.remainingMs);
    return Math.max(0, endMs - Date.now());
  }

  if (source.remainingMs != null) {
    return Math.max(0, source.remainingMs);
  }

  return null;
}

export function formatBanRemaining(
  ms: number,
  style: BanTimeFormat = 'compact',
): string {
  if (ms <= 0) {
    return style === 'clock' ? '00:00' : 'сейчас';
  }

  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (style === 'clock' && h < 1) {
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m} мин`;
  return '<1м';
}

export function useBanRemainingMs(
  source: BanTimerSource | number | undefined | null,
): number | null {
  const normalized = useMemo(() => normalizeTimerSource(source), [source]);

  const [left, setLeft] = useState<number | null>(() =>
    normalized && hasTimerSource(normalized)
      ? computeBanRemainingMs(normalized)
      : null,
  );

  useEffect(() => {
    if (!normalized || !hasTimerSource(normalized)) {
      setLeft(null);
      return;
    }

    const tick = () => {
      setLeft(computeBanRemainingMs(normalized));
    };

    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [
    normalized?.remainingMs,
    normalized?.expiresAt,
    normalized?.checkDueAt,
    normalized?.serverNow,
  ]);

  if (!normalized || !hasTimerSource(normalized)) return null;
  return left;
}
