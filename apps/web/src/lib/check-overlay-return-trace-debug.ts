'use client';

import type { BanInteraction } from '@98plus/shared';
import { getCheckModalView } from '@98plus/shared';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

type CheckModalView = ReturnType<typeof getCheckModalView>;

export type CheckOverlayEntryTraceInput = {
  contentOnly?: boolean;
  checkDirect?: boolean;
  embedded?: boolean;
  visible: boolean;
  checkBan: BanInteraction | null;
  visibilityReason?: string;
  userId?: string | null;
};

export type CheckOverlayEntryTrace = {
  timestamp: number;
  source: 'CheckOverlayInner-entry';
  sourceFile: 'CheckOverlay.tsx';
  propsKeys: string[];
  contentOnly: boolean;
  checkDirect: boolean;
  visible: boolean;
  checkId: string | null;
  banId: string | null;
  hasCheckBan: boolean;
  hasModalView: boolean;
};

export function logCheckOverlayEntryTrace(
  input: CheckOverlayEntryTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  const banId = input.checkBan?.id?.trim() || null;
  const modalView = input.checkBan
    ? getCheckModalView(input.checkBan, input.userId ?? null)
    : null;
  const payload: CheckOverlayEntryTrace = {
    timestamp: diagTraceNow(),
    source: 'CheckOverlayInner-entry',
    sourceFile: 'CheckOverlay.tsx',
    propsKeys: [
      'embedded',
      'contentOnly',
      'checkDirect',
      'visible',
      'checkBan',
      'visibilityReason',
    ],
    contentOnly: input.contentOnly ?? false,
    checkDirect: input.checkDirect ?? false,
    visible: input.visible,
    checkId: banId,
    banId,
    hasCheckBan: input.checkBan != null,
    hasModalView: modalView != null,
  };
  emitClientDiagTrace('CHECK_OVERLAY_ENTRY_TRACE', payload);
}

export type CheckOverlayExceptionTraceInput = {
  error: unknown;
  contentOnly?: boolean;
  checkDirect?: boolean;
  visible: boolean;
  checkBan: BanInteraction | null;
  userId?: string | null;
};

export type CheckOverlayExceptionTrace = {
  timestamp: number;
  source: 'CheckOverlayInner';
  sourceFile: 'CheckOverlay.tsx';
  name: string;
  message: string;
  stack: string | null;
  checkId: string | null;
  banId: string | null;
  contentOnly: boolean;
  checkDirect: boolean;
  visible: boolean;
  hasCheckBan: boolean;
  hasModalView: boolean;
};

export function logCheckOverlayExceptionTrace(
  input: CheckOverlayExceptionTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  const banId = input.checkBan?.id?.trim() || null;
  const modalView = input.checkBan
    ? getCheckModalView(input.checkBan, input.userId ?? null)
    : null;
  const error =
    input.error instanceof Error
      ? input.error
      : new Error(
          typeof input.error === 'string'
            ? input.error
            : 'Non-Error throw in CheckOverlayInner',
        );
  const payload: CheckOverlayExceptionTrace = {
    timestamp: diagTraceNow(),
    source: 'CheckOverlayInner',
    sourceFile: 'CheckOverlay.tsx',
    name: error.name,
    message: error.message,
    stack: error.stack ?? null,
    checkId: banId,
    banId,
    contentOnly: input.contentOnly ?? false,
    checkDirect: input.checkDirect ?? false,
    visible: input.visible,
    hasCheckBan: input.checkBan != null,
    hasModalView: modalView != null,
  };
  emitClientDiagTrace('CHECK_OVERLAY_EXCEPTION_TRACE', payload);
}

export type CheckOverlayReturnTraceInput = {
  returnBranch: string;
  returnsNull: boolean;
  visible: boolean;
  checkBan: BanInteraction | null;
  modalView: CheckModalView;
  user: { id?: string } | null | undefined;
  embedded?: boolean;
  contentOnly?: boolean;
  checkDirect?: boolean;
  visibilityReason?: string;
  guardReason?: string | null;
  reason?: string | null;
  activeKind?: string | null;
  shellKind?: string | null;
  effectiveKind?: string | null;
};

export type CheckOverlayReturnTrace = {
  timestamp: number;
  source: 'CheckOverlay';
  returnBranch: string;
  returnsNull: boolean;
  visible: boolean;
  checkId: string | null;
  banId: string | null;
  hasBan: boolean;
  hasPayload: boolean;
  hasUser: boolean;
  hasAvatar: boolean;
  hasTitle: boolean;
  hasActions: boolean;
  status: string | null;
  checkStatus: string | null;
  activeKind: string | null;
  shellKind: string | null;
  effectiveKind: string | null;
  notificationHostMounted: boolean | null;
  overlayHostMounted: boolean | null;
  cardContentMounted: boolean | null;
  reason: string | null;
  guardReason: string | null;
  propsKeys: string[];
  propsSnapshot: Record<string, unknown>;
};

let emittedSig = '';

function readHostMountSnapshot(): Pick<
  CheckOverlayReturnTrace,
  'notificationHostMounted' | 'overlayHostMounted' | 'cardContentMounted'
> {
  if (typeof document === 'undefined') {
    return {
      notificationHostMounted: null,
      overlayHostMounted: null,
      cardContentMounted: null,
    };
  }
  const notificationHost = document.querySelector('[data-notification-layer]');
  const overlayHost = document.querySelector('.overlay-card-portal-host');
  const cardContent = document.querySelector(
    '.modal-card--check, [data-overlay-user-card].modal-card--check',
  );
  return {
    notificationHostMounted: notificationHost != null,
    overlayHostMounted: overlayHost != null,
    cardContentMounted: cardContent != null,
  };
}

function buildCheckOverlayReturnTrace(
  input: CheckOverlayReturnTraceInput,
): CheckOverlayReturnTrace {
  const banId = input.checkBan?.id?.trim() || null;
  const hostMounts = readHostMountSnapshot();
  return {
    timestamp: diagTraceNow(),
    source: 'CheckOverlay',
    returnBranch: input.returnBranch,
    returnsNull: input.returnsNull,
    visible: input.visible,
    checkId: banId,
    banId,
    hasBan: input.checkBan != null,
    hasPayload: input.checkBan != null,
    hasUser: input.user != null,
    hasAvatar: input.modalView?.displayedUser != null,
    hasTitle: Boolean(input.modalView?.title),
    hasActions: input.modalView != null && input.visible,
    status: input.checkBan?.status ?? null,
    checkStatus: input.checkBan?.status ?? null,
    activeKind: input.activeKind ?? null,
    shellKind: input.shellKind ?? null,
    effectiveKind: input.effectiveKind ?? null,
    notificationHostMounted: hostMounts.notificationHostMounted,
    overlayHostMounted: hostMounts.overlayHostMounted,
    cardContentMounted: hostMounts.cardContentMounted,
    reason: input.reason ?? input.visibilityReason ?? null,
    guardReason: input.guardReason ?? null,
    propsKeys: [
      'embedded',
      'contentOnly',
      'checkDirect',
      'visible',
      'checkBan',
      'visibilityReason',
    ],
    propsSnapshot: {
      embedded: input.embedded ?? false,
      contentOnly: input.contentOnly ?? false,
      checkDirect: input.checkDirect ?? false,
      visible: input.visible,
      visibilityReason: input.visibilityReason ?? null,
      checkBanId: banId,
      hasModalView: input.modalView != null,
      modalRole: input.modalView?.role ?? null,
    },
  };
}

function buildReturnTraceSignature(trace: CheckOverlayReturnTrace): string {
  return [
    trace.returnBranch,
    trace.returnsNull,
    trace.visible,
    trace.banId,
    trace.hasBan,
    trace.hasPayload,
    trace.hasUser,
    trace.hasAvatar,
    trace.hasTitle,
    trace.hasActions,
    trace.status,
    trace.activeKind,
    trace.shellKind,
    trace.effectiveKind,
    trace.notificationHostMounted,
    trace.overlayHostMounted,
    trace.cardContentMounted,
    trace.reason,
    trace.guardReason,
    trace.propsSnapshot.embedded,
    trace.propsSnapshot.contentOnly,
    trace.propsSnapshot.checkDirect,
    trace.propsSnapshot.hasModalView,
    trace.propsSnapshot.modalRole,
  ].join('|');
}

export function logCheckOverlayReturnTrace(
  input: CheckOverlayReturnTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  const payload = buildCheckOverlayReturnTrace(input);
  const sig = buildReturnTraceSignature(payload);
  if (emittedSig === sig) return;
  emittedSig = sig;
  emitClientDiagTrace('CHECK_OVERLAY_RETURN_TRACE', payload);
}
