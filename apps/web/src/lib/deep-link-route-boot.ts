import { parseStartParam } from '@98plus/shared';
import { readPriorityStartParamRaw } from '@/lib/overlay-priority';

export type PendingDeepLinkRoute =
  | 'active-ban'
  | 'reply'
  | 'incoming'
  | 'repeat'
  | 'check'
  | 'result'
  | null;

export type BootRouteReleaseReason =
  | 'reply-card-ready'
  | 'reply-completed-route'
  | 'incoming-queued'
  | 'check-queued'
  | 'result-queued'
  | 'repeat-ready'
  | 'active-ban-ready'
  | 'route-handled'
  | 'timeout-fallback'
  | 'abort';

export const BOOT_ROUTE_FALLBACK_MS = 1500;

type DeepLinkRouteBoot = {
  bootingFromBotLink: boolean;
  pendingDeepLinkRoute: PendingDeepLinkRoute;
  pendingBanId: string | null;
  initialRouteResolved: boolean;
};

let boot: DeepLinkRouteBoot = {
  bootingFromBotLink: false,
  pendingDeepLinkRoute: null,
  pendingBanId: null,
  initialRouteResolved: false,
};

const listeners = new Set<() => void>();

function notifyDeepLinkRouteBoot(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeDeepLinkRouteBoot(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Sync: bot/deep-link entry with route not yet resolved (show AppBootScreen). */
export function isDeepLinkRouteBootPending(): boolean {
  return boot.bootingFromBotLink && !boot.initialRouteResolved;
}

export function hasTelegramDeepLinkStartParam(): boolean {
  return parseStartParam(readPriorityStartParamRaw() ?? undefined) != null;
}

function routeFromAction(
  action: ReturnType<typeof parseStartParam>,
): PendingDeepLinkRoute {
  if (!action) return null;
  switch (action.type) {
    case 'active':
      return 'active-ban';
    case 'reply':
      return 'reply';
    case 'ban':
      return 'incoming';
    case 'repeat':
    case 'repeat_ban_from_invite':
      return 'repeat';
    case 'check':
      return 'check';
    case 'result':
      return 'result';
    default:
      return null;
  }
}

function banIdFromAction(
  action: ReturnType<typeof parseStartParam>,
): string | null {
  if (!action || !('banId' in action)) return null;
  return action.banId;
}

/** Reply deeplink surfaces an incoming overlay — both resolve the same boot gate. */
function routeResolvesPending(
  pending: PendingDeepLinkRoute,
  route: PendingDeepLinkRoute,
): boolean {
  if (!pending || !route) return false;
  if (pending === route) return true;
  if (pending === 'reply' && route === 'incoming') return true;
  return false;
}

export function readDeepLinkRouteBoot(): DeepLinkRouteBoot {
  return boot;
}

export function isActiveBanDeepLinkBooting(): boolean {
  return (
    boot.pendingDeepLinkRoute === 'active-ban' && !boot.initialRouteResolved
  );
}

/** Force-release boot overlay (card ready, queue armed, timeout, abort). */
export function releaseDeepLinkRouteBoot(
  reason: BootRouteReleaseReason,
  banId?: string | null,
): void {
  if (!boot.bootingFromBotLink || boot.initialRouteResolved) return;
  const route = boot.pendingDeepLinkRoute;
  boot = {
    ...boot,
    bootingFromBotLink: false,
    initialRouteResolved: true,
    pendingBanId: banId ?? boot.pendingBanId,
  };
  notifyDeepLinkRouteBoot();
  console.log(`[boot-route-debug] resolved by ${reason}`, {
    route,
    banId: banId ?? boot.pendingBanId,
  });
}

/** @alias releaseDeepLinkRouteBoot */
export const resolveDeepLinkRouteBoot = releaseDeepLinkRouteBoot;

export function armPendingDeepLinkRouteFromStartParam(
  source: string,
  raw?: string | null,
): PendingDeepLinkRoute {
  const startParamRaw = raw ?? readPriorityStartParamRaw();
  console.log('[deep-link] raw start param', { source, raw: startParamRaw });
  const action = parseStartParam(startParamRaw ?? undefined);
  const route = routeFromAction(action);
  const banId = banIdFromAction(action);
  console.log('[deep-link] parsed route', {
    source,
    type: action?.type ?? null,
    banId,
    route,
  });
  if (!route) return null;
  boot = {
    ...boot,
    bootingFromBotLink: true,
    pendingDeepLinkRoute: route,
    pendingBanId: banId,
    initialRouteResolved: false,
  };
  notifyDeepLinkRouteBoot();
  console.log('[boot-route-debug] pending start', { source, route, banId });
  if (route === 'active-ban') {
    console.log('[deep-link] suppress default screen', {
      route,
      banId,
      reason: 'active-ban-deeplink-boot',
    });
  }
  return route;
}

/** End boot for the armed pending route (abort / reject paths). */
export function resolveActiveDeepLinkRouteBoot(banId?: string | null): void {
  if (!boot.pendingDeepLinkRoute) return;
  releaseDeepLinkRouteBoot('abort', banId ?? boot.pendingBanId);
}

export function resolvePendingDeepLinkRoute(
  route: PendingDeepLinkRoute,
  banId?: string | null,
): void {
  if (!route) return;
  if (boot.initialRouteResolved) return;
  if (!boot.bootingFromBotLink) return;
  if (!routeResolvesPending(boot.pendingDeepLinkRoute, route)) return;

  const reason: BootRouteReleaseReason =
    route === 'reply' || boot.pendingDeepLinkRoute === 'reply'
      ? 'reply-card-ready'
      : route === 'incoming'
        ? 'incoming-queued'
        : route === 'check'
          ? 'check-queued'
          : route === 'result'
            ? 'result-queued'
            : route === 'repeat'
              ? 'repeat-ready'
              : route === 'active-ban'
                ? 'active-ban-ready'
                : 'route-handled';

  releaseDeepLinkRouteBoot(reason, banId);
}

export function logOpenActiveBanCard(banId: string, source: string): void {
  console.log('[deep-link] open active ban card', { banId, source });
}

/** Leave active-ban deep link route after user starts a new send from that card. */
export function dismissActiveBanDeepLinkRoute(source: string): void {
  if (boot.pendingDeepLinkRoute !== 'active-ban') return;
  boot = {
    ...boot,
    bootingFromBotLink: false,
    pendingDeepLinkRoute: null,
    pendingBanId: null,
    initialRouteResolved: true,
  };
  notifyDeepLinkRouteBoot();
  console.log('[active-repeat-debug] dismiss active ban route', { source });
}

if (typeof window !== 'undefined') {
  armPendingDeepLinkRouteFromStartParam('module-init');
}
