import { ANALYTICS_EVENTS, SHARE_PICKER_USERNAME } from '@98plus/shared';
import { deliverDirectChallenge, formatDeliveryError } from '@/lib/deliver-challenge';
import { handleShareChallenge } from '@/lib/share';
import { markFirstBanComplete } from '@/lib/first-ban';
import { api } from '@/lib/api';

export async function shareBanViaTelegram(opts: {
  token: string;
  banText: string;
  durationMinutes: number;
  markFirstBanComplete?: boolean;
  afterShare?: () => Promise<void>;
}): Promise<void> {
  const text = opts.banText.trim();
  if (text.length < 3) {
    throw new Error('Напиши запрет — минимум 3 символа');
  }

  try {
    const res = await deliverDirectChallenge({
      token: opts.token,
      text,
      durationMinutes: opts.durationMinutes,
      receiverUsername: SHARE_PICKER_USERNAME,
      directOnly: false,
    });

    const needsShare = res.requiresShare === true || res.pending === true;
    if (!needsShare || !res.shareUrl) {
      throw new Error('Не удалось создать вызов');
    }

    await handleShareChallenge(text, opts.durationMinutes, res.shareUrl);

    if (opts.markFirstBanComplete) {
      markFirstBanComplete();
    }

    await api('/analytics/track', {
      method: 'POST',
      token: opts.token,
      body: JSON.stringify({ name: ANALYTICS_EVENTS.INVITE_SHARED }),
    }).catch(() => {});

    await opts.afterShare?.();
  } catch (e) {
    throw new Error(formatDeliveryError(e));
  }
}

export async function sendFirstBanChallenge(opts: {
  token: string;
  banText: string;
  durationMinutes: number;
  afterShare?: () => Promise<void>;
}): Promise<void> {
  return shareBanViaTelegram({
    ...opts,
    markFirstBanComplete: true,
  });
}
