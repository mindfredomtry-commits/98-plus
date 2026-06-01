'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ANALYTICS_EVENTS } from '@98plus/shared';
import { api } from '@/lib/api';
import {
  getApiUrl,
  getWsUrl,
  isApiConfiguredForProduction,
  logWsUrlResolution,
} from '@/lib/config';

export type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'skipped';

type Handler = (event: {
  type: string;
  payload: unknown;
  eventId?: string;
}) => void;

const MAX_BACKOFF = 30_000;

export function useWebSocket(
  token: string | null,
  onEvent: Handler,
  onReconnect?: () => void,
) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  const [status, setStatus] = useState<WsStatus>('disconnected');
  const [eventLog, setEventLog] = useState<string[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);

  const log = useCallback((msg: string) => {
    if (process.env.NODE_ENV === 'production') return;
    setEventLog((prev) => [msg, ...prev].slice(0, 40));
  }, []);

  const connect = useCallback(() => {
    if (!token || !mountedRef.current) return;

    if (!isApiConfiguredForProduction()) {
      setStatus('skipped');
      log('ws: skipped (API URL not configured)');
      return;
    }

    logWsUrlResolution();
    const wsUrl = getWsUrl();
    const apiUrl = getApiUrl();
    setStatus('connecting');
    log(`ws: connecting ${wsUrl}`);
    const ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      backoffRef.current = 1000;
      setStatus('connected');
      log('ws: connected');
      console.log('[ws-connected]', { phase: 'socket-open', apiUrl, wsUrl });
      onReconnectRef.current?.();
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as {
          type: string;
          payload: unknown;
          eventId?: string;
        };

        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'ping' }));
          return;
        }

        if (data.type === 'connected') {
          const userId = (data.payload as { userId?: string } | undefined)?.userId;
          console.log('[ws-connected]', { userId: userId ?? null });
          return;
        }

        if (data.eventId) {
          if (seenRef.current.has(data.eventId)) return;
          seenRef.current.add(data.eventId);
          if (seenRef.current.size > 200) {
            const arr = [...seenRef.current];
            seenRef.current = new Set(arr.slice(-100));
          }
        }

        log(`← ${data.type}`);
        handlerRef.current(data);
      } catch {
        /* ignore */
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      log('ws: disconnected');
      wsRef.current = null;
      if (!mountedRef.current) return;
      const delay = backoffRef.current;
      backoffRef.current = Math.min(delay * 2, MAX_BACKOFF);
      setTimeout(() => {
        connect();
        onReconnectRef.current?.();
        if (token) {
          api('/users/me', { token }).catch(() => {});
        }
      }, delay);
    };

    ws.onerror = (ev) => {
      const err =
        ev instanceof ErrorEvent && ev.message
          ? ev.message
          : 'WebSocket error';
      console.log('[ws-error]', { wsUrl, apiUrl, error: err });
      log('ws: error');
    };
  }, [token, log]);

  useEffect(() => {
    mountedRef.current = true;
    seenRef.current.clear();
    connect();
    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
    };
  }, [connect]);

  return { status, eventLog };
}
