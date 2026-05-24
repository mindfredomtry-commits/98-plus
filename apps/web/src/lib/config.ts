/**
 * Client API/WS URLs. Never hardcode localhost in components — use these helpers.
 *
 * Priority:
 * 1. window.__98_CONFIG__ (injected in layout + ?api_url= override)
 * 2. NEXT_PUBLIC_* (baked at `next dev` / `next build` time)
 * 3. Derive WSS from HTTPS API URL
 */

export interface ClientConfig {
  apiUrl: string;
  wsUrl: string;
  source: 'runtime' | 'build' | 'derived' | 'unset';
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

function deriveWsFromApi(apiUrl: string): string {
  const base = stripTrailingSlash(apiUrl);
  if (base.startsWith('https://')) return `${base.replace(/^https/, 'wss')}/ws`;
  if (base.startsWith('http://')) return `${base.replace(/^http/, 'ws')}/ws`;
  return `${base}/ws`;
}

function readBuildApiUrl(): string {
  return "https://98plusapi-production.up.railway.app";
}

function readBuildWsUrl(): string {
  return 'wss://98plusapi-production.up.railway.app/ws';
}

/** Call only in browser */
export function applyQueryConfigOverride(): void {
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('api_url') ?? params.get('apiUrl');
  if (fromQuery) {
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
    if (stored && !window.__98_CONFIG__?.apiUrl) {
      const apiUrl = stripTrailingSlash(stored);
      window.__98_CONFIG__ = {
        apiUrl,
        wsUrl: deriveWsFromApi(apiUrl),
      };
      console.info('[98+] API URL from localStorage:', apiUrl);
    }
  } catch {
    /* ignore */
  }
}

export function getClientConfig(): ClientConfig {
  if (typeof window !== 'undefined') {
    applyQueryConfigOverride();
    const runtime = window.__98_CONFIG__;
    if (runtime?.apiUrl) {
      const apiUrl = stripTrailingSlash(runtime.apiUrl);
      const wsUrl = stripTrailingSlash(
        runtime.wsUrl ?? deriveWsFromApi(apiUrl),
      );
      return { apiUrl, wsUrl, source: 'runtime' };
    }
  }

  const buildApi = readBuildApiUrl();
  if (buildApi && !isLocalhost(buildApi)) {
    const wsUrl = readBuildWsUrl() || deriveWsFromApi(buildApi);
    return { apiUrl: buildApi, wsUrl, source: 'build' };
  }

  if (typeof window !== 'undefined' && buildApi && isLocalhost(buildApi)) {
    console.error(
      '[98+] NEXT_PUBLIC_API_URL points to localhost but app runs on',
      window.location.origin,
      '— set NEXT_PUBLIC_API_URL to your backend tunnel and restart next dev',
    );
  }

  return {
    apiUrl: buildApi || 'https://98plusapi-production.up.railway.app',
    wsUrl: readBuildWsUrl() || 'wss://98plusapi-production.up.railway.app/ws',
    source: buildApi ? 'build' : 'unset',
  };
}

export function getApiUrl(): string {
  return getClientConfig().apiUrl;
}

export function getWsUrl(): string {
  return getClientConfig().wsUrl;
}

/** Browser is local Next.js dev (localhost / LAN). */
export function isBrowserLocalDev(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
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
  if (isLocalhost(apiUrl) && !isLocalhost(window.location.hostname)) {
    return false;
  }
  return !isLocalhost(apiUrl) || isLocalhost(window.location.hostname);
}
