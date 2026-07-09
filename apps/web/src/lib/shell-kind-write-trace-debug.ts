'use client';

import type { QueuedOverlay } from '@/lib/overlay-queue';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type ShellKindWriteTraceInput = {
  prevShellKind: string | null;
  nextShellKind: string | null;
  source: string;
  reason?: string | null;
  calledFrom?: string | null;
  activeKind?: string | null;
  ownerDisplayKind?: string | null;
  currentHeadKind?: string | null;
  queueKinds?: string[];
  queueIds?: string[];
  activeNotificationChain?: boolean | null;
  notificationOverlayVisible?: boolean | null;
  visualQueueDimSessionLive?: boolean | null;
  queueClaimsNotificationScreen?: boolean | null;
  renderBranch?: string | null;
  effectiveShellKind?: string | null;
  displayShellKind?: string | null;
  queueShellRendersResultOverlay?: boolean | null;
  queueResultOverlayClaimed?: boolean | null;
  resultBanId?: string | null;
  ownerDisplayBanId?: string | null;
};

type ShellKindWriteHooks = {
  readEnrichment: () => Partial<ShellKindWriteTraceInput>;
};

let hooks: ShellKindWriteHooks | null = null;
let lastWriteSig = '';
let lastWriteAt = 0;

function captureStack(): string {
  try {
    return new Error('SHELL_KIND_WRITE_TRACE').stack ?? '';
  } catch {
    return '';
  }
}

function queueKindsFrom(queue: QueuedOverlay[] | undefined): string[] {
  return queue?.map((item) => item.kind) ?? [];
}

function queueIdsFrom(queue: QueuedOverlay[] | undefined): string[] {
  return (
    queue
      ?.map((item) => queueHeadIdFrom(item))
      .filter((id): id is string => id != null) ?? []
  );
}

export function registerShellKindWriteTraceHooks(
  next: ShellKindWriteHooks | null,
): void {
  hooks = next;
}

/**
 * Derived shellKind has no setState — treat each observed prev→next change
 * on a shell derivation track as a "write" for diagnostics.
 */
export function logShellKindWriteTrace(input: ShellKindWriteTraceInput): void {
  if (!isClientDiagTraceEnvironment()) return;
  if (input.prevShellKind === input.nextShellKind) return;

  const enrichment = hooks?.readEnrichment() ?? {};
  const now = diagTraceNow();
  const payload = {
    timestamp: now,
    prevShellKind: input.prevShellKind,
    nextShellKind: input.nextShellKind,
    source: input.source,
    reason:
      input.reason ??
      `${input.prevShellKind ?? 'null'}->${input.nextShellKind ?? 'null'}`,
    calledFrom: input.calledFrom ?? input.source,
    stack: captureStack(),
    activeKind: input.activeKind ?? enrichment.activeKind ?? null,
    ownerDisplayKind:
      input.ownerDisplayKind ?? enrichment.ownerDisplayKind ?? null,
    currentHeadKind:
      input.currentHeadKind ?? enrichment.currentHeadKind ?? null,
    queueKinds: input.queueKinds ?? enrichment.queueKinds ?? [],
    queueIds: input.queueIds ?? enrichment.queueIds ?? [],
    activeNotificationChain:
      input.activeNotificationChain ??
      enrichment.activeNotificationChain ??
      null,
    notificationOverlayVisible:
      input.notificationOverlayVisible ??
      enrichment.notificationOverlayVisible ??
      null,
    visualQueueDimSessionLive:
      input.visualQueueDimSessionLive ??
      enrichment.visualQueueDimSessionLive ??
      null,
    queueClaimsNotificationScreen:
      input.queueClaimsNotificationScreen ??
      enrichment.queueClaimsNotificationScreen ??
      null,
    renderBranch: input.renderBranch ?? enrichment.renderBranch ?? null,
    effectiveShellKind:
      input.effectiveShellKind ?? enrichment.effectiveShellKind ?? null,
    displayShellKind:
      input.displayShellKind ?? enrichment.displayShellKind ?? null,
    queueShellRendersResultOverlay:
      input.queueShellRendersResultOverlay ??
      enrichment.queueShellRendersResultOverlay ??
      null,
    queueResultOverlayClaimed:
      input.queueResultOverlayClaimed ??
      enrichment.queueResultOverlayClaimed ??
      null,
    resultBanId: input.resultBanId ?? enrichment.resultBanId ?? null,
    ownerDisplayBanId:
      input.ownerDisplayBanId ?? enrichment.ownerDisplayBanId ?? null,
  };

  const sig = [
    payload.prevShellKind,
    payload.nextShellKind,
    payload.source,
    payload.activeKind,
    payload.ownerDisplayKind,
    payload.currentHeadKind,
    payload.queueKinds.join(','),
  ].join('|');
  if (sig === lastWriteSig && now - lastWriteAt < 16) return;
  lastWriteSig = sig;
  lastWriteAt = now;

  emitClientDiagTrace('SHELL_KIND_WRITE_TRACE', payload);
}

export function buildShellKindWriteQueueFields(queue: QueuedOverlay[]): {
  queueKinds: string[];
  queueIds: string[];
} {
  return {
    queueKinds: queueKindsFrom(queue),
    queueIds: queueIdsFrom(queue),
  };
}
