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
  ensureDirectOverboardOptimisticResult,
  getResultCardHeadline,
  isDirectOverboardOpenable,
  isResultFunMode,
  isValidBanResultPayload,
  isResultParticipant,
  RESULT_COPY,
  showFreeModeBanOthersAction,
} from '@98plus/shared';
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
import { allowOverlayUserTap } from '@/lib/overlay-input-guard';
import {
  getOverboardClickTs,
  logOverboardPaint,
} from '@/lib/overboard-timing-debug';
import { logResultFunMode } from '@/lib/result-fun-mode-debug';
import { markVisibleOverboardTrace } from '@/lib/overboard-flow-debug';
import {
  logResultCardRenderDecision,
  logResultOverlayBodyDecision,
  logResultOverlayContentCheck,
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
};

type ResultOverlayTraceProps = {
  showable: boolean;
  directPaint: boolean;
  outcome: string;
  contentOnly: boolean;
  resultBanId: string;
  embedded: boolean;
};

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
}: Props) {
  const {
    openNewBanWhoFlow,
    startReplyFromResult,
    dismissBanResult,
    navigateFromResult,
    token,
    user,
    notificationSessionActive,
    markOverlayUserAction,
    logCardCloseClick,
    reportOverlayRendered,
    bansCtaQueueSuppress,
    resultCtaBansOverlayOpen,
    bansNavState,
    blockAutoDismissAtomicOverboardResult,
    isQueueAtomicOverboardResultShowable,
  } = useApp();
  const { haptic, hapticSuccess } = useTelegram();
  const [archiveSaved, setArchiveSaved] = useState(false);

  const viewerId = result.viewerId ?? user?.id ?? null;
  const queueAtomicOverboardShowable =
    contentOnly &&
    !directPaint &&
    isQueueAtomicOverboardResultShowable(result.id) &&
    Boolean(result.id?.trim());
  const returnsNullReason = (() => {
    if (directPaint) {
      if (isDirectOverboardOpenable(result, viewerId)) return null;
      if (isValidBanResultPayload(result)) return null;
      return 'directPaint-not-openable';
    }
    if (queueAtomicOverboardShowable) return null;
    if (!isValidBanResultPayload(result)) return 'invalid-payload';
    if (!isResultParticipant(result, viewerId)) return 'not-participant';
    return null;
  })();
  const showable = returnsNullReason == null;

  const renderResult = useMemo((): BanResult => {
    if (!queueAtomicOverboardShowable || !viewerId?.trim()) {
      return result;
    }
    return ensureDirectOverboardOptimisticResult(
      {
        ...result,
        outcome: result.outcome ?? 'overboard',
        headline: result.headline?.trim() || RESULT_COPY.overboard.headline,
        subline: result.subline?.trim() || RESULT_COPY.overboard.subline,
        text: result.text?.trim() ?? '',
        energy: result.energy ?? { sender: -8, receiver: -8 },
        confirmations: result.confirmations ?? null,
        farmSkipped: result.farmSkipped ?? false,
        completedAt: result.completedAt || new Date().toISOString(),
        deepLink: result.deepLink ?? '',
        shareLink: result.shareLink ?? '',
        inviteOpponentLink: result.inviteOpponentLink ?? '',
      },
      viewerId,
    );
  }, [queueAtomicOverboardShowable, result, viewerId]);

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
    logCardCloseClick({
      kind: 'result',
      banId: result.id,
      source: 'result-close',
    });
    onClose();
  }, [logCardCloseClick, onClose, result.id, skipResultOverlayCleanup]);

  traceResultOverlayLifecycle('RESULT OVERLAY ENTER', tracePropsRef.current, {
    returnsNullReason,
    viewerId,
  });

  logResultCardRenderDecision({
    kind: 'result',
    banId: result.id,
    status: result.outcome ?? result.status ?? null,
    shouldRender: showable,
    returnNullReason: returnsNullReason,
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
    traceResultOverlayLifecycle('RESULT OVERLAY MOUNT', tracePropsRef.current);
    return () => {
      traceResultOverlayLifecycle('RESULT OVERLAY UNMOUNT', tracePropsRef.current, {
        resultCtaBansSession: resultCtaBansSessionRef.current,
      });
    };
  }, []);

  useEffect(() => {
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
      guardedOnClose();
    }
    return () => {
      if (skipResultOverlayCleanup('onClose-guard')) return;
      traceResultOverlayLifecycle('RESULT OVERLAY EFFECT CLEANUP', tracePropsRef.current, {
        effect: 'onClose-guard',
      });
    };
  }, [
    blockAutoDismissAtomicOverboardResult,
    directPaint,
    guardedOnClose,
    result.id,
    showable,
    skipResultOverlayCleanup,
  ]);

  useLayoutEffect(() => {
    if (!directPaint || !showable) return;

    traceResultOverlayLifecycle('RESULT OVERLAY RAF SCHEDULED', tracePropsRef.current);

    let rafId = 0;
    rafId = requestAnimationFrame(() => {
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
      traceResultOverlayLifecycle('RESULT OVERLAY EFFECT CLEANUP', tracePropsRef.current, {
        effect: 'dom-raf',
        rafId,
      });
      cancelAnimationFrame(rafId);
    };
  }, [
    directPaint,
    result.id,
    showable,
  ]);

  useEffect(() => {
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
      traceResultOverlayLifecycle('RESULT OVERLAY EFFECT CLEANUP', tracePropsRef.current, {
        effect: 'saved-bans',
      });
    };
  }, [result.id, skipResultOverlayCleanup, token]);

  const isOverboard =
    renderResult.outcome === 'overboard' || queueAtomicOverboardShowable;
  const isFunMode = isResultFunMode(renderResult);
  const overboardPresentation = RESULT_COPY.overboard;

  const view = useMemo(() => {
    const viewer = renderResult.viewerId ?? viewerId;
    const isSender = viewer === renderResult.sender.id;
    const isReceiver = viewer === renderResult.receiver.id;
    const myDelta = isSender
      ? renderResult.energy.sender
      : isReceiver
        ? renderResult.energy.receiver
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
      ? renderResult.headline?.trim() || overboardPresentation.headline
      : getResultCardHeadline(
          renderResult.outcome,
          renderResult.farmSkipped,
          renderResult.headline,
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
    queueAtomicOverboardShowable,
    renderResult,
    viewerId,
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
    if (!allowOverlayUserTap('result-reply')) return;
    markOverlayUserAction('result-reply', result.id);
    haptic('medium');
    startReplyFromResult(result);
    dismissBanResult();
  }, [
    haptic,
    markOverlayUserAction,
    startReplyFromResult,
    dismissBanResult,
    result,
  ]);

  const goToBans = useCallback(() => {
    if (!allowOverlayUserTap('result-go-to-bans')) return;
    markOverlayUserAction('result-go-to-bans', result.id);
    haptic('light');
    if (directPaint) {
      markVisibleOverboardTrace('RESULT CTA OPEN BANS click', {
        action: 'open-bans',
        direct: true,
        directPaint: true,
        banId: result.id,
        outcome: result.outcome,
      });
    }
    navigateFromResult();
  }, [directPaint, haptic, markOverlayUserAction, navigateFromResult, result.id, result.outcome]);

  const banOthers = useCallback(() => {
    if (!allowOverlayUserTap('result-ban-others')) return;
    markOverlayUserAction('result', result.id);
    haptic('medium');
    onClose();
    openNewBanWhoFlow();
  }, [haptic, markOverlayUserAction, onClose, openNewBanWhoFlow, result.id]);

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
  const hasActions = view.isSender || view.isReceiver;
  const resultStatus =
    (result as BanResult & { status?: string | null }).status ?? null;
  const banText = renderResult.text?.trim() ?? '';
  const bodyKind: 'overboard' | 'default' | 'none' = !showable
    ? 'none'
    : isOverboard
      ? 'overboard'
      : 'default';

  logResultOverlayBodyDecision({
    resultId: renderResult.id,
    status: resultStatus,
    outcome: renderResult.outcome ?? null,
    hasText: Boolean(banText),
    hasSender: Boolean(renderResult.sender?.id?.trim()),
    hasReceiver: Boolean(renderResult.receiver?.id?.trim()),
    title: view.displayHeadline ?? null,
    bodyKind,
    willRenderBody: showable && Boolean(view.displayHeadline?.trim()),
    returnNullReason: returnsNullReason,
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

  useLayoutEffect(() => {
    if (!showable || !result.id) return;
    reportOverlayRendered('result', result.id, hasActions);
  }, [showable, result.id, hasActions, reportOverlayRendered]);

  useLayoutEffect(() => {
    if (!directPaint || !showable || !result.id) return;
    const clickTs = getOverboardClickTs();
    logOverboardPaint('ResultOverlay useLayoutEffect', clickTs);
    requestAnimationFrame(() => {
      logOverboardPaint('requestAnimationFrame after mount', clickTs);
    });
  }, [directPaint, showable, result.id]);

  useLayoutEffect(() => {
    if (!showable) return;
    logResultFunMode(result);
  }, [showable, result]);

  useLayoutEffect(() => {
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
    showable,
    isOverboard,
    overboardPresentation,
    result.id,
    result.outcome,
    result.headline,
    result.subline,
    view.displayHeadline,
  ]);

  if (!showable) return null;

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
          {view.displayHeadline}
        </p>
        {view.displaySubline ? (
          <p className="text-muted text-sm mb-4 leading-snug px-1">
            {view.displaySubline}
          </p>
        ) : (
          <div className="mb-4" />
        )}

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
          <BigButton onClick={replyFromResult}>{view.primaryLabel}</BigButton>
          {view.showBanOthers ? (
            <BigButton variant="ghost" onClick={banOthers}>
              🚫 Запретить другим!
            </BigButton>
          ) : null}
          <BigButton variant="ghost" onClick={goToBans}>
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
  user: UserPublic;
  priority?: boolean;
}) {
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
