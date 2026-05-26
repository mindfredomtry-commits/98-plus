'use client';

import { useEffect } from 'react';
import { resetScrollLock } from '@/lib/scroll-lock';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[98+ route error]', {
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      name: error.name,
    });
    resetScrollLock();
  }, [error]);

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center gap-4 challenge-bg">
      <p className="text-4xl text-glow font-black">98+</p>
      <p className="text-muted text-sm max-w-sm">
        Что-то пошло не так. Арена всё ещё здесь — попробуй ещё раз.
      </p>
      {error.message ? (
        <p className="text-[10px] text-muted/60 break-all max-w-sm font-mono">
          {error.message}
        </p>
      ) : null}
      <button
        type="button"
        className="text-accent underline text-sm"
        onClick={() => reset()}
      >
        Обновить экран
      </button>
    </div>
  );
}
