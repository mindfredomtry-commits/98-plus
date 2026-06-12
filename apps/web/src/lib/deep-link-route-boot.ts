import { parseStartParam } from '@98plus/shared';
import { readStartParamRawFromLocation } from '@/lib/deep-link-boot-debug';

export type PendingDeepLinkRoute =
  | 'active-ban'
  | 'reply'
  | 'incoming'
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
  const startParamRaw = raw ?? readStartParamRawFromLocation();
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
  if (route === 'active-ban') {
    console.log('[deep-link] suppress default screen', {
      route,
      banId,
      reason: 'active-ban-deeplink-boot',
    });
  }
  return route;
}

export function resolvePendingDeepLinkRoute(
  route: PendingDeepLinkRoute,
  banId?: string | null,
): void {
  if (!route) return;
  boot = {
    ...boot,
    bootingFromBotLink: false,
    initialRouteResolved: true,
    pendingDeepLinkRoute: route,
    pendingBanId: banId ?? boot.pendingBanId,
  };
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
  console.log('[active-repeat-debug] dismiss active ban route', { source });
}

if (typeof window !== 'undefined') {
  armPendingDeepLinkRouteFromStartParam('module-init');
}
