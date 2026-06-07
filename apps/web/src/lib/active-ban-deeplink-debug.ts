/** Active-ban deep link diagnostics (sender "Ты запретил" message). */

export type ActiveBanDeeplinkStage =
  | 'telegram-open'
  | 'payload'
  | 'ban-id'
  | 'active-card-visible'
  | 'lobby-blocked'
  | 'wrong-reply-flow-blocked';

export type ActiveBanDeeplinkSnapshot = {
  stage: ActiveBanDeeplinkStage | null;
  payload: string | null;
  banId: string | null;
  lobbyBlocked: boolean;
  bansOverlayOpen: boolean;
  cardVisible: boolean;
};

let snapshot: ActiveBanDeeplinkSnapshot = {
  stage: null,
  payload: null,
  banId: null,
  lobbyBlocked: false,
  bansOverlayOpen: false,
  cardVisible: false,
};

export function logActiveBanDeeplink(
  stage: ActiveBanDeeplinkStage,
  patch: Partial<ActiveBanDeeplinkSnapshot> = {},
): void {
  snapshot = { ...snapshot, stage, ...patch };
  console.log('[ACTIVE BAN DEEPLINK]', snapshot);
}
