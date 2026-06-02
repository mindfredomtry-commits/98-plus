export type PayoffAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export const PAYOFF_MORPH_MS = 700;
export const PAYOFF_CARD_WIDTH = 340;
export const PAYOFF_CARD_VW = 0.86;
export const PAYOFF_CARD_MIN_HEIGHT = 240;

export function resolvePayoffCardWidth(viewportWidth = window.innerWidth): number {
  return Math.min(viewportWidth * PAYOFF_CARD_VW, PAYOFF_CARD_WIDTH);
}

export function payoffAnchorFromRect(rect: DOMRect): PayoffAnchor {
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
  };
}
