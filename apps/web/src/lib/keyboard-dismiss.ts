const DEFAULT_KEYBOARD_SETTLE_MS = 100;

/** Blur ban textarea and any focused control (closes mobile keyboard). */
export function blurActiveInputs(): void {
  if (typeof document === 'undefined') return;
  document.querySelector<HTMLElement>('.ban-textarea')?.blur();
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

/**
 * Run callback after keyboard collapse / viewport settle (Telegram WebView).
 * Uses rAF + short delay so success modal does not animate with keyboard.
 */
export function afterKeyboardCollapse(
  cb: () => void,
  delayMs: number = DEFAULT_KEYBOARD_SETTLE_MS,
): void {
  if (typeof window === 'undefined') {
    cb();
    return;
  }
  blurActiveInputs();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.setTimeout(cb, delayMs);
    });
  });
}
