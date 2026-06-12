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

export function readDeepLinkRouteBoot(): DeepLinkRouteBoot {
  return boot;
}

export function isActiveBanDeepLinkBooting(): boolean {
  return (
    boot.pendingDeepLinkRoute === 'active-ban' && !boot.initialRouteResolved
  );
}

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
  resolvePendingDeepLinkRoute(
    boot.pendingDeepLinkRoute,
    banId ?? boot.pendingBanId,
  );
}

export function resolvePendingDeepLinkRoute(
  route: PendingDeepLinkRoute,
  banId?: string | null,
): void {
  if (!route) return;
  if (boot.initialRouteResolved) return;
  if (!boot.bootingFromBotLink) return;
  if (boot.pendingDeepLinkRoute !== route) return;
  boot = {
    ...boot,
    bootingFromBotLink: false,
    initialRouteResolved: true,
    pendingDeepLinkRoute: route,
    pendingBanId: banId ?? boot.pendingBanId,
  };
  notifyDeepLinkRouteBoot();
  console.log('[deep-link] initial route resolved', {
    route,
    banId: banId ?? boot.pendingBanId,
  });
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
