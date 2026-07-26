/**
 * Host-result neutralize for V4 overboard.
 *
 * After runtime CARD_ACTION consumes an incoming via overboard, the product
 * does not insert a result head. Passive WS/poll host path must not re-open an
 * overboard ResultOverlay / DirectOverboard for that ban.
 */
const consumed = new Set<string>();

function norm(banId: string | null | undefined): string {
  return (banId ?? '').trim();
}

export function noteRuntimeOverboardHeadConsumed(banId: string): void {
  const id = norm(banId);
  if (!id) return;
  consumed.add(id);
}

export function wasRuntimeOverboardHeadConsumed(
  banId: string | null | undefined,
): boolean {
  const id = norm(banId);
  if (!id) return false;
  return consumed.has(id);
}

export function resetRuntimeOverboardHeadConsumedForTest(): void {
  consumed.clear();
}
