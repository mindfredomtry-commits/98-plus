import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const TELEGRAM_FRAME_ANCESTORS_CSP =
  "frame-ancestors 'self' https://web.telegram.org https://telegram.org https://*.telegram.org http://localhost:* http://127.0.0.1:* https://*.trycloudflare.com";

function isTelegramFrameDiagEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_PHASE12_DIAG === '1'
  );
}

/** Dev / diag only — allow Telegram WebView to frame the mini app. */
export function middleware(_request: NextRequest) {
  if (!isTelegramFrameDiagEnabled()) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.headers.delete('X-Frame-Options');
  response.headers.delete('x-frame-options');
  response.headers.set('Content-Security-Policy', TELEGRAM_FRAME_ANCESTORS_CSP);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
