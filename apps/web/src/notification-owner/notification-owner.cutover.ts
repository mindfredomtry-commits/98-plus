/**
 * Cutover switch — Commit A.
 * When true, the live app paints and writes only via notification-owner.
 * Legacy files remain on disk until Commit B deletes them.
 */
export const NOTIFICATION_OWNER_CUTOVER = true;

export function isNotificationOwnerCutoverLive(): boolean {
  return NOTIFICATION_OWNER_CUTOVER;
}
