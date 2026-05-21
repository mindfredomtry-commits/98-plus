import { isIncomingOverlayBan, type BanInteraction } from '@98plus/shared';

/** Fullscreen incoming overlay requires pending status + sender payload. */
export function isValidIncomingOverlayPayload(
  ban: BanInteraction | null | undefined,
): boolean {
  return Boolean(
    ban?.id &&
      ban.sender?.id &&
      isIncomingOverlayBan(ban),
  );
}
