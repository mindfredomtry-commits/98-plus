'use client';

import { useEffect, useState } from 'react';
import { ANALYTICS_EVENTS } from '@98plus/shared';
import { shareDeepLink } from '@/lib/share';
import { api } from '@/lib/api';
import { useApp } from './Providers';
import { useTelegram } from '@/hooks/useTelegram';

export function InviteBar() {
  const { token } = useApp();
  const { haptic } = useTelegram();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api<{ startParam: string | null; link: string | null }>(
      '/bans/invite-link',
      { token },
    ).then((r) => {
      if (r.startParam?.startsWith('u_')) {
        setUsername(r.startParam.slice(2));
      }
    });
  }, [token]);

  if (!username) return null;

  return (
    <button
      type="button"
      onClick={() => {
        haptic('light');
        shareDeepLink(
          { type: 'invite', username },
          '98+ — отправь мне запрет 🚫',
        );
        api('/analytics/track', {
          method: 'POST',
          token: token!,
          body: JSON.stringify({ name: ANALYTICS_EVENTS.INVITE_SHARED }),
        }).catch(() => {});
      }}
      className="w-full text-center text-sm text-accent py-2"
    >
      🔗 Пригласить друга
    </button>
  );
}
