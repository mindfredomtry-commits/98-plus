/** Ref-counted scroll lock — only while modals/overlays are open. */
let lockCount = 0;

export function resetScrollLock(): void {
  if (typeof document === 'undefined') return;
  lockCount = 0;
  document.documentElement.classList.remove('scroll-lock');
}

export function acquireScrollLock(): void {
  if (typeof document === 'undefined') return;
  lockCount += 1;
  if (lockCount === 1) {
    document.documentElement.classList.add('scroll-lock');
  }
}

export function releaseScrollLock(): void {
  if (typeof document === 'undefined') return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.documentElement.classList.remove('scroll-lock');
  }
}
