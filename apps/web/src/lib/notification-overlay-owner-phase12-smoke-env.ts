/** Edge/config-safe Phase12 env gate — no window globals, no client-only code. */

export function isPhase12DiagEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_PHASE12_DIAG === '1'
  );
}

export const PHASE12_TELEGRAM_FRAME_ANCESTORS_CSP =
  "frame-ancestors 'self' https://web.telegram.org https://telegram.org https://*.telegram.org http://localhost:* http://127.0.0.1:* https://*.trycloudflare.com";
