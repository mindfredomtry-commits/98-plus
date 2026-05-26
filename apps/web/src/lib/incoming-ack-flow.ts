import type { BanInteraction } from '@98plus/shared';
import { api } from './api';
import { markIncomingAcknowledgedLocally } from './acknowledged-incoming';

export async function acknowledgeIncomingOnServer(
  banId: string,
  token: string | null,
  userId: string,
): Promise<BanInteraction | null> {
  if (!token || !banId) return null;
  const res = await api<{ ok: boolean; ban: BanInteraction | null }>(
    `/bans/${banId}/incoming/ack`,
    { method: 'POST', token },
  );
  if (res.ban?.incomingAcknowledged) {
    markIncomingAcknowledgedLocally(userId, banId);
  }
  return res.ban ?? null;
}

/** Persist ack on server; only then write localStorage. */
export async function acknowledgeIncomingFully(
  banId: string,
  token: string | null,
  userId: string,
): Promise<BanInteraction | null> {
  try {
    return await acknowledgeIncomingOnServer(banId, token, userId);
  } catch {
    return null;
  }
}
