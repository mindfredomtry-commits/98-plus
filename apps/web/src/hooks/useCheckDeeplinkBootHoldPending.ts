'use client';

import { useSyncExternalStore } from 'react';
import {
  isCheckDeeplinkBootHoldActive,
  subscribeCheckDeeplinkBootHold,
} from '@/lib/check-deeplink-boot-hold';

/** True from check payload parsed until overlay set or explicit lobby fallback. */
export function useCheckDeeplinkBootHoldPending(): boolean {
  return useSyncExternalStore(
    subscribeCheckDeeplinkBootHold,
    isCheckDeeplinkBootHoldActive,
    () => false,
  );
}
