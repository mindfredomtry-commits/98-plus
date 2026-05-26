'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[98+ global error]', {
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      name: error.name,
    });
  }, [error]);

  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          background: '#0f0f0f',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            textAlign: 'center',
            gap: 16,
          }}
        >
          <p style={{ fontSize: 32, fontWeight: 800 }}>98+</p>
          <p style={{ opacity: 0.6, fontSize: 14 }}>
            {error.message || 'Критическая ошибка'}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9b59b6',
              textDecoration: 'underline',
              fontSize: 14,
            }}
          >
            Перезапустить
          </button>
        </div>
      </body>
    </html>
  );
}
