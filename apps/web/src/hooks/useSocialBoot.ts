'use client';

import { useEffect, useRef } from 'react';
import { buildStartParam, parseStartParam } from '@98plus/shared';
import { isValidIncomingOverlayPayload } from '@/lib/incoming-challenge';
import type { BanResult, BanInteraction } from '@98plus/shared';
import { api } from '@/lib/api';
import {
  patchDeepLinkBootDebug,
  readStartParamRawFromLocation,
} from '@/lib/deep-link-boot-debug';
import { logReplyFlow } from '@/lib/reply-handoff-debug';
import { logActiveBanDeeplink } from '@/lib/active-ban-deeplink-debug';
import {
  lockNotificationQueue,
  logOverlayPriority,
  logResultOpenAttempt,
  shouldBlockResultOpen,
  tryLockFromStartParam,
} from '@/lib/overlay-priority';
import { useTelegram } from './useTelegram';

interface BootHandlers {
  token: string | null;
  userId: string | null;
  ready: boolean;
  setIncomingBan: (ban: BanInteraction | null) => void;
  openDeepLinkCheck: (ban: BanInteraction) => void;
  openDeepLinkRepeat: (ban: BanInteraction) => void;
  openDeepLinkReply: (ban: BanInteraction) => Promise<void>;
  openDeepLinkActive: (ban: BanInteraction) => void;
  armActiveBanDeepLinkEarly: (banId: string) => void;
  openBanResult: (r: BanResult | null | undefined, mode: 'explicit') => void;
  reloadPending: () => Promise<void>;
  setDeepLinkReplyBooting: (v: boolean) => void;
  armReplyDeepLink: (banId: string) => void;
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
    case 'reply':
    case 'active':
      return `${action.type}:${action.banId}`;
    default:
      return null;
  }
}

export function useSocialBoot(h: BootHandlers) {
  const { startParam } = useTelegram();
  const processedRef = useRef<string | null>(null);

  useEffect(() => {
    const startParamRaw = readStartParamRawFromLocation();
    const actionFromHook = parseStartParam(startParam);
    const actionFromRaw = parseStartParam(startParamRaw ?? undefined);
    const bootKey = deepLinkBootKey(startParam);

    patchDeepLinkBootDebug({
      startParamRaw,
      startParamResolved: startParam?.trim() || null,
      parsedType: actionFromHook?.type ?? actionFromRaw?.type ?? null,
      parsedBanId:
        (actionFromHook && 'banId' in actionFromHook
          ? actionFromHook.banId
          : null) ??
        (actionFromRaw && 'banId' in actionFromRaw ? actionFromRaw.banId : null),
      deepLinkDetected: Boolean(bootKey),
    });

    if (!h.token || !h.ready || !h.userId) {
      patchDeepLinkBootDebug({
        deepLinkConsumed: false,
        bootBlocker: !h.token
          ? 'waiting-token'
          : !h.ready
            ? 'waiting-tg-ready'
            : 'waiting-userId',
      });
      return;
    }

    if (!bootKey || processedRef.current === bootKey) {
      patchDeepLinkBootDebug({
        deepLinkConsumed: processedRef.current === bootKey,
        bootBlocker: !bootKey ? 'no-boot-key' : 'dup-boot-key',
      });
      return;
    }

    const action = parseStartParam(startParam);
    if (!action) {
      patchDeepLinkBootDebug({
        deepLinkConsumed: false,
        bootBlocker: 'parse-null',
      });
      return;
    }

    processedRef.current = bootKey;
    tryLockFromStartParam('useSocialBoot-handler');
    patchDeepLinkBootDebug({
      deepLinkConsumed: false,
      bootBlocker: 'handler-running',
      lastHandler: action.type,
    });

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
          if (result) {
            const block = shouldBlockResultOpen({ resultBanId: result.id });
            logResultOpenAttempt('useSocialBoot-explicit', {
              resultId: result.id,
              mode: 'explicit',
              allowed: !block.blocked,
              blockReason: block.reason,
            });
            if (!block.blocked) {
              h.openBanResult(result, 'explicit');
            }
          }
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
          lockNotificationQueue('repeat-ban-flow', action.banId);
          logOverlayPriority('repeat-flow-start', { banId: action.banId });
          const { ban } = await api<{ ban: BanInteraction }>(
            `/bans/${action.banId}/open`,
            { token: h.token! },
          );
          if (ban) h.openDeepLinkRepeat(ban);
          break;
        }
        case 'reply': {
          h.armReplyDeepLink(action.banId);
          h.setDeepLinkReplyBooting(true);
          logReplyFlow('incoming-loading', {
            banId: action.banId,
            lockActive: true,
          });
          try {
            const { ban } = await api<{ ban: BanInteraction }>(
              `/bans/${action.banId}/open`,
              { token: h.token! },
            );
            if (ban) {
              await h.openDeepLinkReply(ban);
            } else {
              h.setDeepLinkReplyBooting(false);
            }
          } catch {
            h.setDeepLinkReplyBooting(false);
          }
          break;
        }
        case 'active': {
          logActiveBanDeeplink('payload', {
            payload: buildStartParam(action),
            banId: action.banId,
          });
          h.armActiveBanDeepLinkEarly(action.banId);
          const { ban } = await api<{ ban: BanInteraction }>(
            `/bans/${action.banId}/open`,
            { token: h.token! },
          );
          if (ban) h.openDeepLinkActive(ban);
          break;
        }
      }
      patchDeepLinkBootDebug({
        deepLinkConsumed: true,
        bootBlocker: null,
      });
    })().catch(() => {
      processedRef.current = null;
      patchDeepLinkBootDebug({
        deepLinkConsumed: false,
        bootBlocker: 'handler-error',
      });
    });
  }, [
    h.token,
    h.userId,
    h.ready,
    startParam,
    h.setIncomingBan,
    h.openDeepLinkCheck,
    h.openDeepLinkRepeat,
    h.openDeepLinkReply,
    h.openDeepLinkActive,
    h.armActiveBanDeepLinkEarly,
    h.openBanResult,
    h.reloadPending,
    h.setDeepLinkReplyBooting,
    h.armReplyDeepLink,
  ]);
}
