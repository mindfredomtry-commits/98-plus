export type PayoffAnchor = {
  centerX: number;
  centerY: number;
  size: number;
};

export const PAYOFF_MORPH_MS = 700;
export const PAYOFF_CARD_WIDTH = 340;
export const PAYOFF_CARD_VW = 0.86;

export function resolvePayoffCardWidth(viewportWidth = window.innerWidth): number {
  return Math.min(viewportWidth * PAYOFF_CARD_VW, PAYOFF_CARD_WIDTH);
}
