'use client';

export type GoToBansSessionTrace = {
  banId: string;
  resultId: string;
  at: number;
};

let lastGoToBansSessionTrace: GoToBansSessionTrace | null = null;

export function recordGoToBansSessionTrace(banId: string): void {
  const normalized = banId.trim();
  if (!normalized) return;
  lastGoToBansSessionTrace = {
    banId: normalized,
    resultId: normalized,
    at: performance.now(),
  };
}

export function readGoToBansSessionTrace(): GoToBansSessionTrace | null {
  return lastGoToBansSessionTrace;
}
