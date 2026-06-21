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
  const resultStatus =
    (result as BanResult & { status?: string | null }).status ?? null;
  const isOverboardStatusOrOutcome =
    result.outcome === 'overboard' || resultStatus === 'overboard';
  const queueAtomicOverboardShowable =
    contentOnly &&
    !directPaint &&
    Boolean(result.id?.trim()) &&
    (isQueueAtomicOverboardResultShowable(result.id) ||
      isOverboardStatusOrOutcome);
  const resolvedViewerId = (
    viewerId ??
    result.viewerId ??
    user?.id ??
    result.receiver?.id ??
    result.sender?.id ??
    ''
  ).trim();
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
    if (!queueAtomicOverboardShowable) {
      return result;
    }
    return buildSafeQueueAtomicOverboardResult(result, resolvedViewerId);
  }, [queueAtomicOverboardShowable, resolvedViewerId, result]);

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
    queueAtomicOverboardShowable ||
    renderResult.outcome === 'overboard' ||
    resultStatus === 'overboard';
  const isFunMode = isResultFunMode(renderResult);
  const overboardPresentation = RESULT_COPY.overboard;

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
        : queueAtomicOverboardShowable
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
      ? queueAtomicOverboardShowable
        ? QUEUE_ATOMIC_OVERBOARD_TITLE
        : renderResult.headline?.trim() || overboardPresentation.headline
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
  const hasParticipantActions = view.isSender || view.isReceiver;
  const hasActions = queueAtomicOverboardShowable
    ? true
    : hasParticipantActions;
  const showParticipantCompare =
    Boolean(renderResult.sender) || Boolean(renderResult.receiver);
  const banText = renderResult.text?.trim() ?? '';
  const bodyKind: 'overboard' | 'default' | 'none' = !showable
    ? 'none'
    : isOverboard
      ? 'overboard'
      : 'default';
  const bodyReturnNullReason = queueAtomicOverboardShowable
    ? null
    : returnsNullReason;

  logResultOverlayBodyDecision({
    resultId: renderResult.id,
    status: resultStatus,
    outcome: renderResult.outcome ?? null,
    bodyKind,
    title: queueAtomicOverboardShowable
      ? QUEUE_ATOMIC_OVERBOARD_TITLE
      : view.displayHeadline ?? null,
    willRenderBody:
      showable &&
      (bodyKind === 'overboard'
        ? true
        : Boolean(view.displayHeadline?.trim())),
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
          {queueAtomicOverboardShowable
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
