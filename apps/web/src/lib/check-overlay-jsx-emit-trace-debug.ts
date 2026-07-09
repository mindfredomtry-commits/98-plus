'use client';

import type { BanInteraction } from '@98plus/shared';
import { getCheckModalView } from '@98plus/shared';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type QueueShellCheckOverlayJsxTraceInput = {
  willEmitCheckOverlayElement?: boolean;
  contentOnly: boolean;
  visible: boolean;
  checkBan: BanInteraction | null;
  userId?: string | null;
  notificationHostActive: boolean;
  notificationOverlayVisible: boolean;
  queueClaimsNotificationScreen: boolean;
  shellKind: string | null;
  effectiveKind: string | null;
  renderBranch: string | null;
  parentShellMounted: boolean | null;
  notificationQueueShellMounted: boolean | null;
  reason?: string | null;
  guardReason?: string | null;
};

type QueueShellCheckOverlayJsxTraceBase = {
  timestamp: number;
  renderLocation: 'Providers.queue-shell.CheckOverlay';
  contentOnly: boolean;
  visible: boolean;
  checkId: string | null;
  banId: string | null;
  hasCheckBan: boolean;
  hasModalView: boolean;
  notificationHostActive: boolean;
  notificationOverlayVisible: boolean;
  queueClaimsNotificationScreen: boolean;
  shellKind: string | null;
  effectiveKind: string | null;
  renderBranch: string | null;
  actualComponentName: 'CheckOverlay';
  parentShellMounted: boolean | null;
  notificationQueueShellMounted: boolean | null;
  reason: string | null;
};

function buildQueueShellCheckOverlayJsxTraceBase(
  input: QueueShellCheckOverlayJsxTraceInput,
): QueueShellCheckOverlayJsxTraceBase {
  const banId = input.checkBan?.id?.trim() || null;
  const modalView = input.checkBan
    ? getCheckModalView(input.checkBan, input.userId ?? null)
    : null;
  return {
    timestamp: diagTraceNow(),
    renderLocation: 'Providers.queue-shell.CheckOverlay',
    contentOnly: input.contentOnly,
    visible: input.visible,
    checkId: banId,
    banId,
    hasCheckBan: input.checkBan != null,
    hasModalView: modalView != null,
    notificationHostActive: input.notificationHostActive,
    notificationOverlayVisible: input.notificationOverlayVisible,
    queueClaimsNotificationScreen: input.queueClaimsNotificationScreen,
    shellKind: input.shellKind,
    effectiveKind: input.effectiveKind,
    renderBranch: input.renderBranch,
    actualComponentName: 'CheckOverlay',
    parentShellMounted: input.parentShellMounted,
    notificationQueueShellMounted: input.notificationQueueShellMounted,
    reason: input.reason ?? null,
  };
}

let lastEmitSig = '';
let lastSuppressedSig = '';

export function logCheckOverlayJsxEmitTrace(
  input: QueueShellCheckOverlayJsxTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  const payload = {
    ...buildQueueShellCheckOverlayJsxTraceBase(input),
    willEmitCheckOverlayElement: input.willEmitCheckOverlayElement ?? true,
  };
  const sig = `emit|${payload.renderBranch}|${payload.banId}|${payload.visible}|${payload.notificationQueueShellMounted}|${payload.reason}`;
  if (lastEmitSig === sig) return;
  lastEmitSig = sig;
  emitClientDiagTrace('CHECK_OVERLAY_JSX_EMIT_TRACE', payload);
}

export function logCheckOverlayJsxSuppressedTrace(
  input: QueueShellCheckOverlayJsxTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  const payload = {
    ...buildQueueShellCheckOverlayJsxTraceBase(input),
    guardReason: input.guardReason ?? null,
  };
  const sig = `suppressed|${payload.guardReason}|${payload.renderBranch}|${payload.banId}|${payload.visible}|${payload.notificationQueueShellMounted}|${payload.reason}`;
  if (lastSuppressedSig === sig) return;
  lastSuppressedSig = sig;
  emitClientDiagTrace('CHECK_OVERLAY_JSX_SUPPRESSED_TRACE', payload);
}

export function resolveQueueShellCheckOverlayJsxSuppression(input: {
  queueShellRendersResultOverlay: boolean;
  queueResultOverlayClaimed: boolean;
  showCheckOverlayDirect: boolean;
  pathSelected: boolean;
  hasCheckBan: boolean;
  parentShellMounted: boolean;
  notificationQueueShellMounted: boolean;
}): { reason: string; guardReason: string } | null {
  if (!input.parentShellMounted) {
    return {
      reason: 'global-overlay-host-not-mounted',
      guardReason: 'composeBlocksNotificationHost-or-globalOverlayHostActive-false',
    };
  }
  if (!input.notificationQueueShellMounted) {
    return {
      reason: 'notification-queue-shell-not-mounted',
      guardReason: 'overlayVisualShieldCardContentMounted-false',
    };
  }
  if (input.showCheckOverlayDirect) {
    return {
      reason: 'check-direct-path-active',
      guardReason: 'showCheckOverlayDirect',
    };
  }
  if (input.queueShellRendersResultOverlay) {
    return {
      reason: 'result-overlay-branch-priority',
      guardReason: 'queueShellRendersResultOverlay',
    };
  }
  if (input.queueResultOverlayClaimed) {
    return {
      reason: 'queue-result-overlay-claimed',
      guardReason: 'queueResultOverlayClaimed',
    };
  }
  if (input.pathSelected && !input.hasCheckBan) {
    return {
      reason: 'check-shell-path-without-ban',
      guardReason: 'missing-checkBanForShell',
    };
  }
  return null;
}
