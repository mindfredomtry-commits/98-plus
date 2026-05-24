import { isDevAuthEnabled } from './dev-auth';

export interface BanNotificationDebug {
  attempted: boolean;
  receiverTelegramId: string | null;
  receiverUserId?: string;
  receiverUsername?: string | null;
  senderUserId?: string;
  skippedReason: string | null;
  telegramError: string | null;
  telegramErrorCode?: number;
  sent: boolean;
  isDevFixtureReceiver?: boolean;
}

export function shouldAttachNotificationDebug(): boolean {
  return isDevAuthEnabled();
}
