'use client';

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { BanResult, UserPublic } from '@98plus/shared';
import {
  getResultCardHeadline,
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
    notificationSessionActive,
    markOverlayUserAction,
    reportOverlayRendered,
  } = useApp();
  const { haptic, hapticSuccess } = useTelegram();
  const [archiveSaved, setArchiveSaved] = useState(false);

  const showable =
    isValidBanResultPayload(result) &&
    isResultParticipant(result, result.viewerId);

  useEffect(() => {
    if (!showable) onClose();
  }, [showable, onClose]);

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
    };
  }, [token, result.id]);

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
    navigateFromResult();
  }, [haptic, navigateFromResult]);

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
            <Avatar user={result.sender} />
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
      onClose={onClose}
      cardClassName="modal-card--result"
    >
      {body}
    </ModalShell>
  );

  if (embedded) return modal;
  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}

export const ResultOverlay = memo(ResultOverlayInner);

function Avatar({ user }: { user: UserPublic }) {
  const letter = (user.firstName?.[0] ?? '?').toUpperCase();
  return (
    <div className="modal-avatar overflow-hidden" aria-hidden>
      <AvatarImage
        src={userAvatarSrc(user)}
        letter={letter}
        sizeClass="w-full h-full"
        textClass="text-lg"
      />
    </div>
  );
}
