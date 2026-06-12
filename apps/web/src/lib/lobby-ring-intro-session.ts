let primedPercent: number | null = null;

/** Boot shell showed the ring at this level — skip 0→N intro in InstantBanFlow. */
export function primeLobbyRingIntroFromBoot(percent: number): void {
  primedPercent = Math.min(100, Math.max(0, percent));
}

export function consumeLobbyRingIntroPrime(): number | null {
  const value = primedPercent;
  primedPercent = null;
  return value;
}
