import { api } from './api';
import { markIncomingAcknowledgedLocally } from './acknowledged-incoming';

export function acknowledgeIncomingOptimistic(banId: string) {
  markIncomingAcknowledgedLocally(banId);
}

export async function acknowledgeIncomingOnServer(
  banId: string,
  token: string | null,
): Promise<void> {
  if (!token || !banId) return;
  try {
    await api(`/bans/${banId}/incoming/ack`, { method: 'POST', token });
  } catch {
    /* local cache is fallback until next session sync */
  }
}

export function acknowledgeIncomingBan(
  banId: string,
  token: string | null,
) {
  acknowledgeIncomingOptimistic(banId);
  void acknowledgeIncomingOnServer(banId, token);
}
