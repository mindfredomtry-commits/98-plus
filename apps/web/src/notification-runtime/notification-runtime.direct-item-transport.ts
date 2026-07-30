/**
 * Minimal direct-item transport for coordinator-driven deeplink entry.
 */
import type { BanInteraction, BanResult } from '@98plus/shared';
import { api } from '@/lib/api';
import { enrichBanInteraction } from '@/lib/user-public-avatar';
import {
  toDirectNotificationItem,
  type DirectItemTransport,
} from './notification-runtime.direct-entry';
import type { NotificationItem, NotificationItemKind } from './notification-runtime.types';

export function createDirectItemTransport(
  getToken: () => string | null,
): DirectItemTransport {
  return async ({ targetId, targetKind }) => {
    const token = getToken();
    if (!token) {
      throw new Error('NO_TOKEN');
    }
    const kind: NotificationItemKind = targetKind ?? 'incoming';
    if (kind === 'result') {
      const res = await api<{ result: BanResult }>(
        `/bans/${encodeURIComponent(targetId)}/result`,
        { token },
      );
      if (!res?.result?.id) throw new Error('RESULT_NOT_FOUND');
      return toDirectNotificationItem('result', res.result);
    }
    if (kind === 'check') {
      const res = await api<{ ban: BanInteraction | null }>(
        `/bans/${encodeURIComponent(targetId)}/check`,
        { token },
      );
      if (!res?.ban?.id) throw new Error('CHECK_NOT_FOUND');
      return toDirectNotificationItem(
        'check',
        enrichBanInteraction(res.ban),
      );
    }
    const res = await api<{ ban: BanInteraction }>(
      `/bans/${encodeURIComponent(targetId)}/open`,
      { token },
    );
    if (!res?.ban?.id) throw new Error('INCOMING_NOT_FOUND');
    return toDirectNotificationItem(
      'incoming',
      enrichBanInteraction(res.ban),
    ) as NotificationItem;
  };
}
