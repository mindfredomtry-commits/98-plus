import {
  getCheckModalView,
  getCheckViewerRole,
  type BanInteraction,
} from '@98plus/shared';

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

/** Diagnostic for [check-show-decision] logs. */
export function checkShowDecision(
  ban: BanInteraction | null | undefined,
  viewerId: string | null | undefined,
  sessionDismissed: ReadonlySet<string>,
  answeredLocally: ReadonlySet<string>,
  inFlight: ReadonlySet<string>,
  resultOpen: boolean,
): { shouldShow: boolean; reason: string; role: string | null } {
  if (resultOpen) {
    return { shouldShow: false, reason: 'result-open', role: null };
  }
  if (!viewerId) {
    return { shouldShow: false, reason: 'no-auth-user', role: null };
  }
  if (!ban?.id?.trim() || !ban.text?.trim()) {
    return { shouldShow: false, reason: 'invalid-payload', role: null };
  }
  if (ban.status !== 'checking') {
    return { shouldShow: false, reason: `status-${ban.status}`, role: null };
  }
  const role = getCheckViewerRole(viewerId, ban.sender.id, ban.receiver.id);
  if (!role) {
    return { shouldShow: false, reason: 'not-party', role: null };
  }
  if (sessionDismissed.has(ban.id)) {
    return { shouldShow: false, reason: 'session-dismissed', role };
  }
  if (answeredLocally.has(ban.id)) {
    return { shouldShow: false, reason: 'answered-locally', role };
  }
  if (inFlight.has(ban.id)) {
    return { shouldShow: false, reason: 'answer-in-flight', role };
  }
  if (!getCheckModalView(ban, viewerId)) {
    return { shouldShow: false, reason: 'no-modal-view', role };
  }
  return { shouldShow: true, reason: 'show', role };
}
