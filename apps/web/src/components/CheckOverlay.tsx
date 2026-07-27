'use client';

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
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
import { clearCheckOverlayInputLock } from '@/lib/overlay-input-guard';

import { acquireScrollLock, releaseScrollLock } from '@/lib/scroll-lock';
import {
  logCheckCardMounted,
  logCheckCardTopLayerOk,
  verifyCheckDirectSplitLayers,
} from '@/lib/check-deeplink-startup-debug';
import {
  logResultRenderBranch,
  logResultRenderSelectionTrace,
} from '@/lib/result-render-selection-trace';
import {
  logCheckOverlayEntryTrace,
  logCheckOverlayExceptionTrace,
  logCheckOverlayReturnTrace,
} from '@/lib/check-overlay-return-trace-debug';
import {
  logShellCheckMountUnmount,
  markShellCheckAction,
} from '@/lib/shell-check-lifecycle-trace-debug';
import {
  observeCheckOverlayPayloadLifecycle,
  type CheckOverlayPayloadLifecycleEvent,
} from '@/lib/check-overlay-payload-lifecycle-trace-debug';
import { anchorCheckOverlayUnmountForGoToBansTimeline } from '@/lib/check-overlay-parent-render-trace-debug';
import { checkOverlayKey } from '@/lib/overlay-queue';
import { useNotificationRuntimeStoreOptional } from '@/notification-runtime/notification-runtime.context';
import { selectIsActionBlocked } from '@/notification-runtime/notification-runtime.selectors';
import { createInitialNotificationRuntimeState } from '@/notification-runtime/notification-runtime.types';
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

function CheckOverlayInner(props: Props) {
  try {
    return CheckOverlayInnerBody(props);
  } catch (error) {
    logCheckOverlayExceptionTrace({
      error,
      contentOnly: props.contentOnly,
      checkDirect: props.checkDirect,
      visible: props.visible,
      checkBan: props.checkBan,
    });
    throw error;
  }
}

function CheckOverlayInnerBody({
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
    logCardCloseClick,
    reportOverlayRendered,
  } = useApp();

  logCheckOverlayEntryTrace({
    contentOnly,
    checkDirect,
    embedded,
    visible,
    checkBan,
    visibilityReason,
    userId: user?.id ?? null,
  });

  const { haptic } = useTelegram();
  const runtimeStore = useNotificationRuntimeStoreOptional();
  const runtimeState = useSyncExternalStore(
    runtimeStore?.subscribe ?? (() => () => {}),
    runtimeStore?.getState ?? (() => createInitialNotificationRuntimeState()),
    () => createInitialNotificationRuntimeState(),
  );
  const actionBlocked = selectIsActionBlocked(runtimeState);
  const submitError =
    runtimeState.action.status === 'failed'
      ? runtimeState.action.errorCode
      : null;
  const actionsRef = useRef<HTMLDivElement>(null);
  const directBackdropRootRef = useRef<HTMLDivElement>(null);
  const directCardRef = useRef<HTMLDivElement>(null);

  const modalView = useMemo(() => {
    if (!checkBan) return null;
    return getCheckModalView(checkBan, user?.id ?? null);
  }, [checkBan, user?.id]);

  const projectedWillRenderCheckOverlay =
    visible && Boolean(checkBan) && Boolean(modalView);

  const tracePayloadLifecycle = (
    event: CheckOverlayPayloadLifecycleEvent,
    extra: {
      reason: string;
      returnedNull?: boolean;
      rendered?: boolean;
      mounted?: boolean;
    },
  ) => {
    observeCheckOverlayPayloadLifecycle({
      event,
      source: 'CheckOverlay',
      reason: extra.reason,
      calledFrom: 'CheckOverlay',
      checkBan,
      visible,
      mounted: extra.mounted ?? null,
      rendered: extra.rendered ?? null,
      returnedNull: extra.returnedNull ?? null,
      payloadSource: checkDirect
        ? 'check-direct'
        : embedded
          ? 'embedded'
          : contentOnly
            ? 'queue-shell-contentOnly'
            : 'modal',
      propsKind: 'check',
      userId: user?.id ?? null,
    });
  };

  const traceCheckOverlayReturn = (
    returnBranch: string,
    returnsNull: boolean,
    extra?: { guardReason?: string | null; reason?: string | null },
  ) => {
    logCheckOverlayReturnTrace({
      returnBranch,
      returnsNull,
      visible,
      checkBan,
      modalView,
      user,
      embedded,
      contentOnly,
      checkDirect,
      visibilityReason,
      guardReason: extra?.guardReason,
      reason: extra?.reason,
    });
  };

  logResultRenderSelectionTrace({
    effectiveKind: 'check',
    shellKind: 'check',
    activeBanId: checkBan?.id ?? null,
    hasNotificationOverlay: visible,
    displayResultExists: false,
    willRenderNotificationOverlay: projectedWillRenderCheckOverlay,
    renderBranch: 'check-overlay',
    reason: !visible
      ? (visibilityReason ?? 'not-visible')
      : !checkBan || !modalView
        ? 'missing-check-ban-or-view'
        : 'will-render',
  });

  useEffect(() => {
    if (!checkBan?.id) return;
    observeCheckOverlayPayloadLifecycle({
      event: 'payload-changed',
      source: 'CheckOverlay',
      reason: 'check-ban-prop-changed',
      calledFrom: 'CheckOverlay.useEffect',
      checkBan,
      visible,
      payloadSource: checkDirect
        ? 'check-direct'
        : contentOnly
          ? 'queue-shell-contentOnly'
          : 'modal',
      propsKind: 'check',
      userId: user?.id ?? null,
    });
  }, [checkBan?.id, checkDirect, contentOnly, user?.id, visible]);

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
    tracePayloadLifecycle('mount', { reason: 'check-overlay-mounted', mounted: true });
    return () => {
      observeCheckOverlayPayloadLifecycle({
        event: 'unmount',
        source: 'CheckOverlay',
        reason: 'check-overlay-unmounted',
        calledFrom: 'CheckOverlay.useEffect',
        checkBan,
        visible,
        mounted: false,
        rendered: false,
        returnedNull: false,
        payloadSource: checkDirect
          ? 'check-direct'
          : contentOnly
            ? 'queue-shell-contentOnly'
            : 'modal',
        propsKind: 'check',
        userId: user?.id ?? null,
      });
      const banId = checkBan?.id?.trim() || null;
      anchorCheckOverlayUnmountForGoToBansTimeline({
        checkBanId: banId,
        checkOverlayKey: banId ? checkOverlayKey(banId) : null,
        source: 'CheckOverlay',
        calledFrom: 'CheckOverlay.useEffect:unmount',
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount identity only
  }, []);

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
    (completed: boolean) => {
      // Vertical 3: first click dispatches CARD_ACTION_REQUESTED only.
      // No allowOverlayUserTap / markOverlayUserAction / hold unlock as gates.
      if (actionBlocked) return;
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
      markShellCheckAction(
        completed ? 'userPressedCheckYes' : 'userPressedCheckNo',
        {
          source: 'CheckOverlay.answer',
          calledFrom: 'CheckOverlay',
          checkBanId: normalizeId(checkBan.id),
          completed,
        },
      );
      logCardCloseClick({
        kind: 'check',
        banId: checkBan.id,
        source: completed ? 'check-answer-yes' : 'check-answer-no',
      });
      haptic('light');
      challengeLog('check:answer-click', {
        banId: checkBan.id,
        completed,
        role: modalView.role,
      });
      // submitCheckAnswer is now the runtime command+effect bridge (no pre-HTTP dismiss).
      void submitCheckAnswer(normalizeId(checkBan.id), completed);
    },
    [
      actionBlocked,
      checkBan?.id,
      haptic,
      logCardCloseClick,
      modalView,
      submitCheckAnswer,
      token,
    ],
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
    } else {
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
    }
    logShellCheckMountUnmount({
      event: 'check-rendered',
      source: checkDirect
        ? 'CheckOverlay.mount:check-direct'
        : 'CheckOverlay.mount:queue-shell',
      calledFrom: 'CheckOverlay.useLayoutEffect',
      checkBanId: checkBan.id,
      visible: true,
      reason: 'check-overlay-mounted',
    });
    return () => {
      logShellCheckMountUnmount({
        event: 'check-unmounted',
        source: checkDirect
          ? 'CheckOverlay.unmount:check-direct'
          : 'CheckOverlay.unmount:queue-shell',
        calledFrom: 'CheckOverlay.useLayoutEffect',
        checkBanId: checkBan.id,
        visible: false,
        reason: 'check-overlay-unmounted',
      });
    };
  }, [visible, checkBan?.id, checkDirect, reportOverlayRendered]);

  if (!visible) {
    logShellCheckMountUnmount({
      event: 'check-branch-returned-null',
      source: 'CheckOverlay.return',
      calledFrom: 'CheckOverlay',
      checkBanId: checkBan?.id ?? null,
      visible: false,
      returnBranch: 'guard-not-visible',
      reason: visibilityReason ?? 'not-visible',
    });
    tracePayloadLifecycle('render-null', {
      reason: visibilityReason ?? 'not-visible',
      returnedNull: true,
      rendered: false,
    });
    traceCheckOverlayReturn('guard-not-visible', true, {
      guardReason: visibilityReason ?? 'not-visible',
    });
    logResultRenderBranch({
      component: 'CheckOverlay',
      renderBranch: 'check-overlay',
      reason: visibilityReason ?? 'not-visible',
      checkBanId: checkBan?.id ?? null,
      checkDirect,
    });
    return null;
  }

  if (!checkBan || !modalView) {
    tracePayloadLifecycle('render-null', {
      reason: !checkBan ? 'no-check-ban' : 'no-modal-view',
      returnedNull: true,
      rendered: false,
    });
    if (!checkBan && visible) {
      tracePayloadLifecycle('payload-lost', {
        reason: 'visible-without-check-ban',
        returnedNull: true,
        rendered: false,
      });
    }
    traceCheckOverlayReturn('guard-missing-ban-or-view', true, {
      guardReason: !checkBan ? 'no-check-ban' : 'no-modal-view',
    });
    logResultRenderBranch({
      component: 'CheckOverlay',
      renderBranch: 'check-overlay',
      reason: !checkBan ? 'no-check-ban' : 'no-modal-view',
      checkBanId: checkBan?.id ?? null,
      checkDirect,
    });
    return null;
  }

  logResultRenderBranch({
    component: 'CheckOverlay',
    renderBranch: 'check-overlay',
    reason: checkDirect ? 'check-direct-render' : embedded ? 'embedded-render' : 'modal-render',
    checkBanId: checkBan.id,
    checkDirect,
    embedded,
    contentOnly,
  });

  tracePayloadLifecycle('render-valid', {
    reason: checkDirect ? 'check-direct-render' : embedded ? 'embedded-render' : 'modal-render',
    returnedNull: false,
    rendered: true,
  });

  console.log('ACTUAL_COMPONENT_RENDER: CheckOverlay', {
    t: performance.now(),
    kind: 'check',
    activeKind: 'check',
    checkBanId: checkBan.id,
    visible,
    contentOnly,
    checkDirect,
    visibilityReason: visibilityReason ?? null,
  });

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
          disabled={actionBlocked}
          onClick={() => answer(true)}
        >
          ✅
        </BigButton>
        <BigButton
          variant="ghost"
          className="check-answer-btn"
          aria-label={noLabel}
          disabled={actionBlocked}
          onClick={() => answer(false)}
        >
          ❌
        </BigButton>
      </div>
    </div>
  );

  if (contentOnly) {
    traceCheckOverlayReturn('content-only-body', false, {
      reason: 'content-only-render',
    });
    return body;
  }

  if (checkDirect) {
    const backdropZ = APP_NOTIFICATION_BACKDROP_Z_INDEX;
    const cardZ = APP_NOTIFICATION_CARD_Z_INDEX;
    if (typeof document === 'undefined') {
      tracePayloadLifecycle('render-null', {
        reason: 'check-direct-ssr-null',
        returnedNull: true,
        rendered: false,
      });
      traceCheckOverlayReturn('check-direct-ssr-null', true, {
        guardReason: 'document-undefined',
      });
      return null;
    }
    traceCheckOverlayReturn('check-direct-portal-jsx', false, {
      reason: 'check-direct-portal-render',
    });
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

  if (embedded) {
    traceCheckOverlayReturn('embedded-modal-jsx', false, {
      reason: 'embedded-modal-render',
    });
    return modal;
  }
  if (typeof document === 'undefined') {
    tracePayloadLifecycle('render-null', {
      reason: 'portal-ssr-null',
      returnedNull: true,
      rendered: false,
    });
    traceCheckOverlayReturn('portal-ssr-null', true, {
      guardReason: 'document-undefined',
    });
    return null;
  }
  traceCheckOverlayReturn('portal-modal-jsx', false, {
    reason: 'portal-modal-render',
  });
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
