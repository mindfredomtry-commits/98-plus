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
import {
  formatSenderDisplayName,
  getCheckModalView,
  getCheckViewerRole,
} from '@98plus/shared';
import type { BanInteraction, UserPublic } from '@98plus/shared';
import { useApp } from './Providers';
import { BigButton } from './BigButton';
import { useTelegram } from '@/hooks/useTelegram';
import { BanTimer } from './BanTimer';
import { challengeLog } from '@/lib/challenge-log';
import { normalizeId } from '@/lib/normalize-json';
import { ModalShell } from './ModalShell';
import { AvatarImage } from './AvatarImage';
import { userAvatarSrc } from '@/lib/user-public-avatar';
import { APP_NOTIFICATION_BACKDROP_Z_INDEX, APP_NOTIFICATION_CARD_Z_INDEX } from '@/lib/overlay-queue';
import { logCheckAnswerClick } from '@/lib/check-chain-drain-debug';
import {
  logGoToBansNextCardMountLazy,
  logGoToBansNextCardUnmountLazy,
} from '@/lib/browser-go-to-bans-next-card-debug';
import {
  allowOverlayUserTap,
  clearCheckOverlayInputLock,
} from '@/lib/overlay-input-guard';

import { acquireScrollLock, releaseScrollLock } from '@/lib/scroll-lock';
import {
  logCheckCardMounted,
  logCheckCardTopLayerOk,
  verifyCheckDirectSplitLayers,
} from '@/lib/check-deeplink-startup-debug';

interface Props {
  embedded?: boolean;
  contentOnly?: boolean;
  /** Check deeplink direct path — render as top layer outside GlobalOverlayHost. */
  checkDirect?: boolean;
  /** Phase 12.1b: owner-derived architectural visibility — sole render gate. */
  visible: boolean;
  /** Phase 12.1b: owner-derived check ban payload. */
  checkBan: BanInteraction | null;
  visibilityReason?: string;
}

function CheckOverlayInner({
  embedded = false,
  contentOnly = false,
  checkDirect = false,
  visible,
  checkBan,
  visibilityReason,
}: Props) {
  const {
    token,
    user,
    submitCheckAnswer,
    notificationSessionActive,
    markOverlayUserAction,
    logCardCloseClick,
    reportOverlayRendered,
  } = useApp();
  const { haptic } = useTelegram();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const directBackdropRootRef = useRef<HTMLDivElement>(null);
  const directCardRef = useRef<HTMLDivElement>(null);

  const modalView = useMemo(() => {
    if (!checkBan) return null;
    return getCheckModalView(checkBan, user?.id ?? null);
  }, [checkBan, user?.id]);

  useEffect(() => {
    setSubmitError(null);
  }, [checkBan?.id]);

  useEffect(() => {
    if (!checkBan?.id || !visible) return;
    const role = getCheckViewerRole(
      user?.id ?? null,
      checkBan.sender.id,
      checkBan.receiver.id,
    );
    console.log('[CHECK OVERLAY ACTIVE]', {
      authUserId: user?.id ?? null,
      checkBanId: checkBan.id,
      role,
      shouldShow: visible,
      reason: visibilityReason ?? (visible ? 'render' : 'guard-rejected'),
    });
  }, [checkBan, user?.id, visible, visibilityReason]);

  useEffect(() => {
    if (!visible || !checkBan?.id) return;
    logGoToBansNextCardMountLazy('check', {
      banId: checkBan.id,
      visibilityReason: visibilityReason ?? null,
      embedded,
      contentOnly,
      checkDirect,
    });
    return () => {
      logGoToBansNextCardUnmountLazy('check', {
        banId: checkBan.id,
        visibilityReason: visibilityReason ?? null,
      });
    };
  }, [
    visible,
    checkBan?.id,
    visibilityReason,
    embedded,
    contentOnly,
    checkDirect,
  ]);

  const displayedLabel = useMemo(() => {
    if (!modalView) return '';
    const u = modalView.displayedUser;
    const handle = u.username?.replace(/^@/, '').trim();
    if (handle) return `@${handle}`;
    return formatSenderDisplayName(u.username, u.firstName);
  }, [modalView]);

  const answer = useCallback(
    async (completed: boolean) => {
      if (!allowOverlayUserTap('check-answer')) return;
      if (!checkBan?.id || !token || !modalView) {
        console.log('[check-overlay-click-missed]', {
          banId: checkBan?.id ?? null,
          reason: !checkBan?.id
            ? 'no-ban'
            : !token
              ? 'no-token'
              : 'no-modal-view',
        });
        return;
      }
      console.log('[check-overlay-click]', {
        banId: checkBan.id,
        answer: completed,
      });
      logCheckAnswerClick({
        banId: checkBan.id,
        answer: completed,
        role: modalView.role,
      });
      logCardCloseClick({
        kind: 'check',
        banId: checkBan.id,
        source: completed ? 'check-answer-yes' : 'check-answer-no',
      });
      markOverlayUserAction('check', checkBan.id);
      haptic('light');
      setSubmitError(null);
      challengeLog('check:answer-click', {
        banId: checkBan.id,
        completed,
        role: modalView.role,
      });
      const res = await submitCheckAnswer(normalizeId(checkBan.id), completed);
      if (!res.ok && res.error) {
        setSubmitError(res.error);
      }
    },
    [checkBan?.id, haptic, logCardCloseClick, modalView, markOverlayUserAction, submitCheckAnswer, token],
  );

  useEffect(() => {
    if (!checkDirect || !visible) return;
    acquireScrollLock();
    return () => releaseScrollLock();
  }, [visible, checkDirect]);

  useLayoutEffect(() => {
    if (!visible || !checkBan?.id) return;
    if (!checkDirect) {
      clearCheckOverlayInputLock(checkBan.id);
    }
    if (checkDirect) {
      logCheckCardMounted({ banId: checkBan.id, source: 'check-direct' });
      logCheckCardTopLayerOk({ banId: checkBan.id, source: 'check-direct-mounted' });
      verifyCheckDirectSplitLayers(
        directBackdropRootRef.current,
        directCardRef.current,
        checkBan.id,
      );
      reportOverlayRendered('check', checkBan.id, true);
      return;
    }
    const yesBtn = actionsRef.current?.querySelector<HTMLButtonElement>(
      '.check-answer-btn',
    );
    const noBtn = actionsRef.current?.querySelectorAll<HTMLButtonElement>(
      '.check-answer-btn',
    )?.[1];
    const yesStyle = yesBtn ? window.getComputedStyle(yesBtn) : null;
    const noStyle = noBtn ? window.getComputedStyle(noBtn) : null;
    const host = document.querySelector('[data-notification-layer]');
    const hostStyle = host ? window.getComputedStyle(host) : null;
    console.log('[check-overlay-mounted]', {
      banId: checkBan.id,
      hasOnClick: yesBtn != null,
      disabled: yesBtn?.disabled ?? null,
    });
    console.log('[check-overlay-button-pointer]', {
      banId: checkBan.id,
      button: 'yes',
      pointerEvents: yesStyle?.pointerEvents ?? null,
      zIndex: yesStyle?.zIndex ?? null,
    });
    console.log('[check-overlay-button-pointer]', {
      banId: checkBan.id,
      button: 'no',
      pointerEvents: noStyle?.pointerEvents ?? null,
      zIndex: noStyle?.zIndex ?? null,
    });
    console.log('[check-overlay-layer-debug]', {
      banId: checkBan.id,
      hostActive: host?.classList.contains('app-notification-layer--active') ?? false,
      backdropActive: host?.classList.contains('app-notification-layer--session') ?? false,
      topLayer: 'GlobalOverlayHost',
      pointerEvents: hostStyle?.pointerEvents ?? null,
    });
    reportOverlayRendered('check', checkBan.id, true);
  }, [visible, checkBan?.id, checkDirect, reportOverlayRendered]);

  if (!visible) {
    return null;
  }

  if (!checkBan || !modalView) {
    return null;
  }

  const yesLabel =
    modalView.role === 'receiver' ? 'Выдержал' : 'Выполнил запрет';
  const noLabel =
    modalView.role === 'receiver' ? 'Не выдержал' : 'Не выполнил запрет';

  const body = (
    <div className="check-modal-body text-center">
      <div className="check-modal-head mb-3">
        <p className="check-modal-title text-xl font-black text-glow">
          {modalView.title}
        </p>
        <p className="check-modal-role-context">{modalView.roleContext}</p>
        {checkBan.remainingMs != null ? (
          <div className="check-modal-timer">
            <BanTimer remainingMs={checkBan.remainingMs} />
          </div>
        ) : null}
      </div>

      <div className="check-modal-sender mb-3">
        <PartyAvatar user={modalView.displayedUser} />
        <p className="text-muted text-xs mt-2">{displayedLabel}</p>
      </div>

      <p className="check-modal-text text-base font-semibold leading-snug mb-4">
        «{checkBan.text}»
      </p>

      {submitError ? (
        <p className="text-warning text-xs mb-3 whitespace-pre-wrap">
          {submitError}
        </p>
      ) : null}

      <div
        className="check-modal-actions space-y-2.5"
        ref={actionsRef}
      >
        <BigButton
          className="check-answer-btn"
          aria-label={yesLabel}
          onClick={() => void answer(true)}
        >
          ✅
        </BigButton>
        <BigButton
          variant="ghost"
          className="check-answer-btn"
          aria-label={noLabel}
          onClick={() => void answer(false)}
        >
          ❌
        </BigButton>
      </div>
    </div>
  );

  if (contentOnly) return body;

  if (checkDirect) {
    const backdropZ = APP_NOTIFICATION_BACKDROP_Z_INDEX;
    const cardZ = APP_NOTIFICATION_CARD_Z_INDEX;
    if (typeof document === 'undefined') return null;
    return (
      <>
        {createPortal(
          <div
            ref={directBackdropRootRef}
            className="check-direct-backdrop-root"
            style={{ zIndex: backdropZ }}
            aria-hidden
          >
            <div className="check-direct-backdrop" />
          </div>,
          document.body,
        )}
        {createPortal(
          <div
            className="overlay-card-portal-host"
            style={{ zIndex: cardZ }}
          >
            <div
              ref={directCardRef}
              role="dialog"
              aria-modal="true"
              aria-label={modalView.title}
              data-overlay-user-card=""
              data-notification-layer=""
              className="modal-card modal-card--check modal-card--session-hosted modal-card--handoff"
              onClick={(e) => e.stopPropagation()}
            >
              {body}
            </div>
          </div>,
          document.body,
        )}
      </>
    );
  }

  const modal = (
    <ModalShell
      open
      light
      stable
      handoff={notificationSessionActive}
      zIndex={APP_NOTIFICATION_CARD_Z_INDEX}
      closeOnBackdrop={false}
      ariaLabel={modalView.title}
      onClose={() => {}}
      cardClassName="modal-card--check"
    >
      {body}
    </ModalShell>
  );

  if (embedded) return modal;
  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}

export const CheckOverlay = memo(CheckOverlayInner);

function PartyAvatar({ user }: { user: UserPublic }) {
  const letter = (user.firstName?.[0] ?? '?').toUpperCase();
  return (
    <div className="modal-avatar mx-auto overflow-hidden" aria-hidden>
      <AvatarImage
        src={userAvatarSrc(user)}
        letter={letter}
        sizeClass="w-full h-full"
        textClass="text-lg"
        priority
      />
    </div>
  );
}
