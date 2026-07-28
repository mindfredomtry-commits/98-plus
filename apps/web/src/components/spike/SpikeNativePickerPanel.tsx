'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useApp } from '../Providers';

type SpikeRequestView = {
  id: string;
  status: string;
  telegramRequestId: number;
  preparedButtonId: string | null;
  selectedTelegramUserId: string | null;
  selectedFirstName: string | null;
  selectedLastName: string | null;
  selectedUsername: string | null;
  hasPhotoMeta: boolean;
  messageFromId: string | null;
  registeredInApp: boolean | null;
  requestChatCallback: boolean | null;
  errorMessage: string | null;
  resultLabel: 'PENDING' | 'SELECTED' | 'EXPIRED' | 'ERROR' | 'CANCELLED';
};

type BeginResponse = {
  preparedId: string;
  request: SpikeRequestView;
  miniAppCall?: string;
  botApiMethod?: string;
};

function getWebApp(): {
  requestChat?: (id: string, cb?: (ok: boolean) => void) => void;
  version?: string;
  isVersionAtLeast?: (v: string) => boolean;
} | undefined {
  return (
    window as Window & {
      Telegram?: { WebApp?: Record<string, unknown> };
    }
  ).Telegram?.WebApp as
    | {
        requestChat?: (id: string, cb?: (ok: boolean) => void) => void;
        version?: string;
        isVersionAtLeast?: (v: string) => boolean;
      }
    | undefined;
}

/**
 * SPIKE ONLY — proves savePreparedKeyboardButton + WebApp.requestChat + users_shared.
 * Shown only when NEXT_PUBLIC_SPIKE_NATIVE_PICKER=1. Does not touch WHO / SocialContact / WHAT.
 */
export function SpikeNativePickerPanel() {
  const { token } = useApp();
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [request, setRequest] = useState<SpikeRequestView | null>(null);
  const [callbackType, setCallbackType] = useState<string>('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pushLog = useCallback((line: string) => {
    setLog((prev) => [`${new Date().toISOString().slice(11, 19)} ${line}`, ...prev].slice(0, 40));
  }, []);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const refresh = useCallback(
    async (id: string) => {
      if (!token) return;
      try {
        const res = await api<{ request: SpikeRequestView }>(
          `/spike/native-picker/${encodeURIComponent(id)}`,
          { token, retries: 0 },
        );
        setRequest(res.request);
        if (res.request.resultLabel !== 'PENDING') {
          stopPoll();
          pushLog(
            `resolved: ${res.request.resultLabel} tg=${res.request.selectedTelegramUserId} registered=${String(res.request.registeredInApp)}`,
          );
        }
      } catch (err) {
        pushLog(`poll error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [token, stopPoll, pushLog],
  );

  const startPoll = useCallback(
    (id: string) => {
      stopPoll();
      pollRef.current = setInterval(() => {
        void refresh(id);
      }, 1200);
    },
    [stopPoll, refresh],
  );

  const runSpike = useCallback(async () => {
    if (!token || busy) return;
    setBusy(true);
    setRequest(null);
    setCallbackType('');
    pushLog('POST /spike/native-picker/begin …');

    try {
      const begin = await api<BeginResponse>('/spike/native-picker/begin', {
        method: 'POST',
        token,
        body: JSON.stringify({}),
        retries: 0,
      });
      setRequest(begin.request);
      pushLog(
        `preparedId=${begin.preparedId} request_id=${begin.request.telegramRequestId} botApi=${begin.botApiMethod ?? 'savePreparedKeyboardButton'}`,
      );

      const tg = getWebApp();
      const version = tg?.version ?? 'unknown';
      const hasRequestChat = typeof tg?.requestChat === 'function';
      const atLeast96 =
        typeof tg?.isVersionAtLeast === 'function'
          ? tg.isVersionAtLeast('9.6')
          : false;
      pushLog(
        `WebApp version=${version} hasRequestChat=${hasRequestChat} isVersionAtLeast(9.6)=${atLeast96}`,
      );

      if (!hasRequestChat || !tg?.requestChat) {
        pushLog('BLOCKED: Telegram.WebApp.requestChat missing on this client');
        setBusy(false);
        return;
      }

      pushLog(`calling Telegram.WebApp.requestChat(${begin.preparedId})`);
      startPoll(begin.request.id);

      tg.requestChat(begin.preparedId, (ok: boolean) => {
        const t = typeof ok;
        setCallbackType(`typeof=${t} value=${String(ok)}`);
        pushLog(`requestChat callback: typeof=${t} value=${JSON.stringify(ok)}`);
        void api(`/spike/native-picker/${encodeURIComponent(begin.request.id)}/callback`, {
          method: 'POST',
          token,
          body: JSON.stringify({ ok: ok === true }),
          retries: 0,
        }).catch(() => {});
        void refresh(begin.request.id);
      });
    } catch (err) {
      pushLog(`begin failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [token, busy, pushLog, startPoll, refresh]);

  return (
    <div
      className="spike-native-picker"
      data-spike-native-picker=""
      style={{
        marginTop: '1rem',
        padding: '0.75rem',
        borderRadius: '0.75rem',
        border: '1px dashed rgba(255,180,80,0.45)',
        background: 'rgba(40,20,0,0.35)',
        fontSize: '0.75rem',
        color: 'var(--98-text-secondary)',
      }}
    >
      <p style={{ margin: '0 0 0.5rem', fontWeight: 700, color: '#ffb84d' }}>
        SPIKE · native WHO picker
      </p>
      <p style={{ margin: '0 0 0.75rem', lineHeight: 1.35 }}>
        savePreparedKeyboardButton(request_users) → WebApp.requestChat →
        users_shared. No SocialContact / WHAT / invite.
      </p>
      <button
        type="button"
        disabled={busy || !token}
        onClick={() => {
          void runSpike();
        }}
        data-spike-native-picker-run=""
        style={{
          width: '100%',
          padding: '0.65rem',
          borderRadius: '0.5rem',
          border: '1px solid rgba(255,180,80,0.5)',
          background: 'rgba(255,180,80,0.15)',
          color: '#ffe0a8',
          fontWeight: 700,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy ? 'Running…' : 'Run native picker spike'}
      </button>

      {request ? (
        <div
          data-spike-native-picker-result=""
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem',
            borderRadius: '0.5rem',
            background: 'rgba(0,0,0,0.35)',
            lineHeight: 1.45,
          }}
        >
          <div>
            <strong>{request.resultLabel}</strong>
          </div>
          <div>status: {request.status}</div>
          <div>selected telegram user id: {request.selectedTelegramUserId ?? '—'}</div>
          <div>
            registered in 98+:{' '}
            {request.registeredInApp == null
              ? '—'
              : request.registeredInApp
                ? 'YES'
                : 'NO'}
          </div>
          <div>
            name: {[request.selectedFirstName, request.selectedLastName]
              .filter(Boolean)
              .join(' ') || '—'}
          </div>
          <div>username: {request.selectedUsername ?? '(none)'}</div>
          <div>hasPhotoMeta: {String(request.hasPhotoMeta)}</div>
          <div>message.from.id: {request.messageFromId ?? '—'}</div>
          <div>request_id: {request.telegramRequestId}</div>
          <div>requestChat callback: {callbackType || String(request.requestChatCallback)}</div>
          {request.errorMessage ? <div>error: {request.errorMessage}</div> : null}
        </div>
      ) : null}

      <ul
        style={{
          margin: '0.75rem 0 0',
          paddingLeft: '1rem',
          maxHeight: '8rem',
          overflow: 'auto',
        }}
      >
        {log.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

export function isSpikeNativePickerEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SPIKE_NATIVE_PICKER === '1';
}
