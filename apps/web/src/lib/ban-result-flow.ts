import type { BanResult, ResultOpenMode } from '@98plus/shared';
import {
  getCheckViewerRole,
  shouldOpenBanResult,
} from '@98plus/shared';
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
  if (banId && isDismissedResultLocally(banId)) return false;
  return shouldOpenBanResult(result, mode);
}

/** Diagnostic for [result-show-decision] logs. */
export function resultShowDecision(
  result: BanResult | null | undefined,
  viewerId: string | null | undefined,
  mode: ResultOpenMode = 'live',
): { shouldShow: boolean; reason: string; role: string | null } {
  if (!viewerId) {
    return { shouldShow: false, reason: 'no-auth-user', role: null };
  }
  if (!result?.id?.trim()) {
    return { shouldShow: false, reason: 'no-result', role: null };
  }
  if (isDismissedResultLocally(result.id)) {
    return { shouldShow: false, reason: 'dismissed-locally', role: null };
  }
  const role =
    getCheckViewerRole(viewerId, result.sender.id, result.receiver.id) ??
    null;
  if (!role) {
    return { shouldShow: false, reason: 'not-party', role: null };
  }
  if (!shouldOpenBanResult(result, mode)) {
    return { shouldShow: false, reason: 'invalid-payload', role };
  }
  return { shouldShow: true, reason: 'show', role };
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

export function dismissBanResultLocally(banId: string) {
  markDismissedResultLocally(banId);
}
