'use client';

import { useEffect, useState } from 'react';

export type BanTimeFormat = 'compact' | 'clock';

export function formatBanRemaining(
  ms: number,
  style: BanTimeFormat = 'compact',
): string {
  if (ms <= 0) return 'сейчас';

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

export function useBanRemainingMs(remainingMs?: number): number | null {
  const [left, setLeft] = useState(remainingMs ?? 0);

  useEffect(() => {
    setLeft(remainingMs ?? 0);
    if (!remainingMs || remainingMs <= 0) return;
    const t = setInterval(() => {
      setLeft((v) => Math.max(0, v - 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [remainingMs]);

  if (remainingMs == null) return null;
  return left;
}
