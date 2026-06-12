'use client';

import { useSyncExternalStore } from 'react';
import {
  isDeepLinkRouteBootPending,
  subscribeDeepLinkRouteBoot,
} from '@/lib/deep-link-route-boot';

/** True while bot/deep-link start_param is armed but route not yet resolved. */
export function useDeepLinkRouteBootPending(): boolean {
  return useSyncExternalStore(
    subscribeDeepLinkRouteBoot,
    isDeepLinkRouteBootPending,
    () => false,
  );
}
