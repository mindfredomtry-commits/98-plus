import { parseStartParam } from '@98plus/shared';
import { readStartParamRawFromLocation } from '@/lib/deep-link-boot-debug';

export function isCheckDeepLinkStartParamPending(): boolean {
  const raw = readStartParamRawFromLocation();
  return parseStartParam(raw ?? undefined)?.type === 'check';
}

export function readCheckDeepLinkBanIdFromStartParam(): string | null {
  const raw = readStartParamRawFromLocation();
  const action = parseStartParam(raw ?? undefined);
  if (action?.type !== 'check') return null;
  const banId = action.banId.trim();
  return banId || null;
}
