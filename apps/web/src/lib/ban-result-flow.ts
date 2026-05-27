import type { BanResult, ResultOpenMode } from '@98plus/shared';
import { shouldOpenBanResult } from '@98plus/shared';
import { api } from './api';
import {
  isDismissedResultLocally,
  markDismissedResultLocally,
} from './dismissed-results';

export function shouldShowBanResult(
  result: BanResult | null | undefined,
  mode: ResultOpenMode,
  banId?: string | null,
): boolean {
  if (banId && isDismissedResultLocally(banId, result?.viewerId ?? null)) return false;
  return shouldOpenBanResult(result, mode);
}

export async function acknowledgeBanResultOnServer(
  banId: string,
  token: string | null,
): Promise<void> {
  if (!token || !banId) return;
  try {
    await api(`/bans/${banId}/result/ack`, { method: 'POST', token });
  } catch {
    /* best effort */
  }
}

export function dismissBanResultLocally(
  banId: string,
  viewerId?: string | null,
) {
  markDismissedResultLocally(banId, viewerId ?? null);
}
