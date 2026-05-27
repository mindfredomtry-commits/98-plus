import { getCheckModalView, type BanInteraction } from '@98plus/shared';

/** Minimal guard — show check modal as soon as auth user is party to a pending check. */
export function shouldShowCheckOverlay(
  ban: BanInteraction | null | undefined,
  viewerId: string | null | undefined,
  sessionDismissed: ReadonlySet<string>,
  answeredLocally: ReadonlySet<string>,
  inFlight: ReadonlySet<string>,
  resultOpen: boolean,
): boolean {
  if (resultOpen) return false;
  if (!viewerId || !ban?.id?.trim() || !ban.text?.trim()) return false;
  if (ban.status !== 'checking') return false;
  if (!getCheckModalView(ban, viewerId)) return false;
  if (sessionDismissed.has(ban.id)) return false;
  if (answeredLocally.has(ban.id)) return false;
  if (inFlight.has(ban.id)) return false;
  return true;
}

export function pickCheckForOverlay(
  ban: BanInteraction | null | undefined,
  viewerId: string | null | undefined,
  sessionDismissed: ReadonlySet<string>,
  answeredLocally: ReadonlySet<string>,
  inFlight: ReadonlySet<string>,
  resultOpen: boolean,
): BanInteraction | null {
  if (!shouldShowCheckOverlay(
    ban,
    viewerId,
    sessionDismissed,
    answeredLocally,
    inFlight,
    resultOpen,
  )) {
    return null;
  }
  return ban!;
}
