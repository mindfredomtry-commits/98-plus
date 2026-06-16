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
import {
  getOverboardClickTs,
  logOverboardPaint,
} from '@/lib/overboard-timing-debug';
import { logResultFunMode } from '@/lib/result-fun-mode-debug';
import { markVisibleOverboardTrace } from '@/lib/overboard-flow-debug';
import { logResultPresentation } from '@/lib/result-ui-debug';
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
  } = useApp();
  const { haptic, hapticSuccess } = useTelegram();
  const [archiveSaved, setArchiveSaved] = useState(false);

  const viewerId = result.viewerId ?? user?.id ?? null;
  const returnsNullReason = (() => {
    if (directPaint) {
      if (isDirectOverboardOpenable(result, viewerId)) return null;
      if (isValidBanResultPayload(result)) return null;
      return 'directPaint-not-openable';
    }
    if (!isValidBanResultPayload(result)) return 'invalid-payload';
    if (!isResultParticipant(result, viewerId)) return 'not-participant';
    return null;
  })();
  const showable = returnsNullReason == null;

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
    if (!showable) guardedOnClose();
    return () => {
      if (skipResultOverlayCleanup('onClose-guard')) return;
      traceResultOverlayLifecycle('RESULT OVERLAY EFFECT CLEANUP', tracePropsRef.current, {
        effect: 'onClose-guard',
      });
    };
  }, [directPaint, guardedOnClose, showable, skipResultOverlayCleanup]);

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

  const isOverboard = result.outcome === 'overboard';
  const isFunMode = isResultFunMode(result);
  const overboardPresentation = RESULT_COPY.overboard;

  const view = useMemo(() => {
    const isSender = result.viewerId === result.sender.id;
    const isReceiver = result.viewerId === result.receiver.id;
    const myDelta = isSender
      ? result.energy.sender
      : isReceiver
        ? result.energy.receiver
        : null;
    const primaryLabel = isOverboard
      ? '🚫 Запретить в ответ'
      : isReceiver
        ? '🚫 Запретить в ответ'
        : '🚫 Запретить ещё!';
    const showStatuses =
      result.confirmations !== null &&
      (result.outcome === 'both_yes' ||
        result.outcome === 'both_no' ||
        result.outcome === 'split');

    const displayHeadline = isOverboard
      ? overboardPresentation.headline
      : getResultCardHeadline(
          result.outcome,
          result.farmSkipped,
          result.headline,
        );
    const displaySubline = isOverboard
      ? overboardPresentation.subline
      : result.subline;
    const showBanOthers =
      SHOW_BAN_OTHERS_BUTTON_UI &&
      !isOverboard &&
      showFreeModeBanOthersAction(result.farmSkipped, result.outcome);

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
  }, [isOverboard, overboardPresentation.headline, overboardPresentation.subline, result]);

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
  }, [directPaint, haptic, navigateFromResult, result.id, result.outcome]);

  const banOthers = useCallback(() => {
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

  const senderStatus = result.confirmations?.sender;
  const receiverStatus = result.confirmations?.receiver;
  const hasActions = view.isSender || view.isReceiver;

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
            <Avatar user={result.sender} priority={directPaint} />
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
            <Avatar user={result.receiver} />
            {view.showStatuses ? (
              <span className="result-status" aria-hidden>
                {receiverStatus ? '✅' : '❌'}
              </span>
            ) : null}
          </div>
        </div>

        <p className="text-base font-semibold leading-snug mb-3 px-1">
          «{result.text}»
        </p>

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
        {result.farmSkipped && !isFunMode ? (
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
