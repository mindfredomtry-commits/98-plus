export const NO_HORIZONTAL_PAGER_SELECTOR = '[data-no-horizontal-pager]';
export const GESTURE_EXCLUDE_SELECTOR = '[data-gesture-exclude]';

export const PRESET_CHIP_SELECTOR = '[data-preset-chip]';
export const BAN_INPUT_SELECTOR = '[data-ban-input]';
export const WHAT_BACK_SELECTOR = '[data-what-back]';
export const DURATION_SLIDER_SELECTOR =
  '[data-duration-slider], .instant-ban-what-duration-slider';

export const WHAT_INTERACTIVE_SELECTOR = [
  GESTURE_EXCLUDE_SELECTOR,
  PRESET_CHIP_SELECTOR,
  BAN_INPUT_SELECTOR,
  WHAT_BACK_SELECTOR,
  DURATION_SLIDER_SELECTOR,
  '.instant-ban-what-field',
].join(', ');

/** True when touch should go to the control, not a WhatScreen ritual gesture. */
export function shouldDeferWhatScreenGesture(
  target: EventTarget | null,
): boolean {
  return isWhatInteractiveTarget(target);
}

export type CrossScreenTouchPolicy = 'exclude' | 'defer' | 'normal';

export function isWhatInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(WHAT_INTERACTIVE_SELECTOR) != null;
}

export function getCrossScreenTouchPolicy(
  target: EventTarget | null,
): CrossScreenTouchPolicy {
  if (!(target instanceof Element)) return 'normal';
  if (target.closest(GESTURE_EXCLUDE_SELECTOR)) return 'exclude';
  if (target.closest(NO_HORIZONTAL_PAGER_SELECTOR)) return 'exclude';
  if (isWhatInteractiveTarget(target)) return 'exclude';
  return 'normal';
}

export function isNoHorizontalPagerTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(NO_HORIZONTAL_PAGER_SELECTOR) != null
  );
}

export function isPresetChipTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(PRESET_CHIP_SELECTOR) != null
  );
}
