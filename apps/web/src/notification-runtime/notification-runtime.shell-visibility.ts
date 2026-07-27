/**
 * Vertical 2 — queue shell mount / visibility from runtime selectors only.
 * Screen-level exclusions (compose / success / product surfaces) are product gates,
 * not lifecycle ownership.
 */
export function resolveQueueShellVisible(input: {
  composeBlocksNotificationHost: boolean;
  sendSuccessCardActive: boolean;
  /** selectOverlayVisible(runtimeState) */
  runtimeOverlayVisible: boolean;
  /**
   * Full-screen product sections (bans / profile / settings / premium / analytics).
   * Blocks paint only — does not own queue/pending/lifecycle.
   */
  productSurfaceBlocksNotificationPaint?: boolean;
}): boolean {
  if (input.composeBlocksNotificationHost) return false;
  if (input.sendSuccessCardActive) return false;
  if (input.productSurfaceBlocksNotificationPaint) return false;
  return input.runtimeOverlayVisible;
}

/**
 * Host mount for NotificationQueueShell / GlobalOverlayHost queue content.
 * visualQueueDim / pins / transitioning are NOT mount authorities.
 */
export function resolveQueueShellHostMount(input: {
  composeBlocksNotificationHost: boolean;
  sendSuccessCardActive: boolean;
  runtimeOverlayVisible: boolean;
  productSurfaceBlocksNotificationPaint?: boolean;
}): boolean {
  return resolveQueueShellVisible(input);
}

/**
 * Canonical presentation selector: runtime display authority + product surface.
 * UI asks only "may notification overlay currently be painted?"
 */
export function notificationOverlayMayMount(input: {
  composeBlocksNotificationHost: boolean;
  sendSuccessCardActive: boolean;
  runtimeOverlayVisible: boolean;
  productSurfaceBlocksNotificationPaint?: boolean;
}): boolean {
  return resolveQueueShellHostMount(input);
}

/** Ordinary lobby open allowed only when runtime says so. */
export function resolveOrdinaryLobbyMayOpen(input: {
  /** selectLobbyMayShow(runtimeState) */
  runtimeLobbyMayShow: boolean;
}): boolean {
  return input.runtimeLobbyMayShow;
}
