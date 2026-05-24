import { SYSTEM_VOICE } from '@98plus/shared';
import { getApiUrl, isApiConfiguredForProduction } from './config';
import {
  fetchWithTimeout,
  isAbortError,
  RequestTimeoutError,
} from './request-timeout';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public url?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public url: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

function formatFetchError(url: string, err: unknown): NetworkError {
  const hint = !isApiConfiguredForProduction()
    ? ' (API URL not configured — set NEXT_PUBLIC_API_URL or ?api_url=)'
    : '';
  console.error('[98+ api] Failed to fetch:', url, err);
  const msg =
    err instanceof Error && err.message
      ? `${err.message}${hint}`
      : `Failed to fetch${hint}`;
  return new NetworkError(msg, url, err);
}

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    console.warn('[98+ api] Non-JSON response', res.status, urlFrom(res), text.slice(0, 200));
    return { error: text.slice(0, 120) || res.statusText };
  }
}

function urlFrom(res: Response): string {
  return res.url || 'unknown';
}

export async function api<T>(
  path: string,
  options: RequestInit & {
    token?: string | null;
    retries?: number;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const { token, retries = 2, timeoutMs, ...init } = options;
  const base = getApiUrl();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  let lastErr: Error | null = null;

  for (let i = 0; i <= retries; i++) {
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers as Record<string, string>),
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const fetchInit: RequestInit = {
        ...init,
        headers,
        mode: 'cors',
        credentials: 'omit',
      };

      const res =
        timeoutMs != null
          ? await fetchWithTimeout(url, { ...fetchInit, timeoutMs })
          : await fetch(url, fetchInit);

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        const errMsg =
          (typeof data.error === 'string' && data.error) ||
          res.statusText ||
          `HTTP ${res.status}`;
        console.error('[98+ api]', res.status, url, data);
        throw new ApiError(errMsg, res.status, url);
      }

      return data as T;
    } catch (e) {
      if (e instanceof ApiError) {
        lastErr = e;
        break;
      }
      if (isAbortError(e)) {
        lastErr = new RequestTimeoutError();
        break;
      }
      lastErr = formatFetchError(url, e);
      if (i < retries) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
  }

  throw lastErr ?? new NetworkError(SYSTEM_VOICE.offline, url);
}

/** User-facing message for UI alerts */
export function formatApiUserMessage(err: unknown): string {
  if (err instanceof RequestTimeoutError) return err.message;
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Сессия устарела. Перезапусти Mini App.';
    if (err.status === 403) return 'Недостаточно прав для этого действия.';
    if (err.status === 404) return 'Данные не найдены.';
    if (err.status >= 500) return 'Ошибка сервера. Попробуй через несколько секунд.';
    return err.message;
  }
  if (err instanceof NetworkError) {
    return SYSTEM_VOICE.offline;
  }
  if (err instanceof Error) return err.message;
  return 'Неизвестная ошибка';
}

/** Health check — useful on boot */
export async function pingApi(): Promise<boolean> {
  try {
    await api<{ ok: boolean }>('/health', { retries: 0 });
    return true;
  } catch {
    return false;
  }
}
