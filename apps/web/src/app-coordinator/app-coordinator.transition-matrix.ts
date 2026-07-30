/**
 * Normative transition matrix for the App Coordinator foundation.
 *
 * Tests execute the corresponding reducer paths; these rows remain a compact
 * architecture contract for integration and manual review.
 */
export type AppCoordinatorTransitionRow = {
  scenario: string;
  currentMode: string;
  event: string;
  nextMode: string;
  notificationRuntimeAction: string;
  productFlowAction: string;
  resumeDestination: string;
};

export const APP_COORDINATOR_TRANSITION_MATRIX: readonly AppCoordinatorTransitionRow[] =
  [
    {
      scenario: 'ordinary launch',
      currentMode: 'BOOTING',
      event: 'BOOT_COMPLETED(null)',
      nextMode: 'PRODUCT(LOBBY)',
      notificationRuntimeAction: 'bootstrap/restore',
      productFlowAction: 'ENTER_ROUTE(LOBBY)',
      resumeDestination: 'PRODUCT(LOBBY)',
    },
    {
      scenario: 'incoming-ban deeplink',
      currentMode: 'BOOTING | PRODUCT(route)',
      event: 'ENTRY_NOTIFICATION(incoming:itemId) then RUNTIME_CURRENT_CHANGED',
      nextMode: 'NOTIFICATION(itemId) when Runtime presents it',
      notificationRuntimeAction: 'ingest/dedupe into canonical FIFO',
      productFlowAction: 'suspend only when current Product route yields',
      resumeDestination: 'prior PRODUCT(route)',
    },
    {
      scenario: 'status deeplink',
      currentMode: 'BOOTING | PRODUCT(route)',
      event: 'ENTRY_NOTIFICATION(status:itemId) then RUNTIME_CURRENT_CHANGED',
      nextMode: 'NOTIFICATION(itemId) when Runtime presents it',
      notificationRuntimeAction: 'ingest/dedupe into canonical FIFO',
      productFlowAction: 'suspend only when current Product route yields',
      resumeDestination: 'prior PRODUCT(route)',
    },
    {
      scenario: 'pending at boot',
      currentMode: 'BOOTING',
      event: 'BOOT_COMPLETED(currentItemId)',
      nextMode: 'NOTIFICATION(currentItemId)',
      notificationRuntimeAction: 'restore queue/current',
      productFlowAction: 'none',
      resumeDestination: 'PRODUCT(LOBBY)',
    },
    {
      scenario: 'WebSocket during Lobby',
      currentMode: 'PRODUCT(LOBBY)',
      event: 'RUNTIME_CURRENT_CHANGED(itemId)',
      nextMode: 'NOTIFICATION(itemId)',
      notificationRuntimeAction: 'enqueue/dedupe/select current',
      productFlowAction: 'SUSPEND_PRODUCT(LOBBY)',
      resumeDestination: 'PRODUCT(LOBBY)',
    },
    {
      scenario: 'WebSocket during WHO/WHAT/CONFIRM',
      currentMode: 'PRODUCT(WHO|WHAT|CONFIRM)',
      event: 'RUNTIME_CURRENT_CHANGED(itemId)',
      nextMode: 'same PRODUCT(route)',
      notificationRuntimeAction: 'enqueue/dedupe; presentation remains suspended',
      productFlowAction: 'none',
      resumeDestination: 'current PRODUCT route',
    },
    {
      scenario: 'reply from incoming card',
      currentMode: 'NOTIFICATION(incoming:itemId)',
      event: 'REPLY_REQUESTED(source,target,token)',
      nextMode: 'REPLY_COMPOSE(source,target,token,WHAT)',
      notificationRuntimeAction: 'SUSPEND_PRESENTATION(reply-compose)',
      productFlowAction: 'START_REPLY_COMPOSE(WHAT)',
      resumeDestination: 'same source notification; then prior Product route',
    },
    {
      scenario: 'reply from status card',
      currentMode: 'NOTIFICATION(result:itemId)',
      event: 'REPLY_REQUESTED(source,target,token)',
      nextMode: 'REPLY_COMPOSE(source,target,token,WHAT)',
      notificationRuntimeAction: 'SUSPEND_PRESENTATION(reply-compose)',
      productFlowAction: 'START_REPLY_COMPOSE(WHAT)',
      resumeDestination: 'same source notification; then prior Product route',
    },
    {
      scenario: 'reply cancel',
      currentMode: 'REPLY_COMPOSE(source,target,token,route)',
      event: 'REPLY_CANCELLED(token)',
      nextMode: 'NOTIFICATION(source)',
      notificationRuntimeAction: 'RESUME_PRESENTATION without completion',
      productFlowAction: 'CANCEL_REPLY_COMPOSE',
      resumeDestination: 'prior Product route after queue drains',
    },
    {
      scenario: 'reply completion',
      currentMode: 'REPLY_COMPOSE(source,target,token,SUCCESS)',
      event: 'REPLY_COMPLETED then REPLY_RESUME_RESOLVED',
      nextMode: 'NOTIFICATION(next) or PRODUCT(route)',
      notificationRuntimeAction: 'complete source and resume canonical FIFO',
      productFlowAction: 'COMPLETE_REPLY_COMPOSE',
      resumeDestination: 'next notification, otherwise prior Product route',
    },
    {
      scenario: 'ordinary compose from Lobby',
      currentMode: 'PRODUCT(LOBBY)',
      event: 'PRODUCT_COMPOSE_REQUESTED',
      nextMode: 'PRODUCT(WHO)',
      notificationRuntimeAction: 'SUSPEND_PRESENTATION(product-flow)',
      productFlowAction: 'ENTER_ROUTE(WHO)',
      resumeDestination: 'PRODUCT(LOBBY)',
    },
    {
      scenario: 'queue advancement',
      currentMode: 'NOTIFICATION(current)',
      event: 'RUNTIME_CURRENT_CHANGED(next)',
      nextMode: 'NOTIFICATION(next)',
      notificationRuntimeAction: 'identity-complete current; select next atomically',
      productFlowAction: 'none',
      resumeDestination: 'unchanged Product destination',
    },
    {
      scenario: 'queue drained',
      currentMode: 'NOTIFICATION(current)',
      event: 'RUNTIME_QUEUE_DRAINED',
      nextMode: 'saved PRODUCT(route)',
      notificationRuntimeAction: 'idle/empty',
      productFlowAction: 'ENTER_ROUTE(saved route)',
      resumeDestination: 'saved PRODUCT(route)',
    },
    {
      scenario: 'reconnect',
      currentMode: 'any AppMode',
      event: 'RECONNECT_STARTED / RECONNECT_COMPLETED',
      nextMode: 'same AppMode',
      notificationRuntimeAction: 'recover/order/dedupe',
      productFlowAction: 'none',
      resumeDestination: 'unchanged',
    },
    {
      scenario: 'repeated deeplink',
      currentMode: 'any AppMode',
      event: 'same ENTRY_NOTIFICATION(itemId)',
      nextMode: 'unchanged until Runtime reports canonical current',
      notificationRuntimeAction: 'ingest request; Runtime dedupes identity',
      productFlowAction: 'none',
      resumeDestination: 'unchanged',
    },
  ] as const;
