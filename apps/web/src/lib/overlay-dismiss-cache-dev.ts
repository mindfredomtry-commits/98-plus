import { clearLocalOverlayDismissCache } from './overlay-arbiter';

/** Dev-only: expose cache reset on window for manual testing. */
export function installOverlayDismissCacheDevHelper(userId: string | null): void {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') {
    return;
  }
  const w = window as Window & {
    __clearOverlayDismissCache?: (uid?: string) => void;
  };
  w.__clearOverlayDismissCache = (uid?: string) => {
    const target = uid ?? userId;
    if (!target) {
      console.warn('[OVERLAY ARBITER] clear cache: no userId');
      return;
    }
    clearLocalOverlayDismissCache(target);
    console.log('[OVERLAY ARBITER] local dismiss cache cleared for', target);
  };
}
