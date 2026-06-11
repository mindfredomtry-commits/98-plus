import type { BanInteraction } from '@98plus/shared';

export const REPLY_DEEPLINK_FAST_TIMEOUT_MS = 2000;

/** Placeholder copy while /open loads — real text replaces on hydrate. */
export const REPLY_DEEPLINK_SHELL_TEXT = '…';

export const REPLY_DEEPLINK_SHELL_SENDER_ID = 'reply-deeplink-shell';

export function buildReplyDeeplinkShellBan(
  banId: string,
  viewerId: string,
): BanInteraction {
  const now = new Date().toISOString();
  return {
    id: banId,
    text: REPLY_DEEPLINK_SHELL_TEXT,
    status: 'pending',
    durationMinutes: 60,
    isIncoming: true,
    createdAt: now,
    expiresAt: null,
    checkDueAt: null,
    threadId: banId,
    sender: {
      id: REPLY_DEEPLINK_SHELL_SENDER_ID,
      telegramId: '',
      username: null,
      firstName: '',
      avatarUrl: null,
      photoUrl: null,
      aura: 'ember',
      auraLabel: '',
      energyPercent: 0,
      streak: 0,
      isOnboarded: true,
    },
    receiver: {
      id: viewerId,
      telegramId: '',
      username: null,
      firstName: '',
      avatarUrl: null,
      photoUrl: null,
      aura: 'ember',
      auraLabel: '',
      energyPercent: 0,
      streak: 0,
      isOnboarded: true,
    },
  };
}
