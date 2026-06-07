'use client';

import { useEffect, useRef } from 'react';
import { parseStartParam } from '@98plus/shared';
import { isValidIncomingOverlayPayload } from '@/lib/incoming-challenge';
import type { BanResult, BanInteraction } from '@98plus/shared';
import { api } from '@/lib/api';
import { useTelegram } from './useTelegram';

interface BootHandlers {
  token: string | null;
  userId: string | null;
  ready: boolean;
  setIncomingBan: (ban: BanInteraction | null) => void;
  openDeepLinkCheck: (ban: BanInteraction) => void;
  openDeepLinkRepeat: (ban: BanInteraction) => void;
  openBanResult: (r: BanResult | null | undefined, mode: 'explicit') => void;
  reloadPending: () => Promise<void>;
}

function deepLinkBootKey(startParam: string | undefined): string | null {
  const action = parseStartParam(startParam);
  if (!action) return null;
  switch (action.type) {
    case 'invite_token':
      return `invite_token:${action.token}`;
    case 'ban':
    case 'check':
    case 'result':
    case 'repeat':
      return `${action.type}:${action.banId}`;
    default:
      return null;
  }
}

export function useSocialBoot(h: BootHandlers) {
  const { startParam } = useTelegram();
  const processedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!h.token || !h.ready || !h.userId) return;

    const bootKey = deepLinkBootKey(startParam);
    if (!bootKey || processedRef.current === bootKey) return;

    const action = parseStartParam(startParam);
    if (!action) return;

    processedRef.current = bootKey;

    (async () => {
      switch (action.type) {
        case 'invite_token':
          await h.reloadPending();
          break;
        case 'result': {
          const { result } = await api<{ result: BanResult }>(
            `/bans/${action.banId}/result`,
            { token: h.token! },
          );
          if (result) h.openBanResult(result, 'explicit');
          break;
        }
        case 'check': {
          const { ban } = await api<{ ban: BanInteraction }>(
            `/bans/${action.banId}/open`,
            { token: h.token! },
          );
          if (ban) h.openDeepLinkCheck(ban);
          break;
        }
        case 'ban': {
          const { ban } = await api<{ ban: BanInteraction }>(
            `/bans/${action.banId}/open`,
            { token: h.token! },
          );
          if (ban && isValidIncomingOverlayPayload(ban)) h.setIncomingBan(ban);
          break;
        }
        case 'repeat': {
          const { ban } = await api<{ ban: BanInteraction }>(
            `/bans/${action.banId}/open`,
            { token: h.token! },
          );
          if (ban) h.openDeepLinkRepeat(ban);
          break;
        }
      }
    })().catch(() => {
      processedRef.current = null;
    });
  }, [
    h.token,
    h.userId,
    h.ready,
    startParam,
    h.setIncomingBan,
    h.openDeepLinkCheck,
    h.openDeepLinkRepeat,
    h.openBanResult,
    h.reloadPending,
  ]);
}
