import type { BanInteraction, BanResult } from '@98plus/shared';
import { getApiUrl } from './config';
import { ApiError } from './api';
import {
  fetchWithTimeout,
  isAbortError,
  RequestTimeoutError,
} from './request-timeout';
import { traceOverboardFlow } from './overboard-flow-debug';

export const OVERBOARD_POST_TIMEOUT_MS = 5000;

export type OverboardPostResponse = {
  ok?: boolean;
  status?: string;
  ban?: BanInteraction;
  result?: BanResult | null;
};

export async function postOverboardWithTrace(
  banId: string,
  token: string,
): Promise<OverboardPostResponse> {
  const base = getApiUrl();
  const url = `${base}/bans/${banId}/overboard`;

  traceOverboardFlow('api-fetch-start', { banId, url, timeoutMs: OVERBOARD_POST_TIMEOUT_MS });

  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      mode: 'cors',
      credentials: 'omit',
      timeoutMs: OVERBOARD_POST_TIMEOUT_MS,
    });

    traceOverboardFlow('api-fetch-resolved', {
      banId,
      status: res.status,
      ok: res.ok,
    });

    const text = await res.text();
    traceOverboardFlow('response-status', {
      banId,
      status: res.status,
      ok: res.ok,
    });
    traceOverboardFlow('response-text', {
      banId,
      text: text.slice(0, 800),
      length: text.length,
    });

    let data: OverboardPostResponse = {};
    if (text) {
      try {
        data = JSON.parse(text) as OverboardPostResponse;
      } catch {
        traceOverboardFlow('api-fetch-error', {
          banId,
          reason: 'non-json-response',
        });
        throw new ApiError(
          'Некорректный ответ сервера',
          res.status,
          url,
        );
      }
    }

    if (!res.ok) {
      const errMsg =
        (typeof (data as { error?: string }).error === 'string' &&
          (data as { error?: string }).error) ||
        res.statusText ||
        `HTTP ${res.status}`;
      traceOverboardFlow('api-fetch-error', { banId, status: res.status, message: errMsg });
      throw new ApiError(errMsg, res.status, url);
    }

    traceOverboardFlow('api-response-raw', { banId, res: data });
    return data;
  } catch (e) {
    if (isAbortError(e)) {
      traceOverboardFlow('api-timeout', {
        banId,
        timeoutMs: OVERBOARD_POST_TIMEOUT_MS,
      });
      throw new RequestTimeoutError('Перебор: таймаут ответа сервера');
    }
    if (e instanceof RequestTimeoutError) {
      traceOverboardFlow('api-timeout', { banId, message: e.message });
      throw e;
    }
    if (!(e instanceof ApiError)) {
      traceOverboardFlow('api-fetch-error', {
        banId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
    throw e;
  } finally {
    traceOverboardFlow('api-fetch-finally', { banId });
  }
}
