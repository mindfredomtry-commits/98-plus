import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  isPhase12DiagEnabled,
  PHASE12_TELEGRAM_FRAME_ANCESTORS_CSP,
} from '@/lib/notification-overlay-owner-phase12-smoke-env';

/** Dev / Phase12 smoke only — allow Telegram WebView to frame the mini app. */
export function middleware(_request: NextRequest) {
  if (!isPhase12DiagEnabled()) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.headers.delete('X-Frame-Options');
  response.headers.delete('x-frame-options');
  response.headers.set('Content-Security-Policy', PHASE12_TELEGRAM_FRAME_ANCESTORS_CSP);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
