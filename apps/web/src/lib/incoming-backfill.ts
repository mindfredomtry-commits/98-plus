import { api } from './api';
import { hydrateAcknowledgedIncomingIds } from './acknowledged-incoming';

const ranForUserIds = new Set<string>();

/**
 * Sync user-dismissed incoming ban ids from localStorage to the server once per page load.
 * Only ids the user explicitly acked — never fresh unseen bans.
 */
export async function backfillAcknowledgedIncomingOnce(
  token: string,
  userId: string | null | undefined,
): Promise<void> {
  if (!userId) return;
  if (ranForUserIds.has(userId)) return;
  ranForUserIds.add(userId);

  const banIds = hydrateAcknowledgedIncomingIds(userId);
  if (banIds.length === 0) return;

  try {
    await api<{ ok: boolean; count: number }>('/bans/incoming/backfill-ack', {
      method: 'POST',
      token,
      body: JSON.stringify({ banIds }),
    });
  } catch {
    /* client-side guards still apply */
  }
}
