/**
 * Client API/WS URLs. Never hardcode localhost in components — use these helpers.
 *
 * Priority:
 * 1. window.__98_CONFIG__ (injected in layout + ?api_url= override)
 * 2. NEXT_PUBLIC_* (baked at `next dev` / `next build` time)
 * 3. Production defaults (Railway API)
 */

export const DEFAULT_API_URL = 'https://98plusapi-production.up.railway.app';
export const DEFAULT_WS_URL = 'wss://98plusapi-production.up.railway.app/ws';

export interface ClientConfig {
  apiUrl: string;
  wsUrl: string;
  source: 'runtime' | 'build' | 'derived' | 'default';
}

declare global {
  interface Window {
    __98_CONFIG__?: { apiUrl?: string; wsUrl?: string };
  }
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

function isLocalhost(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url);
}

/** Reject Vercel placeholder and other non-backend hosts baked into stale builds. */
export function isUnusableApiUrl(url: string | undefined | null): boolean {
  if (!url?.trim()) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'placeholder.vercel.app') return true;
    if (host.endsWith('.vercel.app') && host.startsWith('placeholder')) return true;
    return false;
  } catch {
    return true;
  }
}

export function deriveWsFromApi(apiUrl: string): string {
  const base = stripTrailingSlash(apiUrl);
  if (base.startsWith('https://')) return `${base.replace(/^https/, 'wss')}/ws`;
  if (base.startsWith('http://')) return `${base.replace(/^http/, 'ws')}/ws`;
  return `${base}/ws`;
}

function resolveApiUrl(candidate: string | undefined | null): string {
  if (!isUnusableApiUrl(candidate)) {
    return stripTrailingSlash(candidate!.trim());
  }
  return DEFAULT_API_URL;
}

function resolveWsUrl(apiUrl: string, wsCandidate?: string | null): string {
  if (!isUnusableApiUrl(wsCandidate)) {
    return stripTrailingSlash(wsCandidate!.trim());
  }
  return deriveWsFromApi(apiUrl);
}

function readBuildApiUrl(): string {
  return resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
}

function readBuildWsUrl(apiUrl: string): string {
  return resolveWsUrl(apiUrl, process.env.NEXT_PUBLIC_WS_URL);
}

/** Call only in browser */
export function applyQueryConfigOverride(): void {
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('api_url') ?? params.get('apiUrl');
  if (fromQuery && !isUnusableApiUrl(fromQuery)) {
    const apiUrl = stripTrailingSlash(fromQuery);
    window.__98_CONFIG__ = {
      apiUrl,
      wsUrl: deriveWsFromApi(apiUrl),
    };
    try {
      localStorage.setItem('98plus_api_url', apiUrl);
    } catch {
      /* private mode */
    }
    console.info('[98+] API URL from query:', apiUrl);
    return;
  }

  try {
    const stored = localStorage.getItem('98plus_api_url');
    if (stored && !isUnusableApiUrl(stored) && !window.__98_CONFIG__?.apiUrl) {
      const apiUrl = stripTrailingSlash(stored);
      window.__98_CONFIG__ = {
        apiUrl,
        wsUrl: deriveWsFromApi(apiUrl),
      };
      console.info('[98+] API URL from localStorage:', apiUrl);
    } else if (stored && isUnusableApiUrl(stored)) {
      localStorage.removeItem('98plus_api_url');
      console.warn('[98+] Removed invalid stored API URL:', stored);
    }
  } catch {
    /* ignore */
  }
}

export function getClientConfig(): ClientConfig {
  if (typeof window !== 'undefined') {
    applyQueryConfigOverride();
    const runtime = window.__98_CONFIG__;
    if (runtime?.apiUrl && !isUnusableApiUrl(runtime.apiUrl)) {
      const apiUrl = stripTrailingSlash(runtime.apiUrl);
      const wsUrl = resolveWsUrl(
        apiUrl,
        runtime.wsUrl ?? process.env.NEXT_PUBLIC_WS_URL,
      );
      return { apiUrl, wsUrl, source: 'runtime' };
    }
    if (runtime?.apiUrl && isUnusableApiUrl(runtime.apiUrl)) {
      console.warn(
        '[98+] Ignoring invalid runtime API URL — using build/default:',
        runtime.apiUrl,
      );
      delete window.__98_CONFIG__;
    }
  }

  const buildApi = readBuildApiUrl();
  const wsUrl = readBuildWsUrl(buildApi);
  const usedBuildEnv =
    !isUnusableApiUrl(process.env.NEXT_PUBLIC_API_URL) ||
    !isUnusableApiUrl(process.env.NEXT_PUBLIC_WS_URL);

  if (buildApi && !isLocalhost(buildApi)) {
    return {
      apiUrl: buildApi,
      wsUrl,
      source: usedBuildEnv ? 'build' : 'default',
    };
  }

  if (typeof window !== 'undefined' && buildApi && isLocalhost(buildApi)) {
    console.error(
      '[98+] NEXT_PUBLIC_API_URL points to localhost but app runs on',
      window.location.origin,
      '— set NEXT_PUBLIC_API_URL to your backend tunnel and restart next dev',
    );
  }

  return {
    apiUrl: buildApi || DEFAULT_API_URL,
    wsUrl: wsUrl || DEFAULT_WS_URL,
    source: 'default',
  };
}

export function getApiUrl(): string {
  return getClientConfig().apiUrl;
}

export function getWsUrl(): string {
  return getClientConfig().wsUrl;
}

export function logWsUrlResolution(): void {
  const { apiUrl, wsUrl, source } = getClientConfig();
  console.log('[ws-url]', { apiUrl, wsUrl, source });
}

/** Browser is local Next.js dev (localhost / LAN). */
export function isBrowserLocalDev(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

/** Use /auth/dev when Telegram initData is absent (local browser testing). */
export function isClientDevAuthEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED === 'true') return true;
  if (process.env.NODE_ENV === 'development') return true;
  return isBrowserLocalDev();
}

export function isApiConfiguredForProduction(): boolean {
  const { apiUrl, source } = getClientConfig();
  if (typeof window === 'undefined') return true;
  if (source === 'runtime') return true;
  if (isUnusableApiUrl(apiUrl)) return false;
  if (isLocalhost(apiUrl) && !isLocalhost(window.location.hostname)) {
    return false;
  }
  return !isLocalhost(apiUrl) || isLocalhost(window.location.hostname);
}
