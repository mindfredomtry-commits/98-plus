import type { BanInteraction } from '@98plus/shared';
import { api, ApiError } from '@/lib/api';

export async function getSavedBans(
  token: string,
): Promise<BanInteraction[]> {
  const res = await api<{ items: BanInteraction[] }>('/bans/saved', {
    token,
    retries: 1,
  });
  return Array.isArray(res.items) ? res.items : [];
}

export async function saveBan(token: string, banId: string): Promise<void> {
  console.info('[98+] ARCHIVE SAVE REQUEST', { banId });
  try {
    await api(`/bans/${banId}/save`, { method: 'POST', token, retries: 0 });
    console.info('[98+] ARCHIVE SAVE SUCCESS', { banId });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : undefined;
    const message = e instanceof Error ? e.message : String(e);
    console.error('[98+] ARCHIVE SAVE FAILED', { banId, status, message });
    throw e;
  }
}

export async function unsaveBan(token: string, banId: string): Promise<void> {
  console.info('[98+] ARCHIVE SAVE REQUEST', { banId, action: 'delete' });
  try {
    await api(`/bans/${banId}/save`, { method: 'DELETE', token, retries: 0 });
    console.info('[98+] ARCHIVE SAVE SUCCESS', { banId, action: 'delete' });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : undefined;
    const message = e instanceof Error ? e.message : String(e);
    console.error('[98+] ARCHIVE SAVE FAILED', { banId, status, message });
    throw e;
  }
}
