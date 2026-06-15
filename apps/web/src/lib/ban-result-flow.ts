import type { BanResult, ResultOpenMode } from '@98plus/shared';
import {
  isAutoShowResultOutcome,
  isResultParticipant,
  isValidBanResultPayload,
} from '@98plus/shared';
import { api } from './api';
import { normalizeId } from './normalize-json';
import {
  isDismissedResultLocally,
  markDismissedResultLocally,
} from './dismissed-results';

export function diagnoseResultShow(
  result: BanResult | null | undefined,
  mode: ResultOpenMode,
  authUserId: string | null | undefined,
  banId?: string | null,
): { shouldShow: boolean; reason: string } {
  const id = normalizeId(banId ?? result?.id ?? null);
  const viewer = authUserId ?? result?.viewerId ?? null;

  if (!id) return { shouldShow: false, reason: 'no-ban-id' };
  if (viewer && isDismissedResultLocally(id, viewer)) {
    return { shouldShow: false, reason: 'dismissed-locally' };
  }
  if (!isValidBanResultPayload(result)) {
    return { shouldShow: false, reason: 'invalid-payload' };
  }
  if (!isResultParticipant(result, viewer)) {
    return { shouldShow: false, reason: 'not-participant' };
  }
  if (mode === 'explicit') {
    return { shouldShow: true, reason: 'explicit' };
  }
  if (!isAutoShowResultOutcome(result.outcome)) {
    return { shouldShow: false, reason: `outcome-${result.outcome}` };
  }
  return { shouldShow: true, reason: 'show' };
}

export function shouldShowBanResult(
  result: BanResult | null | undefined,
  mode: ResultOpenMode,
  banId?: string | null,
  authUserId?: string | null,
): boolean {
  return diagnoseResultShow(result, mode, authUserId, banId).shouldShow;
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
