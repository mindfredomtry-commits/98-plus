export type ResultReplyLogStage = 'start' | 'selected-user' | 'what-visible';

export type ResultNavLogStage =
  | 'to-bans'
  | 'next-overlay'
  | 'lobby-fallback'
  | 'open-bans-overlay';

export function logResultReply(
  stage: ResultReplyLogStage,
  data: Record<string, unknown>,
): void {
  console.log('[RESULT REPLY]', stage, data);
}

export function logResultNav(
  stage: ResultNavLogStage,
  data: Record<string, unknown>,
): void {
  console.log('[RESULT NAV]', stage, data);
}
