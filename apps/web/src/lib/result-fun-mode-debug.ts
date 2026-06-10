import type { BanResult } from '@98plus/shared';
import { isResultFunMode } from '@98plus/shared';

export function logResultFunMode(result: BanResult): void {
  const showBadge = isResultFunMode(result);
  console.log('[RESULT FUN MODE] resultId=', result.id);
  console.log('[RESULT FUN MODE] pairBanCount24h=', result.pairBanCount24h ?? '—');
  console.log('[RESULT FUN MODE] economyMode=', result.economyMode ?? '—');
  console.log('[RESULT FUN MODE] showBadge=', showBadge);
}
