'use client';

import { useEffect, useRef } from 'react';
import { parseStartParam } from '@98plus/shared';
import { isValidIncomingOverlayPayload } from '@/lib/incoming-challenge';
import type { BanResult, BanInteraction } from '@98plus/shared';
import { api } from '@/lib/api';
import { useTelegram } from './useTelegram';

interface BootHandlers {
  token: string | null;
  ready: boolean;
  setIncomingBan: (ban: BanInteraction | null) => void;
  setCheckBan: (ban: BanInteraction | null) => void;
  setResult: (r: BanResult | null) => void;
  reloadPending: () => Promise<void>;
}

export function useSocialBoot(h: BootHandlers) {
  const { startParam } = useTelegram();
  const ran = useRef(false);

  useEffect(() => {
    if (!h.token || !h.ready || ran.current) return;

    const action = parseStartParam(startParam);
    if (!action) return;

    ran.current = true;

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
          h.setResult(result);
          break;
        }
        case 'check': {
          const { ban } = await api<{ ban: BanInteraction }>(
            `/bans/${action.banId}/open`,
            { token: h.token! },
          );
          if (ban) h.setCheckBan(ban);
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
      }
    })().catch(() => {
      ran.current = false;
    });
  }, [
    h.token,
    h.ready,
    startParam,
    h.setIncomingBan,
    h.setCheckBan,
    h.setResult,
    h.reloadPending,
  ]);
}
