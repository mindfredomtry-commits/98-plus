export const NO_HORIZONTAL_PAGER_SELECTOR = '[data-no-horizontal-pager]';

export const PRESET_CHIP_SELECTOR = '[data-preset-chip]';

/** Higher axis-lock before horizontal pager claims field / back taps. */
export const HORIZONTAL_PAGER_DEFER_SELECTOR =
  '.instant-ban-what-input, .instant-ban-what-field, .instant-ban-flow__back';

export type CrossScreenTouchPolicy = 'exclude' | 'defer' | 'normal';

export function getCrossScreenTouchPolicy(
  target: EventTarget | null,
): CrossScreenTouchPolicy {
  if (!(target instanceof Element)) return 'normal';
  if (target.closest(NO_HORIZONTAL_PAGER_SELECTOR)) return 'exclude';
  if (target.closest(PRESET_CHIP_SELECTOR)) return 'exclude';
  if (target.closest(HORIZONTAL_PAGER_DEFER_SELECTOR)) return 'defer';
  return 'normal';
}

export function isNoHorizontalPagerTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(NO_HORIZONTAL_PAGER_SELECTOR) != null
  );
}
