'use client';

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { BanResult, UserPublic } from '@98plus/shared';
import {
  isResultFunMode,
  isValidBanResultPayload,
  RESULT_COPY,
  showFreeModeBanOthersAction,
} from '@98plus/shared';
import {
  evaluateOverlayVisibleContentGate,
  hasVisibleResultOverlayContent,
  resolveResultDisplayHeadline,
  resolveResultOverlayViewerId,
} from '@/lib/result-display-ready';
import {
  logResultRenderBranch,
  logResultRenderSelectionTrace,
} from '@/lib/result-render-selection-trace';
import {
  buildResultOverlayLifecycleBase,
  logResultOverlayActiveProps,
  logResultOverlayCleanup,
  logResultOverlayCloseReason,
  logResultOverlayDismissSource,
  logResultOverlayEffect,
  logResultOverlayLayoutEffect,
  logResultOverlayMount,
  logResultOverlayPaint,
  logResultOverlayUnmount,
  logResultOverlayUnmountWithoutDismiss,
  logResultOverlayUnmountRootTrace,
  logResultOverlayVisibleState,
} from '@/lib/result-overlay-lifecycle-trace';
import { logResultCardUnmounted } from '@/lib/check-chain-drain-debug';
import { readOverlayDiagSnapshot } from '@/lib/incoming-null-root-cause-trace';
import { logResultCardCtaClick } from '@/lib/result-card-dismiss-diag-debug';
import { ANALYTICS_EVENTS } from '@98plus/shared';
import { shareDeepLink } from '@/lib/share';
import { api } from '@/lib/api';
import { getSavedBans, saveBan, unsaveBan } from '@/lib/saved-bans-api';
import { useApp } from './Providers';
import { BigButton } from './BigButton';
import { useTelegram } from '@/hooks/useTelegram';
import { ModalShell } from './ModalShell';

/** Testing: hide «Запретить другим!» on status cards — handlers/mechanics unchanged. */
const SHOW_BAN_OTHERS_BUTTON_UI = false;
import { AvatarImage } from './AvatarImage';
import { userAvatarSrc } from '@/lib/user-public-avatar';
import {
  APP_NOTIFICATION_Z_INDEX,
  DIRECT_OVERBOARD_RESULT_Z_INDEX,
} from '@/lib/overlay-queue';
import { decideCardActionTap } from '@/notification-runtime/notification-runtime.card-action-tap';
import {
  getOverboardClickTs,
  logOverboardPaint,
} from '@/lib/overboard-timing-debug';
import {
  clearOverboardFlashOriginEmitForBan,
  emitOverboardFlashOriginV1,
} from '@/lib/overboard-flash-origin-v1';
import { logResultFunMode } from '@/lib/result-fun-mode-debug';
import { logResultPresentation } from '@/lib/result-ui-debug';
import { markVisibleOverboardTrace } from '@/lib/overboard-flow-debug';
import { logGoToBansNextCardClickLazy, hookGoToBansTraceEnter } from '@/lib/browser-go-to-bans-next-card-debug';
import { emitGoToBansOutcomeSync } from '@/lib/finalize-go-to-bans-sync-trace';
import { resolveOverboardResultOutcome } from '@/lib/overboard-result-chain';
import {
  logDirectOverboardShowableDecision,
  logOverboardResultCtaClick,
} from '@/lib/direct-overboard-close-diag-debug';
import {
  logFinalStatusModalViewDecision,
  logResultCardRenderDecision,
  logResultOverlayBodyDecision,
  logResultOverlayVisibleContentTrace,
  logResultOverlayVisibilityGateTrace,
  logResultOverlayContentCheck,
  logResultOverlayEmptyContentBlocked,
} from '@/lib/overboard-action-queue-debug';
import { BanSaveStar } from './instant-ban/BanSaveStar';
import { ResultShareIcon } from './instant-ban/ResultShareIcon';
import './instant-ban/instant-ban.css';

interface Props {
  result: BanResult;
  onClose: () => void;
  embedded?: boolean;
  contentOnly?: boolean;
  /** Fresh shell + paint timing for direct overboard layer. */
  directPaint?: boolean;
  /** Phase 12.1b: owner-derived architectural visibility — sole render gate. */
  visible: boolean;
  visibilityReason?: string;
  returnsNullReason?: string | null;
  overboardQueueBody?: boolean;
};

type ResultOverlayTraceProps = {
  showable: boolean;
  directPaint: boolean;
  outcome: string;
  contentOnly: boolean;
  resultBanId: string;
  embedded: boolean;
};

const QUEUE_ATOMIC_OVERBOARD_TITLE = 'ПЕРЕБОР 🤙';

function buildSafeQueueAtomicOverboardResult(
  source: BanResult,
  viewerId: string,
): BanResult {
  const banId = source.id.trim();
  const uid = viewerId.trim() || `opt:viewer:${banId}`;
  const stubUser = (id: string, partial?: UserPublic | null): UserPublic => ({
    id,
    telegramId: partial?.telegramId?.trim() || id,
    username: partial?.username ?? null,
    firstName:
      partial?.firstName?.trim() ||
      partial?.username?.replace(/^@/, '').trim() ||
      'Игрок',
    lastName: partial?.lastName ?? null,
    avatarUrl: partial?.avatarUrl ?? partial?.photoUrl ?? null,
    photoUrl: partial?.photoUrl ?? partial?.avatarUrl ?? null,
    aura: partial?.aura ?? 'stable',
    auraLabel: partial?.auraLabel ?? '',
    energyPercent: partial?.energyPercent ?? 50,
    streak: partial?.streak ?? 0,
    isOnboarded: partial?.isOnboarded ?? true,
  });
  const senderId =
    source.sender?.id?.trim() ||
    source.sender?.telegramId?.trim() ||
    `opt:sender:${banId}`;
  const sender = stubUser(senderId, source.sender);
  const receiver = stubUser(uid, { ...source.receiver, id: uid });
  const overboardCopy = RESULT_COPY.overboard;
  return {
    ...source,
    id: banId,
    text: source.text?.trim() ?? '',
    outcome: 'overboard',
    headline: QUEUE_ATOMIC_OVERBOARD_TITLE,
    subline: source.subline?.trim() || overboardCopy.subline,
    viewerId: uid,
    sender,
    receiver,
    opponent: uid === senderId ? receiver : sender,
    confirmations: source.confirmations ?? null,
    energy: source.energy ?? { sender: -8, receiver: -8 },
    farmSkipped: source.farmSkipped ?? false,
    completedAt: source.completedAt || new Date().toISOString(),
    deepLink: source.deepLink ?? '',
    shareLink: source.shareLink ?? '',
    inviteOpponentLink: source.inviteOpponentLink ?? '',
  };
}

function isResultParticipantSafe(
  payload: BanResult,
  activeViewerId: string | null | undefined,
): boolean {
  if (!activeViewerId?.trim()) return false;
  const senderId = payload.sender?.id?.trim() ?? '';
  const receiverId = payload.receiver?.id?.trim() ?? '';
  if (!senderId || !receiverId) return false;
  return activeViewerId === senderId || activeViewerId === receiverId;
}

function traceResultOverlayLifecycle(
  stage: string,
  props: ResultOverlayTraceProps,
  extra?: Record<string, unknown>,
): void {
  markVisibleOverboardTrace(stage, { ...props, ...extra });
}

function ResultOverlayInner({
  result,
  onClose,
  embedded = false,
  contentOnly = false,
  directPaint = false,
  visible,
  visibilityReason,
  returnsNullReason: returnsNullReasonProp = null,
  overboardQueueBody: overboardQueueBodyProp,
}: Props) {
  const {
    openNewBanWhoFlow,
    startReplyFromResult,
    dismissBanResult,
    navigateFromResult,
    token,
    user,
    notificationSessionActive,
    activeOverlayKind,
    overlayQueueLength,
    markOverlayUserAction,
    logCardCloseClick,
    reportOverlayRendered,
    bansCtaQueueSuppress,
    resultCtaBansOverlayOpen,
    bansNavState,
    blockAutoDismissAtomicOverboardResult,
    blockAutoDismissTerminalFinalStatus,
  } = useApp();
  const { haptic, hapticSuccess } = useTelegram();
  const [archiveSaved, setArchiveSaved] = useState(false);
  const resultOverlayMountedRef = useRef(false);
  const goToBansClickInFlightRef = useRef(false);
  /** Sync latch for reply CTA — not a CARD_ACTION; blocks duplicate starts. */
  const replyClickInFlightRef = useRef(false);
  /** Sync latch for ban-others CTA. */
  const banOthersClickInFlightRef = useRef(false);
  const [replyInFlight, setReplyInFlight] = useState(false);
  const [banOthersInFlight, setBanOthersInFlight] = useState(false);
  const [goToBansInFlight, setGoToBansInFlight] = useState(false);
  const dismissInitiatedRef = useRef(false);
  const dismissSourceRef = useRef<string | null>(null);
  const closeReasonRef = useRef<string | null>(null);
  const dismissMetaRef = useRef<{
    source: string;
    closeReason?: string | null;
    initiator: string;
  } | null>(null);
  const prevVisibleRef = useRef<boolean | null>(null);
  const prevActivePropsSigRef = useRef<string | null>(null);

  useEffect(() => {
    resultOverlayMountedRef.current = true;
    return () => {
      resultOverlayMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    goToBansClickInFlightRef.current = false;
    replyClickInFlightRef.current = false;
    banOthersClickInFlightRef.current = false;
    setReplyInFlight(false);
    setBanOthersInFlight(false);
    setGoToBansInFlight(false);
  }, [result.id]);

  const viewerId = resolveResultOverlayViewerId(result, user?.id ?? null);
  const resultStatus =
    (result as BanResult & { status?: string | null }).status ?? null;
  const isOverboardStatusOrOutcome =
    result.outcome === 'overboard' ||
    resultStatus === 'overboard' ||
    result.headline?.trim().toUpperCase().startsWith('ПЕРЕБОР') === true;
  const overboardQueueBody =
    overboardQueueBodyProp ??
    (contentOnly &&
      !directPaint &&
      Boolean(result.id?.trim()) &&
      (visibilityReason === 'overboard-queue-body' ||
        visibilityReason === 'atomic-overboard-fallback' ||
        isOverboardStatusOrOutcome));
  const resolvedViewerId = (
    viewerId ?? result.receiver?.id ?? result.sender?.id ?? ''
  ).trim();
  const returnsNullReason = returnsNullReasonProp;
  const showable = visible;
  const effectiveShowable = visible;

  const lifecycleBase = useCallback(
    () =>
      buildResultOverlayLifecycleBase({
        result,
        resultStatus,
        embedded,
        contentOnly,
        directPaint,
        showable,
        visible,
        visibilityReason,
      }),
    [
      contentOnly,
      directPaint,
      embedded,
      result,
      resultStatus,
      showable,
      visibilityReason,
      visible,
    ],
  );

  const recordDismiss = useCallback(
    (source: string, initiator: string, closeReason?: string | null) => {
      dismissInitiatedRef.current = true;
      dismissSourceRef.current = source;
      if (closeReason != null) {
        closeReasonRef.current = closeReason;
      }
      const base = lifecycleBase();
      logResultOverlayDismissSource({
        ...base,
        source,
        initiator,
        closeReason: closeReason ?? closeReasonRef.current,
      });
      if (closeReason != null) {
        logResultOverlayCloseReason({
          ...base,
          reason: closeReason,
          source,
        });
      }
    },
    [lifecycleBase],
  );

  const renderResult = useMemo((): BanResult => {
    if (!overboardQueueBody) {
      return result;
    }
    return buildSafeQueueAtomicOverboardResult(result, resolvedViewerId);
  }, [overboardQueueBody, resolvedViewerId, result]);

  const tracePropsRef = useRef<ResultOverlayTraceProps>({
    showable,
    directPaint,
    outcome: result.outcome,
    contentOnly,
    resultBanId: result.id,
    embedded,
  });
  tracePropsRef.current = {
    showable,
    directPaint,
    outcome: result.outcome,
    contentOnly,
    resultBanId: result.id,
    embedded,
  };

  const resultCtaBansSessionActive =
    bansCtaQueueSuppress ||
    resultCtaBansOverlayOpen ||
    (bansNavState.origin === 'result-cta' &&
      bansNavState.returnTarget === 'lobby');
  const resultCtaBansSessionRef = useRef(resultCtaBansSessionActive);
  resultCtaBansSessionRef.current = resultCtaBansSessionActive;

  const skipResultOverlayCleanup = useCallback(
    (effect: string) => {
      if (!resultCtaBansSessionRef.current) return false;
      traceResultOverlayLifecycle('RESULT OVERLAY CLEANUP SKIPPED', tracePropsRef.current, {
        reason: 'result-cta-bans-open',
        effect,
      });
      return true;
    },
    [],
  );

  const guardedOnClose = useCallback(() => {
    if (skipResultOverlayCleanup('onClose')) return;
    const meta = dismissMetaRef.current;
    dismissMetaRef.current = null;
    recordDismiss(
      meta?.source ?? 'guarded-on-close',
      meta?.initiator ?? 'ResultOverlay.guardedOnClose',
      meta?.closeReason ?? 'user-close-or-shell',
    );
    logCardCloseClick({
      kind: 'result',
      banId: result.id,
      source: 'result-close',
    });
    onClose();
  }, [logCardCloseClick, onClose, recordDismiss, result.id, skipResultOverlayCleanup]);

  traceResultOverlayLifecycle('RESULT OVERLAY ENTER', tracePropsRef.current, {
    returnsNullReason,
    viewerId,
  });

  console.log('ACTUAL_COMPONENT_RENDER: ResultOverlay', {
    t: performance.now(),
    resultId: result.id,
    banId: result.id,
    status: resultStatus,
    outcome: result.outcome ?? null,
    embedded,
    directPaint,
    contentOnly,
    showable,
    visible,
  });

  if (isOverboardStatusOrOutcome || overboardQueueBody || directPaint) {
    logDirectOverboardShowableDecision({
      banId: result.id,
      resultId: result.id,
      outcome: result.outcome ?? resultStatus,
      hasResult: Boolean(result.id?.trim()),
      showable: effectiveShowable,
      contentOnly,
      embedded,
      directPaint,
      overboardQueueBody,
      returnsNullReason,
      reason: effectiveShowable
        ? overboardQueueBody
          ? 'overboard-queue-body'
          : directPaint
            ? 'direct-paint'
            : 'overboard-status-or-outcome'
        : returnsNullReason ?? 'not-showable',
    });
  }

  logResultCardRenderDecision({
    kind: 'result',
    banId: result.id,
    status: result.outcome ?? resultStatus ?? null,
    shouldRender: effectiveShowable,
    returnNullReason: overboardQueueBody ? null : returnsNullReason,
    isInNotificationQueue: contentOnly && !directPaint,
    activeOverlayKind: 'result',
    activeUserCardHold: null,
    source: directPaint
      ? 'ResultOverlay.directPaint'
      : contentOnly
        ? 'ResultOverlay.contentOnly'
        : 'ResultOverlay.modal',
  });

  useEffect(() => {
    logResultOverlayEffect({
      ...lifecycleBase(),
      effectName: 'mount',
      phase: 'run',
    });
    logResultOverlayMount({
      ...lifecycleBase(),
      returnsNullReason,
      viewerId,
    });
    traceResultOverlayLifecycle('RESULT OVERLAY MOUNT', tracePropsRef.current);
    return () => {
      const base = lifecycleBase();
      if (!dismissInitiatedRef.current) {
        const overlayDiag = readOverlayDiagSnapshot();
        logResultOverlayUnmountWithoutDismiss({
          ...base,
          lastVisible: prevVisibleRef.current,
          dismissSource: dismissSourceRef.current,
          closeReason: closeReasonRef.current,
        });
        logResultOverlayUnmountRootTrace({
          ...base,
          banId: result.id,
          dismissInitiated: dismissInitiatedRef.current,
          closeReason: closeReasonRef.current,
          visible: showable,
          showable,
          queueHeadKind:
            overlayDiag.queueHeadKind ??
            (overlayQueueLength > 0 ? 'unknown' : null),
          activeKind: overlayDiag.activeKind ?? activeOverlayKind,
          notificationSessionActive,
          queueClaimsNotificationScreen:
            overlayDiag.queueClaimsNotificationScreen ??
            overlayQueueLength > 0,
        });
      }
      logResultOverlayUnmount({
        ...base,
        dismissSource: dismissSourceRef.current,
        closeReason: closeReasonRef.current,
        dismissInitiated: dismissInitiatedRef.current,
      });
      logResultOverlayCleanup({
        ...base,
        effectName: 'mount',
        phase: 'unmount-cleanup',
      });
      logResultCardUnmounted({
        banId: result.id,
        outcome: result.outcome ?? null,
        contentOnly,
        directPaint,
      });
      traceResultOverlayLifecycle('RESULT OVERLAY UNMOUNT', tracePropsRef.current, {
        resultCtaBansSession: resultCtaBansSessionRef.current,
        dismissInitiated: dismissInitiatedRef.current,
        dismissSource: dismissSourceRef.current,
        closeReason: closeReasonRef.current,
      });
    };
    // Mount/unmount lifecycle only — props captured via lifecycleBase() at cleanup time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const base = lifecycleBase();
    const sig = JSON.stringify({
      resultId: result.id,
      status: resultStatus,
      embedded,
      directPaint,
      contentOnly,
      showable,
    });
    const prevSig = prevActivePropsSigRef.current;
    if (prevSig != null && prevSig !== sig) {
      const changedFields: string[] = [];
      const prev = JSON.parse(prevSig) as Record<string, unknown>;
      const next = JSON.parse(sig) as Record<string, unknown>;
      for (const key of Object.keys(next)) {
        if (prev[key] !== next[key]) changedFields.push(key);
      }
      logResultOverlayActiveProps({
        ...base,
        changedFields,
        previous: prev,
        next,
      });
    }
    prevActivePropsSigRef.current = sig;
  }, [
    contentOnly,
    directPaint,
    embedded,
    lifecycleBase,
    result.id,
    resultStatus,
    showable,
  ]);

  useEffect(() => {
    const previousVisible = prevVisibleRef.current;
    if (previousVisible != null && previousVisible !== visible) {
      const changedBy = 'props-visible-change';
      logResultOverlayVisibleState({
        ...lifecycleBase(),
        previousVisible,
        nextVisible: visible,
        changedBy,
        closeReason: !visible ? (visibilityReason ?? 'visible-false') : null,
      });
      if (!visible) {
        logResultOverlayDismissSource({
          ...lifecycleBase(),
          source: 'visible-prop-false',
          initiator: changedBy,
          closeReason: visibilityReason ?? 'visible-false',
        });
      }
    }
    prevVisibleRef.current = visible;
  }, [lifecycleBase, visibilityReason, visible]);

  useEffect(() => {
    logResultOverlayEffect({
      ...lifecycleBase(),
      effectName: 'showable-guard',
      phase: 'run',
      showable,
    });
    if (directPaint) return;
    if (!showable) {
      if (
        blockAutoDismissAtomicOverboardResult(
          result.id,
          'ResultOverlay-showable-guard',
        )
      ) {
        return;
      }
      if (
        blockAutoDismissTerminalFinalStatus(
          result.id,
          'ResultOverlay-showable-guard',
        )
      ) {
        return;
      }
      dismissMetaRef.current = {
        source: 'showable-guard-effect',
        closeReason: 'visible-false-auto-close',
        initiator: 'ResultOverlay.showable-guard-effect',
      };
      guardedOnClose();
    }
    return () => {
      if (skipResultOverlayCleanup('onClose-guard')) return;
      logResultOverlayCleanup({
        ...lifecycleBase(),
        effectName: 'showable-guard',
        phase: 'effect-cleanup',
      });
      traceResultOverlayLifecycle('RESULT OVERLAY EFFECT CLEANUP', tracePropsRef.current, {
        effect: 'onClose-guard',
      });
    };
  }, [
    blockAutoDismissAtomicOverboardResult,
    blockAutoDismissTerminalFinalStatus,
    directPaint,
    guardedOnClose,
    lifecycleBase,
    result.id,
    showable,
    skipResultOverlayCleanup,
  ]);

  useLayoutEffect(() => {
    logResultOverlayLayoutEffect({
      ...lifecycleBase(),
      effectName: 'directPaint-dom-raf',
      phase: 'run',
      directPaint,
      showable,
    });
    if (!directPaint || !showable) return;

    traceResultOverlayLifecycle('RESULT OVERLAY RAF SCHEDULED', tracePropsRef.current);

    let rafId = 0;
    rafId = requestAnimationFrame(() => {
      logResultOverlayPaint({
        ...lifecycleBase(),
        effectName: 'directPaint-dom-raf',
        paintPhase: 'directPaint-dom-probe',
      });
      logOverlayTransition('[TRANSITION DELAY USED]', {
        source: 'ResultOverlay-directPaint-raf',
        ms: 0,
        banId: result.id,
      });
      traceResultOverlayLifecycle('RESULT OVERLAY RAF RUN', tracePropsRef.current);

      const layer = document.querySelector('[data-direct-overboard-result]');
      const backdrop = layer?.querySelector('.modal-backdrop') ?? null;
      const card = layer?.querySelector('.modal-card') ?? null;

      const backdropStyle = backdrop ? getComputedStyle(backdrop) : null;
      const cardStyle = card ? getComputedStyle(card) : null;
      const cardRect = card?.getBoundingClientRect();

      markVisibleOverboardTrace('RESULT OVERLAY DOM', {
        backdropFound: backdrop != null,
        cardFound: card != null,
        backdropOpacity: backdropStyle?.opacity ?? null,
        cardOpacity: cardStyle?.opacity ?? null,
        cardVisibility: cardStyle?.visibility ?? null,
        cardDisplay: cardStyle?.display ?? null,
        cardTransform: cardStyle?.transform ?? null,
        cardRect: cardRect
          ? {
              top: cardRect.top,
              left: cardRect.left,
              width: cardRect.width,
              height: cardRect.height,
              bottom: cardRect.bottom,
              right: cardRect.right,
            }
          : null,
      });
    });

    return () => {
      if (skipResultOverlayCleanup('dom-raf')) {
        cancelAnimationFrame(rafId);
        return;
      }
      logResultOverlayLayoutEffect({
        ...lifecycleBase(),
        effectName: 'directPaint-dom-raf',
        phase: 'cleanup',
        rafId,
      });
      logResultOverlayCleanup({
        ...lifecycleBase(),
        effectName: 'directPaint-dom-raf',
        phase: 'layout-cleanup',
        rafId,
      });
      traceResultOverlayLifecycle('RESULT OVERLAY EFFECT CLEANUP', tracePropsRef.current, {
        effect: 'dom-raf',
        rafId,
      });
      cancelAnimationFrame(rafId);
    };
  }, [
    directPaint,
    lifecycleBase,
    result.id,
    showable,
    skipResultOverlayCleanup,
  ]);

  useEffect(() => {
    logResultOverlayEffect({
      ...lifecycleBase(),
      effectName: 'saved-bans',
      phase: 'run',
    });
    if (!token || !result.id) return;
    let cancelled = false;
    void getSavedBans(token)
      .then((items) => {
        if (cancelled) return;
        setArchiveSaved(items.some((b) => b.id === result.id));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (skipResultOverlayCleanup('saved-bans')) return;
      logResultOverlayCleanup({
        ...lifecycleBase(),
        effectName: 'saved-bans',
        phase: 'effect-cleanup',
      });
      traceResultOverlayLifecycle('RESULT OVERLAY EFFECT CLEANUP', tracePropsRef.current, {
        effect: 'saved-bans',
      });
    };
  }, [lifecycleBase, result.id, skipResultOverlayCleanup, token]);

  const isOverboard =
    overboardQueueBody ||
    renderResult.outcome === 'overboard' ||
    resultStatus === 'overboard';
  const isFunMode = isResultFunMode(renderResult);
  const overboardPresentation = RESULT_COPY.overboard;

  useLayoutEffect(() => {
    if (!isOverboard || !effectiveShowable || !result.id) return;
    emitOverboardFlashOriginV1({
      result,
      mountSurface: 'ResultOverlay',
      resultOverlayVisible: effectiveShowable,
      directOverboardVisible: Boolean(directPaint && embedded),
    });
  }, [
    directPaint,
    effectiveShowable,
    embedded,
    isOverboard,
    result,
  ]);

  useLayoutEffect(() => {
    return () => {
      clearOverboardFlashOriginEmitForBan(result.id);
    };
  }, [result.id]);

  const view = useMemo(() => {
    const viewer = (renderResult.viewerId ?? resolvedViewerId ?? '').trim();
    const senderId = renderResult.sender?.id?.trim() ?? '';
    const receiverId = renderResult.receiver?.id?.trim() ?? '';
    const isSender = Boolean(viewer && senderId && viewer === senderId);
    const isReceiver = Boolean(viewer && receiverId && viewer === receiverId);
    const myDelta = isSender
      ? renderResult.energy?.sender ?? null
      : isReceiver
        ? renderResult.energy?.receiver ?? null
        : overboardQueueBody
          ? (renderResult.energy?.receiver ?? renderResult.energy?.sender ?? -8)
          : null;
    const primaryLabel = isOverboard
      ? '🚫 Запретить в ответ'
      : isReceiver
        ? '🚫 Запретить в ответ'
        : '🚫 Запретить ещё!';
    const showStatuses =
      renderResult.confirmations !== null &&
      (renderResult.outcome === 'both_yes' ||
        renderResult.outcome === 'both_no' ||
        renderResult.outcome === 'split');

    const displayHeadline = isOverboard
      ? overboardQueueBody
        ? QUEUE_ATOMIC_OVERBOARD_TITLE
        : renderResult.headline?.trim() || overboardPresentation.headline
      : resolveResultDisplayHeadline(
          renderResult.outcome,
          renderResult.farmSkipped,
          renderResult.headline ?? '',
        );
    const displaySubline = isOverboard
      ? renderResult.subline?.trim() || overboardPresentation.subline
      : renderResult.subline;
    const showBanOthers =
      SHOW_BAN_OTHERS_BUTTON_UI &&
      !isOverboard &&
      showFreeModeBanOthersAction(renderResult.farmSkipped, renderResult.outcome);

    return {
      isSender,
      isReceiver,
      myDelta,
      primaryLabel,
      showStatuses,
      displayHeadline,
      displaySubline,
      showBanOthers,
    };
  }, [
    isOverboard,
    overboardPresentation.headline,
    overboardPresentation.subline,
    overboardQueueBody,
    renderResult,
    resolvedViewerId,
  ]);

  const share = useCallback(() => {
    haptic('light');
    shareDeepLink(
      { type: 'result', banId: result.id },
      `${view.displayHeadline}\n«${result.text}»\n\n98+`,
    );
    if (token) {
      api('/analytics/track', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: ANALYTICS_EVENTS.RESULT_SHARED,
          meta: { banId: result.id },
        }),
      }).catch(() => {});
    }
  }, [haptic, result.id, result.text, token, view.displayHeadline]);

  const replyFromResult = useCallback(() => {
    const decision = decideCardActionTap({
      targetPresent: Boolean(result.id),
      localInFlight: replyClickInFlightRef.current,
    });
    if (!decision.accept) return;
    replyClickInFlightRef.current = true;
    setReplyInFlight(true);
    markOverlayUserAction('result-reply', result.id);
    haptic('medium');
    startReplyFromResult(result);
    recordDismiss(
      'reply-from-result',
      'ResultOverlay.replyFromResult',
      'reply-cta',
    );
    dismissBanResult();
  }, [
    dismissBanResult,
    haptic,
    markOverlayUserAction,
    recordDismiss,
    result,
    startReplyFromResult,
  ]);

  const goToBans = useCallback(() => {
    window.__debug98log?.('[RESULT GO TO BANS BUTTON RAW CLICK]', {
      banId: result.id,
      resultId: result.id,
    });
    if (goToBansClickInFlightRef.current) {
      return;
    }
    goToBansClickInFlightRef.current = true;
    setGoToBansInFlight(true);
    markOverlayUserAction('result-go-to-bans', result.id);
    haptic('light');
    const closureResultId = result.id;
    const closureBanId = result.id;
    const outcomeFromPayload = result.outcome ?? null;
    const statusFromCard = result.status ?? resultStatus ?? null;
    const resolvedFromCard = resolveOverboardResultOutcome({
      outcome: result.outcome,
      status: result.status ?? resultStatus,
    });
    emitGoToBansOutcomeSync('[GO TO BANS OUTCOME SOURCE]', {
      sourceFunction: 'ResultOverlay.goToBans',
      handlerName: 'ResultOverlay.goToBans',
      banId: closureBanId,
      resultId: closureResultId,
      outcomeFromPayload,
      status: statusFromCard,
      resultStatusProp: resultStatus ?? null,
      resolvedOutcome: resolvedFromCard,
      dismissReason: 'go-to-bans',
      overlayKey: `result:${closureBanId}`,
      closureResultId,
      closureBanId,
      directPaint,
      embedded,
      contentOnly,
      overboardQueueBody,
    });
    if (!resolvedFromCard) {
      emitGoToBansOutcomeSync('[GO TO BANS OUTCOME LOST]', {
        sourceFunction: 'ResultOverlay.goToBans',
        banId: closureBanId,
        resultId: closureResultId,
        reason: 'card-payload-missing-outcome-and-status',
        outcomeFromPayload,
        status: statusFromCard,
        dismissReason: 'go-to-bans',
      });
    }
    hookGoToBansTraceEnter({
      source: 'ResultOverlay.goToBans',
      handlerName: 'ResultOverlay.goToBans',
      banId: result.id,
      resultId: result.id,
    });
    logGoToBansNextCardClickLazy({
      source: 'ResultOverlay.goToBans',
      handlerName: 'ResultOverlay.goToBans',
      banId: result.id,
      resultId: result.id,
      outcome: result.outcome ?? resultStatus,
      directPaint,
      embedded,
      contentOnly,
    });
    if (directPaint) {
      markVisibleOverboardTrace('RESULT CTA OPEN BANS click', {
        action: 'open-bans',
        direct: true,
        directPaint: true,
        banId: result.id,
        outcome: result.outcome,
      });
    }
    logResultCardCtaClick({
      source: 'ResultOverlay.goToBans',
      banId: result.id,
      resultId: result.id,
      overlayKey: `result:${result.id}`,
    });
    if (isOverboardStatusOrOutcome || overboardQueueBody || directPaint) {
      logOverboardResultCtaClick({
        source: 'ResultOverlay.goToBans',
        banId: result.id,
        resultId: result.id,
        outcome: result.outcome ?? resultStatus,
        contentOnly,
        embedded,
        directPaint,
        showableBeforeClick: effectiveShowable,
        hasResult: Boolean(result.id?.trim()),
        overboardQueueBody,
      });
    }
    navigateFromResult();
  }, [directPaint, effectiveShowable, haptic, markOverlayUserAction, navigateFromResult, overboardQueueBody, result.id, result.outcome, resultStatus, contentOnly, embedded]);

  const banOthers = useCallback(() => {
    const decision = decideCardActionTap({
      targetPresent: Boolean(result.id),
      localInFlight: banOthersClickInFlightRef.current,
    });
    if (!decision.accept) return;
    banOthersClickInFlightRef.current = true;
    setBanOthersInFlight(true);
    markOverlayUserAction('result', result.id);
    haptic('medium');
    recordDismiss('ban-others', 'ResultOverlay.banOthers', 'ban-others-cta');
    onClose();
    openNewBanWhoFlow();
  }, [haptic, markOverlayUserAction, onClose, openNewBanWhoFlow, recordDismiss, result.id]);

  const toggleArchiveSave = useCallback(() => {
    if (!token || !result.id) return;

    let wasSaved = false;
    setArchiveSaved((prev) => {
      wasSaved = prev;
      return !prev;
    });
    haptic('light');
    hapticSuccess();

    void (async () => {
      try {
        if (wasSaved) {
          await unsaveBan(token, result.id);
        } else {
          await saveBan(token, result.id);
        }
      } catch {
        setArchiveSaved(wasSaved);
      }
    })();
  }, [haptic, hapticSuccess, result.id, token]);

  const senderStatus = renderResult.confirmations?.sender;
  const receiverStatus = renderResult.confirmations?.receiver;
  const hasParticipantActions = view.isSender || view.isReceiver;
  const hasActions = overboardQueueBody
    ? true
    : hasParticipantActions;
  const showParticipantCompare =
    Boolean(renderResult.sender) || Boolean(renderResult.receiver);
  const banText =
    renderResult.text?.trim() ||
    (result as BanResult & { ban?: { text?: string | null } }).ban?.text?.trim() ||
    '';
  const bodyKind: 'overboard' | 'default' | 'none' = !effectiveShowable
    ? 'none'
    : isOverboard
      ? 'overboard'
      : 'default';
  const bodyReturnNullReason = overboardQueueBody ? null : returnsNullReason;
  const bodyHasSender = Boolean(renderResult.sender?.id?.trim());
  const bodyHasReceiver = Boolean(renderResult.receiver?.id?.trim());
  const willRenderBody =
    effectiveShowable &&
    (bodyKind === 'overboard'
      ? true
      : Boolean(view.displayHeadline?.trim()) || Boolean(banText));
  const overlayVisibleContentInput = {
    result: renderResult,
    viewerId: user?.id ?? null,
    atomicOverboardShowable:
      overboardQueueBody ||
      visibilityReason === 'atomic-overboard-fallback' ||
      visibilityReason === 'overboard-queue-body',
  } as const;
  const overlayVisibleContentGate = evaluateOverlayVisibleContentGate(
    overlayVisibleContentInput,
  );
  const overlayVisibleContent = overlayVisibleContentGate.visible;

  const projectedWillRenderResultOverlay =
    effectiveShowable && (isOverboard || overlayVisibleContent);
  logResultRenderSelectionTrace({
    effectiveKind: 'result',
    shellKind: 'result',
    activeResultId: result.id,
    resultBanId: result.id,
    resultId: result.id,
    hasResult: true,
    hasResultOverlay: effectiveShowable,
    hasNotificationOverlay: effectiveShowable,
    displayResultExists: Boolean(result.id?.trim()),
    willRenderResultOverlay: projectedWillRenderResultOverlay,
    willRenderNotificationOverlay: projectedWillRenderResultOverlay,
    renderBranch: 'result-overlay',
    reason: !effectiveShowable
      ? (visibilityReason ?? 'not-visible')
      : !isOverboard && !overlayVisibleContent
        ? (overlayVisibleContentGate.reason ?? 'empty-content')
        : 'will-render',
  });

  logResultOverlayBodyDecision({
    resultId: renderResult.id,
    status: resultStatus,
    outcome: renderResult.outcome ?? null,
    bodyKind,
    title: overboardQueueBody
      ? QUEUE_ATOMIC_OVERBOARD_TITLE
      : view.displayHeadline ?? null,
    hasText: Boolean(banText),
    hasSender: bodyHasSender,
    hasReceiver: bodyHasReceiver,
    willRenderBody,
    returnNullReason: bodyReturnNullReason,
  });

  logResultOverlayContentCheck({
    banId: result.id,
    status: resultStatus,
    headline: view.displayHeadline ?? null,
    outcome: renderResult.outcome ?? null,
    hasTitle: Boolean(view.displayHeadline?.trim()),
    hasBody: Boolean(banText),
    hasButtons: hasActions,
    returnNullReason: returnsNullReason,
  });

  if (!isOverboard && effectiveShowable) {
    logFinalStatusModalViewDecision({
      banId: result.id,
      status: resultStatus,
      outcome: renderResult.outcome ?? null,
      viewKind: bodyKind === 'none' ? 'none' : 'default',
      hasTitle: Boolean(view.displayHeadline?.trim()),
      hasBody: Boolean(banText),
      hasButtons: hasActions,
      reason: !view.displayHeadline?.trim()
        ? 'missing-derived-title'
        : !banText
          ? 'missing-ban-text'
          : null,
    });
  }

  useLayoutEffect(() => {
    logResultOverlayLayoutEffect({
      ...lifecycleBase(),
      effectName: 'report-overlay-rendered',
      phase: 'run',
      hasActions,
    });
    if (!effectiveShowable || !result.id) return;
    reportOverlayRendered('result', result.id, hasActions);
    return () => {
      logResultOverlayCleanup({
        ...lifecycleBase(),
        effectName: 'report-overlay-rendered',
        phase: 'layout-cleanup',
      });
    };
  }, [effectiveShowable, hasActions, lifecycleBase, reportOverlayRendered, result.id]);

  useLayoutEffect(() => {
    logResultOverlayLayoutEffect({
      ...lifecycleBase(),
      effectName: 'lifecycle-paint-raf',
      phase: 'run',
    });
    if (!effectiveShowable || !result.id) return;
    const rafId = requestAnimationFrame(() => {
      logResultOverlayPaint({
        ...lifecycleBase(),
        effectName: 'lifecycle-paint-raf',
        paintPhase: 'post-mount',
        mounted: resultOverlayMountedRef.current,
      });
    });
    return () => {
      logResultOverlayLayoutEffect({
        ...lifecycleBase(),
        effectName: 'lifecycle-paint-raf',
        phase: 'cleanup',
      });
      logResultOverlayCleanup({
        ...lifecycleBase(),
        effectName: 'lifecycle-paint-raf',
        phase: 'layout-cleanup',
      });
      cancelAnimationFrame(rafId);
    };
  }, [effectiveShowable, lifecycleBase, result.id]);

  useLayoutEffect(() => {
    logResultOverlayLayoutEffect({
      ...lifecycleBase(),
      effectName: 'overboard-paint-timing',
      phase: 'run',
    });
    if (!directPaint || !showable || !result.id) return;
    const clickTs = getOverboardClickTs();
    logOverboardPaint('ResultOverlay useLayoutEffect', clickTs);
    const rafId = requestAnimationFrame(() => {
      logOverboardPaint('requestAnimationFrame after mount', clickTs);
      logResultOverlayPaint({
        ...lifecycleBase(),
        effectName: 'overboard-paint-timing',
        paintPhase: 'directPaint-timing',
        clickTs,
      });
    });
    return () => {
      logResultOverlayCleanup({
        ...lifecycleBase(),
        effectName: 'overboard-paint-timing',
        phase: 'layout-cleanup',
      });
      cancelAnimationFrame(rafId);
    };
  }, [directPaint, lifecycleBase, result.id, showable]);

  useLayoutEffect(() => {
    logResultOverlayLayoutEffect({
      ...lifecycleBase(),
      effectName: 'result-fun-mode',
      phase: 'run',
    });
    if (!showable) return;
    logResultFunMode(result);
  }, [lifecycleBase, result, showable]);

  useLayoutEffect(() => {
    logResultOverlayLayoutEffect({
      ...lifecycleBase(),
      effectName: 'result-presentation',
      phase: 'run',
    });
    if (!showable) return;
    logResultPresentation(result.outcome, {
      component: 'ResultOverlay',
      branch: isOverboard ? 'overboard' : 'default',
      displayHeadline: view.displayHeadline,
      presentation: isOverboard
        ? overboardPresentation
        : { headline: result.headline, subline: result.subline },
      source: 'mount',
    });
  }, [
    isOverboard,
    lifecycleBase,
    overboardPresentation,
    result.id,
    result.outcome,
    result.headline,
    result.subline,
    showable,
    view.displayHeadline,
  ]);

  const resolvedTitle = overboardQueueBody
    ? QUEUE_ATOMIC_OVERBOARD_TITLE
    : view.displayHeadline ?? '';
  const shouldRenderTitle = Boolean(resolvedTitle?.trim()) || effectiveShowable;
  const shouldRenderBody = Boolean(banText);
  const shouldRenderOutcome = view.showStatuses;
  const shouldRenderCta = hasActions;
  const computedBranchName = contentOnly
    ? isOverboard
      ? 'render-contentOnly-overboard'
      : 'render-contentOnly-default'
    : embedded
      ? 'render-embedded-modal'
      : 'render-portal-modal';
  const rootClassName = contentOnly
    ? 'contentOnly-no-modal-root'
    : `modal-card modal-card--result${notificationSessionActive ? ' modal-card--handoff' : ''}`;
  const bodyClassName = 'modal-card-body text-center result-card-body';
  const titleClassName = 'result-headline text-2xl font-black text-glow mb-1';
  const revealState = contentOnly
    ? notificationSessionActive
      ? 'queue-shell-session-hosted'
      : 'queue-shell-card-only'
    : notificationSessionActive
      ? 'modal-handoff-session'
      : directPaint
        ? 'direct-paint-modal'
        : 'standalone-modal';
  const animationState =
    contentOnly || notificationSessionActive || directPaint
      ? 'instant-no-enter'
      : 'framer-enter';
  const willRenderVisibleContent =
    effectiveShowable && (isOverboard || overlayVisibleContent);

  const emitVisibleContentTrace = (
    phase: 'jsx-pre-return' | 'layout-dom',
    dom?: Record<string, unknown>,
  ) => {
    logResultOverlayVisibleContentTrace({
      phase,
      banId: result.id,
      resultId: renderResult.id,
      status: resultStatus,
      outcome: renderResult.outcome ?? null,
      hasTitle: Boolean(resolvedTitle?.trim()),
      title: resolvedTitle || null,
      hasBody: shouldRenderBody,
      body: banText || null,
      hasOutcome: Boolean(renderResult.outcome),
      ctaLabel: view.primaryLabel,
      shouldRenderTitle,
      shouldRenderBody,
      shouldRenderOutcome,
      shouldRenderCta,
      contentOnly,
      isDismissing: false,
      isMounted: resultOverlayMountedRef.current,
      revealState,
      animationState,
      rootClassName,
      bodyClassName,
      titleClassName,
      computedBranchName,
      overboardQueueBody,
      effectiveShowable,
      overlayVisibleContent,
      bodyKind,
      willRenderBody,
      hasParticipantActions,
      showParticipantCompare,
      displaySubline: view.displaySubline ?? null,
      embedded,
      directPaint,
      notificationSessionActive,
      ...dom,
    });
  };

  useLayoutEffect(() => {
    logResultOverlayLayoutEffect({
      ...lifecycleBase(),
      effectName: 'visible-content-dom-probe',
      phase: 'run',
      willRenderVisibleContent,
    });
    if (!willRenderVisibleContent) return;

    const layer = document.querySelector('.app-notification-layer');
    const cardEl =
      layer?.querySelector('.modal-card--result') ??
      layer?.querySelector('.modal-card--session-hosted') ??
      layer?.querySelector('.modal-card') ??
      null;
    const headlineEl = layer?.querySelector('.result-headline') ?? null;
    const bodyEl = layer?.querySelector('.result-card-body') ?? null;
    const actionsEl = layer?.querySelector('.result-card-actions') ?? null;
    const shellContentEl =
      layer?.querySelector('.notification-queue-shell__content') ?? null;

    const styleOf = (el: Element | null) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        opacity: cs.opacity,
        visibility: cs.visibility,
        display: cs.display,
        color: cs.color,
        fontSize: cs.fontSize,
        height: cs.height,
        maxHeight: cs.maxHeight,
        overflow: cs.overflow,
        transform: cs.transform,
        textContentLen: (el.textContent ?? '').trim().length,
        rectHeight: rect.height,
        rectWidth: rect.width,
      };
    };

    emitVisibleContentTrace('layout-dom', {
      domLayerFound: layer != null,
      domCardFound: cardEl != null,
      domHeadlineFound: headlineEl != null,
      domBodyFound: bodyEl != null,
      domActionsFound: actionsEl != null,
      domShellContentFound: shellContentEl != null,
      domHeadlineText: headlineEl?.textContent?.trim().slice(0, 120) ?? null,
      domBodyTextPreview: bodyEl?.textContent?.trim().slice(0, 200) ?? null,
      domCardStyle: styleOf(cardEl),
      domHeadlineStyle: styleOf(headlineEl),
      domBodyStyle: styleOf(bodyEl),
      domActionsStyle: styleOf(actionsEl),
      domShellContentStyle: styleOf(shellContentEl),
    });
    return () => {
      logResultOverlayCleanup({
        ...lifecycleBase(),
        effectName: 'visible-content-dom-probe',
        phase: 'layout-cleanup',
      });
    };
  }, [
    banText,
    bodyKind,
    computedBranchName,
    contentOnly,
    directPaint,
    effectiveShowable,
    embedded,
    hasActions,
    hasParticipantActions,
    isOverboard,
    lifecycleBase,
    notificationSessionActive,
    overlayVisibleContent,
    renderResult.id,
    renderResult.outcome,
    resolvedTitle,
    result.id,
    resultStatus,
    showParticipantCompare,
    view.displaySubline,
    view.primaryLabel,
    view.showStatuses,
    willRenderBody,
    willRenderVisibleContent,
  ]);

  if (!effectiveShowable) {
    logResultRenderBranch({
      component: 'ResultOverlay',
      renderBranch: 'result-overlay',
      reason: visibilityReason ?? 'not-visible',
      resultId: result.id,
      contentOnly,
      directPaint,
      embedded,
    });
    return null;
  }

  if (
    contentOnly &&
    !directPaint &&
    !isOverboard &&
    !overlayVisibleContent &&
    Boolean(result.id?.trim())
  ) {
    logResultOverlayVisibilityGateTrace({
      banId: result.id,
      resultId: renderResult.id,
      outcome: renderResult.outcome ?? null,
      headline: overlayVisibleContentGate.displayHeadline || null,
      title: view.displayHeadline ?? null,
      hasText: overlayVisibleContentGate.hasBanText,
      hasSender: overlayVisibleContentGate.hasSender,
      hasReceiver: overlayVisibleContentGate.hasReceiver,
      contentOnly,
      directPaint,
      isOverboard,
      overlayVisibleContent,
      effectiveShowable,
      showable,
      mounted: resultOverlayMountedRef.current,
      revealed: notificationSessionActive,
      visible: willRenderVisibleContent,
      hasBody: Boolean(banText),
      computedBranchName,
      returnsNullReason,
      viewerIdInput: overlayVisibleContentGate.viewerIdInput,
      resultViewerId: overlayVisibleContentGate.resultViewerId,
      resolvedViewerId: overlayVisibleContentGate.resolvedViewerId,
      atomicOverboardShowable: overlayVisibleContentGate.atomicOverboardShowable,
      hasDisplayHeadline: overlayVisibleContentGate.hasDisplayHeadline,
      overboardQueueBody,
      isQueueAtomicOverboardShowable:
        visibilityReason === 'atomic-overboard-fallback' ||
        visibilityReason === 'overboard-queue-body',
      reason: overlayVisibleContentGate.reason,
    });
  }

  if (!isOverboard && !overlayVisibleContent) {
    logResultOverlayEmptyContentBlocked({
      banId: result.id,
      status: resultStatus,
      outcome: renderResult.outcome ?? null,
      hasTitle: Boolean(view.displayHeadline?.trim()),
      willRenderBody: Boolean(banText) || Boolean(view.displayHeadline?.trim()),
      hasActions,
      source: directPaint
        ? 'ResultOverlay.directPaint'
        : contentOnly
          ? 'ResultOverlay.contentOnly'
          : 'ResultOverlay.modal',
    });
    logResultRenderBranch({
      component: 'ResultOverlay',
      renderBranch: 'result-overlay',
      reason: overlayVisibleContentGate.reason ?? 'empty-content-blocked',
      resultId: result.id,
      contentOnly,
      directPaint,
      overlayVisibleContent,
      isOverboard,
    });
    return null;
  }

  logResultRenderBranch({
    component: 'ResultOverlay',
    renderBranch: 'result-overlay',
    reason: embedded ? 'embedded-render' : directPaint ? 'direct-paint-render' : 'modal-render',
    resultId: result.id,
    contentOnly,
    directPaint,
    embedded,
  });

  emitVisibleContentTrace('jsx-pre-return');

  const cardHead = (
    <div className="result-card-head">
      <button
        type="button"
        className="result-card-head__share"
        onClick={share}
        aria-label="Поделиться"
      >
        <ResultShareIcon />
      </button>
      {token ? (
        <div className="result-card-head__archive">
          <BanSaveStar
            mode="toggle"
            banId={result.id}
            saved={archiveSaved}
            onAction={toggleArchiveSave}
          />
        </div>
      ) : null}
    </div>
  );

  const body = (
    <>
      {cardHead}

      <div
        className="modal-card-body text-center result-card-body"
        data-result-branch={isOverboard ? 'overboard' : undefined}
      >
        <p className="result-headline text-2xl font-black text-glow mb-1">
          {overboardQueueBody
            ? QUEUE_ATOMIC_OVERBOARD_TITLE
            : view.displayHeadline}
        </p>
        {view.displaySubline ? (
          <p className="text-muted text-sm mb-4 leading-snug px-1">
            {view.displaySubline}
          </p>
        ) : (
          <div className="mb-4" />
        )}

        {showParticipantCompare ? (
          <div className="result-compare mx-auto mb-4">
            <div className="result-party">
              <Avatar user={renderResult.sender} priority={directPaint} />
              {view.showStatuses ? (
                <span className="result-status" aria-hidden>
                  {senderStatus ? '✅' : '❌'}
                </span>
              ) : null}
            </div>
            <span className="result-arrow text-accent" aria-hidden>
              →
            </span>
            <div className="result-party">
              <Avatar user={renderResult.receiver} />
              {view.showStatuses ? (
                <span className="result-status" aria-hidden>
                  {receiverStatus ? '✅' : '❌'}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {banText ? (
          <p className="text-base font-semibold leading-snug mb-3 px-1">
            «{banText}»
          </p>
        ) : null}

        {view.myDelta !== null && view.myDelta !== undefined ? (
          <p
            className={`result-energy text-2xl font-bold mb-1 ${
              view.myDelta < 0 ? 'text-warning' : 'text-accent'
            }`}
          >
            {view.myDelta > 0 ? '+' : ''}
            {view.myDelta} ⚡
          </p>
        ) : null}
        {isFunMode ? (
          <p className="result-fun-mode-badge" aria-label="fun mode">
            fun mode
          </p>
        ) : null}
        {renderResult.farmSkipped && !isFunMode ? (
          <p className="text-xs text-muted mb-2">Лимит фарма на сегодня</p>
        ) : null}
      </div>

      {hasActions ? (
        <div className="modal-card-actions result-card-actions space-y-2.5">
          <BigButton onClick={replyFromResult} disabled={replyInFlight}>
            {view.primaryLabel}
          </BigButton>
          {view.showBanOthers ? (
            <BigButton
              variant="ghost"
              onClick={banOthers}
              disabled={banOthersInFlight}
            >
              🚫 Запретить другим!
            </BigButton>
          ) : null}
          <BigButton
            variant="ghost"
            onClick={goToBans}
            disabled={goToBansInFlight}
          >
            К запретам
          </BigButton>
        </div>
      ) : null}
    </>
  );

  if (contentOnly) return body;

  const modal = (
    <ModalShell
      open
      light
      stable
      handoff={directPaint ? false : notificationSessionActive}
      zIndex={directPaint ? DIRECT_OVERBOARD_RESULT_Z_INDEX : APP_NOTIFICATION_Z_INDEX}
      ariaLabel="Результат проверки"
      onClose={guardedOnClose}
      cardClassName="modal-card--result"
    >
      {body}
    </ModalShell>
  );

  if (embedded) return modal;
  if (typeof document === 'undefined') {
    logResultRenderBranch({
      component: 'ResultOverlay',
      renderBranch: 'result-overlay',
      reason: 'no-document',
      resultId: result.id,
    });
    traceResultOverlayLifecycle('RESULT OVERLAY RETURN NULL', tracePropsRef.current, {
      reason: 'no-document',
    });
    return null;
  }
  return createPortal(modal, document.body);
}

export const ResultOverlay = memo(ResultOverlayInner);

function Avatar({
  user,
  priority = false,
}: {
  user?: UserPublic | null;
  priority?: boolean;
}) {
  if (!user) {
    return (
      <div className="modal-avatar overflow-hidden" aria-hidden>
        <span className="text-lg">?</span>
      </div>
    );
  }
  const letter = (user.firstName?.[0] ?? '?').toUpperCase();
  return (
    <div className="modal-avatar overflow-hidden" aria-hidden>
      <AvatarImage
        src={userAvatarSrc(user)}
        letter={letter}
        sizeClass="w-full h-full"
        textClass="text-lg"
        priority={priority}
      />
    </div>
  );
}
