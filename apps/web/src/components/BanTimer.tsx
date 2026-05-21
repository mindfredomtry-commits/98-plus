'use client';

import { useEffect, useState } from 'react';

function formatMs(ms: number): string {
  if (ms <= 0) return '⚡ сейчас';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м`;
  return '<1м';
}

export function BanTimer({ remainingMs }: { remainingMs?: number }) {
  const [left, setLeft] = useState(remainingMs ?? 0);

  useEffect(() => {
    setLeft(remainingMs ?? 0);
    if (!remainingMs || remainingMs <= 0) return;
    const t = setInterval(() => {
      setLeft((v) => Math.max(0, v - 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [remainingMs]);

  if (!remainingMs) return null;

  return (
    <span className="text-xs text-accent tabular-nums">
      ⏱ {formatMs(left)}
    </span>
  );
}
