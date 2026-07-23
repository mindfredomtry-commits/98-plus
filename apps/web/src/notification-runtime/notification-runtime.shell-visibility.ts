/**
 * Vertical 2 — queue shell mount / visibility from runtime selectors only.
 * Screen-level exclusions (compose / success) are product gates, not lifecycle.
 */
export function resolveQueueShellVisible(input: {
  composeBlocksNotificationHost: boolean;
  sendSuccessCardActive: boolean;
  /** selectOverlayVisible(runtimeState) */
  runtimeOverlayVisible: boolean;
}): boolean {
  if (input.composeBlocksNotificationHost) return false;
  if (input.sendSuccessCardActive) return false;
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
}): boolean {
  return resolveQueueShellVisible(input);
}

/** Ordinary lobby open allowed only when runtime says so. */
export function resolveOrdinaryLobbyMayOpen(input: {
  /** selectLobbyMayShow(runtimeState) */
  runtimeLobbyMayShow: boolean;
}): boolean {
  return input.runtimeLobbyMayShow;
}
