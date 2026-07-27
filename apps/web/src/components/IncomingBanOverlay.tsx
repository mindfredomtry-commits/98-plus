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
import type { BanInteraction } from '@98plus/shared';
import { findFriendByUsername, formatSenderDisplayName, INCOMING_OVERBOARD_BUTTON_EMOJI } from '@98plus/shared';
import {
  formatDeliveryError,
  validateReplyTarget,
  verifyIncomingChallenge,
} from '@/lib/deliver-challenge';
import { challengeLog } from '@/lib/challenge-log';
import { shouldShowIncomingBanModal } from '@/lib/incoming-challenge';
import { logIncomingDebug } from '@/lib/incoming-debug';
import { logOverboardButtonClick } from '@/lib/overboard-flow-debug';
import { logResultPath } from '@/lib/result-open-trace';
import { resolveUserAvatarUrl, rememberUserAvatar } from '@/lib/avatar-cache';
import { useApp } from './Providers';
import { BigButton } from './BigButton';
import { AvatarImage } from './AvatarImage';
import { useTelegram } from '@/hooks/useTelegram';
import { ModalShell } from './ModalShell';
import { APP_NOTIFICATION_BACKDROP_Z_INDEX, APP_NOTIFICATION_CARD_Z_INDEX } from '@/lib/overlay-queue';
import { verifyOverlayCardLayout } from '@/lib/overlay-card-layout-debug';
import { installOverlayHitTestProbe } from '@/lib/overlay-hit-test-debug';
import { allowOverlayUserTap } from '@/lib/overlay-input-guard';
import {
  logOverboardActionStart,
  logResultCardRenderDecision,
} from '@/lib/overboard-action-queue-debug';
import {
  logIncomingOverlayHasBan,
  logIncomingOverlayRenderEnter,
  logIncomingOverlayReturnNull,
} from '@/lib/incoming-overlay-mount-debug';
import {
  logOverlayButtonClick,
  logOverlayButtonPointerDown,
  verifyOverlayCardPointerHit,
} from '@/lib/overlay-pointer-debug';
import {
  canReplyFastEnableButtons,
  hasReplyFastDisplayText,
  isReplyDeeplinkShellBan,
} from '@/lib/reply-deeplink-fast';
import { reportIncomingDirectOverlayMounted } from '@/lib/incoming-direct-debug';
import { logReplyCardMounted, logReplyCardTopLayerOk } from '@/lib/reply-deeplink-startup-debug';
import {
  logGoToBansNextCardMountLazy,
  logGoToBansNextCardUnmountLazy,
} from '@/lib/browser-go-to-bans-next-card-debug';
import {
  logResultRenderBranch,
  logResultRenderSelectionTrace,
} from '@/lib/result-render-selection-trace';
import {
  acknowledgeIncomingDomMounted,
  clearIncomingDomMountAck,
} from '@/lib/incoming-dom-mount-ack';

type VerifyPhase = 'idle' | 'pending' | 'ok' | 'failed';

interface Props {
  /** Explicit ban for reply deeplink direct overlay (bypasses context timing). */
  ban?: BanInteraction | null;
  /** Reply deeplink direct path — relax show guards. */
  replyDirect?: boolean;
  /** Render inside GlobalOverlayHost instead of a separate body portal. */
  embedded?: boolean;
  /** Body only — shell provided by NotificationQueueShell. */
  contentOnly?: boolean;
  /** Phase 12.1b: owner-derived architectural visibility — sole render gate. */
  visible: boolean;
  visibilityReason?: string;
}

function IncomingBanOverlayInner({
  ban: banProp,
  replyDirect = false,
  embedded = false,
  contentOnly = false,
  visible,
  visibilityReason,
}: Props) {
  const {
    token,
    user,
    loading: authLoading,
    friends,
    dismissIncoming,
    dismissIncomingSoft,
    acknowledgeIncomingAndStartReply,
    acknowledgeIncomingSeen,
    submitIncomingOverboard,
    notificationSessionActive,
    activeOverlayKind,
    overlayQueueLength,
    markOverlayUserAction,
    logCardCloseClick,
    reportOverlayRendered,
    replyDeeplinkFastShell,
    replyDeepLinkBanId,
  } = useApp();
  const { haptic, hapticSuccess, bindBack } = useTelegram();
  const [actionLoading, setActionLoading] = useState(false);
  const [verifiedBan, setVerifiedBan] = useState<BanInteraction | null>(null);
  const [verifyPhase, setVerifyPhase] = useState<VerifyPhase>('idle');
  const verifyGenRef = useRef(0);
  const overboardClickLockRef = useRef(false);
  const replyShellBanIdRef = useRef<string | null>(null);
  const blockingLayerLoggedRef = useRef(false);
  const cardBodyRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const viewerId = user?.id ?? null;
  /** Phase 12.1: owner-derived ban from Providers prop only — no context fallback for render. */
  const activeIncomingBan = banProp ?? null;

  logIncomingOverlayRenderEnter({
    banPropId: banProp?.id ?? null,
    incomingBanId: null,
    activeIncomingBanId: activeIncomingBan?.id ?? null,
    replyDirect,
    contentOnly,
    embedded,
  });

  if (activeIncomingBan?.id) {
    logIncomingOverlayHasBan({
      banId: activeIncomingBan.id,
      source: 'ban-prop-owner-derived',
      textLen: activeIncomingBan.text?.length ?? 0,
      senderId: activeIncomingBan.sender?.id ?? null,
    });
  } else if (!visible && banProp == null) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.log('[PHASE12 RENDER FALLBACK]', {
        selector: 'IncomingBanOverlay',
        reason: 'legacy-context-ban-suppressed',
        ownerVisible: visible,
        visibilityReason: visibilityReason ?? null,
        contentOnly,
        replyDirect,
        embedded,
      });
    }
  }

  useEffect(() => {
    if (!replyDirect) {
      reportIncomingDirectOverlayMounted(false);
    }
  }, [replyDirect]);

  useEffect(() => {
    if (!visible || !activeIncomingBan?.id) return;
    logGoToBansNextCardMountLazy('incoming', {
      banId: activeIncomingBan.id,
      visibilityReason: visibilityReason ?? null,
      embedded,
      contentOnly,
      replyDirect,
    });
    return () => {
      logGoToBansNextCardUnmountLazy('incoming', {
        banId: activeIncomingBan.id,
        visibilityReason: visibilityReason ?? null,
      });
    };
  }, [
    visible,
    activeIncomingBan?.id,
    visibilityReason,
    embedded,
    contentOnly,
    replyDirect,
  ]);

  const closeOnVerifyFail = useCallback(
    (reason: string, banId: string) => {
      challengeLog('overlay:verify-fail', { banId, reason });
      console.log('[incoming-overlay]', { event: 'verify-fail', banId, reason });
      setVerifiedBan(null);
      setVerifyPhase('failed');
      dismissIncoming(banId);
    },
    [dismissIncoming],
  );

  useEffect(() => {
    setActionLoading(false);
  }, [activeIncomingBan?.id]);

  const isReplyDeeplinkShell =
    !replyDirect &&
    (replyDeeplinkFastShell || isReplyDeeplinkShellBan(activeIncomingBan));
  const isReplyDeeplinkFastPath =
    replyDeepLinkBanId != null &&
    activeIncomingBan?.id === replyDeepLinkBanId;
  const hasKnownReplyActors = canReplyFastEnableButtons(
    activeIncomingBan,
    viewerId,
  );

  useEffect(() => {
    if (!activeIncomingBan?.id || !viewerId) {
      setVerifiedBan(null);
      setVerifyPhase('idle');
      return;
    }

    if (replyDirect) {
      setVerifiedBan(activeIncomingBan);
      setVerifyPhase('ok');
      const unbindBack = bindBack(() => {
        if (activeIncomingBan.status === 'pending') return;
        void acknowledgeIncomingSeen(activeIncomingBan.id);
      }, true);
      return () => {
        unbindBack?.();
      };
    }

    if (!token) {
      setVerifiedBan(null);
      setVerifyPhase('idle');
      return;
    }

    if (!shouldShowIncomingBanModal(activeIncomingBan, viewerId, new Set())) {
      return;
    }

    if (isReplyDeeplinkShell) {
      replyShellBanIdRef.current = activeIncomingBan.id;
      blockingLayerLoggedRef.current = false;
      console.log('[incoming-overlay]', {
        event: 'reply-deeplink-shell',
        banId: activeIncomingBan.id,
        source: 'reply-deeplink-fast',
        hasKnownReplyActors,
      });
      setVerifiedBan(null);
      setVerifyPhase('pending');
      return;
    }

    if (
      isReplyDeeplinkFastPath &&
      hasReplyFastDisplayText(activeIncomingBan) &&
      hasKnownReplyActors
    ) {
      setVerifiedBan(activeIncomingBan);
      setVerifyPhase('ok');
      console.log('[INCOMING CARD OPENED WITH PREFILL]', {
        banId: activeIncomingBan.id,
        source: 'overlay-ui',
        textLen: activeIncomingBan.text?.length ?? 0,
        senderId: activeIncomingBan.sender?.id ?? null,
      });
      console.log('[INCOMING CARD OPENED WITH PREFETCHED DATA]', {
        banId: activeIncomingBan.id,
        source: 'overlay-ui',
        textLen: activeIncomingBan.text?.length ?? 0,
        senderId: activeIncomingBan.sender?.id ?? null,
      });
      const unbindBack = bindBack(() => {
        if (activeIncomingBan.status === 'pending') return;
        void acknowledgeIncomingSeen(activeIncomingBan.id);
      }, true);
      return () => {
        unbindBack?.();
      };
    }

    if (
      replyShellBanIdRef.current &&
      activeIncomingBan.id === replyShellBanIdRef.current
    ) {
      replyShellBanIdRef.current = null;
      setVerifiedBan(activeIncomingBan);
      setVerifyPhase('ok');
      console.log('[INCOMING CARD HYDRATED FROM API]', {
        banId: activeIncomingBan.id,
        source: 'overlay-ui',
        textLen: activeIncomingBan.text?.length ?? 0,
        senderId: activeIncomingBan.sender?.id ?? null,
      });
      const unbindBack = bindBack(() => {
        if (activeIncomingBan.status === 'pending') return;
        void acknowledgeIncomingSeen(activeIncomingBan.id);
      }, true);
      return () => {
        unbindBack?.();
      };
    }

    console.log('[incoming-overlay]', {
      event: 'optimistic-show',
      banId: activeIncomingBan.id,
    });
    setVerifiedBan(null);
    setVerifyPhase('pending');

    const gen = ++verifyGenRef.current;
    const banId = activeIncomingBan.id;

    const runVerify = async () => {
      try {
        const ban = await verifyIncomingChallenge(token, banId);
        if (verifyGenRef.current !== gen) return;
        if (!shouldShowIncomingBanModal(ban, viewerId, new Set())) {
          closeOnVerifyFail('already-acked-or-invalid', banId);
          return;
        }
        validateReplyTarget(ban);
        setVerifiedBan(ban);
        setVerifyPhase('ok');
        challengeLog('overlay:verified', { banId: ban.id });
        console.log('[incoming-overlay]', { event: 'verify-ok', banId: ban.id });
        console.log('[INCOMING OVERLAY READY]', { banId: ban.id, source: 'verify-ok' });
      } catch (e) {
        if (verifyGenRef.current !== gen) return;
        closeOnVerifyFail(formatDeliveryError(e), banId);
      }
    };

    void runVerify();

    const unbindBack = bindBack(() => {
      if (activeIncomingBan.status === 'pending') return;
      void acknowledgeIncomingSeen(activeIncomingBan.id);
    }, true);

    return () => {
      verifyGenRef.current += 1;
      unbindBack?.();
    };
  }, [
    activeIncomingBan,
    replyDirect,
    isReplyDeeplinkShell,
    isReplyDeeplinkFastPath,
    hasKnownReplyActors,
    token,
    viewerId,
    bindBack,
    acknowledgeIncomingSeen,
    closeOnVerifyFail,
  ]);

  const resolvedIncoming = useMemo(() => {
    if (!activeIncomingBan) return null;
    if (activeIncomingBan.sender?.id) return activeIncomingBan;
    const username = activeIncomingBan.sender?.username
      ?.replace(/^@/, '')
      .trim();
    if (!username) return activeIncomingBan;
    const friend = findFriendByUsername(friends, username);
    const senderId = friend?.id ?? friend?.userId;
    if (!senderId) return activeIncomingBan;
    const friendAvatar =
      friend.avatarUrl ?? friend.photoUrl ?? null;
    return {
      ...activeIncomingBan,
      sender: {
        ...activeIncomingBan.sender!,
        id: senderId,
        avatarUrl: activeIncomingBan.sender?.avatarUrl ?? friendAvatar,
        photoUrl: activeIncomingBan.sender?.photoUrl ?? friendAvatar,
      },
    };
  }, [friends, activeIncomingBan]);

  const displayBan = verifiedBan ?? resolvedIncoming ?? activeIncomingBan;

  const senderAvatarSrc = useMemo(() => {
    if (displayBan?.sender?.id) {
      rememberUserAvatar(
        displayBan.sender.id,
        displayBan.sender.avatarUrl ?? displayBan.sender.photoUrl ?? null,
      );
    }
    return resolveUserAvatarUrl(displayBan?.sender);
  }, [displayBan?.sender]);

  const senderLabel = useMemo(() => {
    if (!displayBan?.sender) return '—';
    const u = displayBan.sender.username?.replace(/^@/, '').trim();
    if (u) return `@${u}`;
    return formatSenderDisplayName(
      displayBan.sender.username,
      displayBan.sender.firstName,
    );
  }, [displayBan?.sender]);

  const isQueueHead = activeOverlayKind === 'incoming';

  const canAct = canReplyFastEnableButtons(displayBan, viewerId);
  const buttonsEnabled =
    verifyPhase !== 'failed' &&
    !!activeIncomingBan?.id &&
    (replyDirect || !isReplyDeeplinkShell || hasKnownReplyActors);
  const counterEnabled = buttonsEnabled && canAct && !!token;
  const overboardEnabled = buttonsEnabled && !!token;

  const logClickTest = useCallback(
    (action: 'counter' | 'overboard') => {
      console.log('[INCOMING CARD CLICK TEST]', {
        banId: activeIncomingBan?.id ?? null,
        action,
        buttonsEnabled,
        counterEnabled,
        overboardEnabled,
        verifyPhase,
      });
    },
    [
      activeIncomingBan?.id,
      buttonsEnabled,
      counterEnabled,
      overboardEnabled,
      verifyPhase,
    ],
  );

  const handleCounter = useCallback(() => {
    logOverlayButtonClick({
      banId: activeIncomingBan?.id ?? null,
      action: 'counter',
    });
    if (!allowOverlayUserTap('incoming-counter')) return;
    logClickTest('counter');
    const actBan = verifiedBan ?? resolvedIncoming ?? activeIncomingBan;
    if (!actBan?.id || !actBan.sender?.id || actionLoading) return;
    console.log('[incoming-reply-button-click]', {
      banId: actBan.id,
      source: 'IncomingBanOverlay',
      senderId: actBan.sender?.id ?? null,
    });
    markOverlayUserAction('incoming', actBan.id);
    haptic('medium');
    setActionLoading(true);
    acknowledgeIncomingAndStartReply(actBan);
    setActionLoading(false);
  }, [
    verifiedBan,
    resolvedIncoming,
    activeIncomingBan,
    haptic,
    actionLoading,
    markOverlayUserAction,
    acknowledgeIncomingAndStartReply,
    logClickTest,
  ]);

  const handleOverboard = useCallback(() => {
    logOverlayButtonClick({
      banId: activeIncomingBan?.id ?? null,
      action: 'overboard',
    });
    if (!allowOverlayUserTap('incoming-overboard')) return;
    logClickTest('overboard');
    const actBan = verifiedBan ?? resolvedIncoming ?? activeIncomingBan;
    logOverboardActionStart({
      banId: actBan?.id ?? activeIncomingBan?.id ?? '',
      activeKind: activeOverlayKind,
      activeBanId: actBan?.id ?? activeIncomingBan?.id ?? null,
      queueLen: overlayQueueLength,
      pendingLen: 0,
      source: 'IncomingBanOverlay.handleOverboard',
    });
    if (!actBan?.id || actionLoading || overboardClickLockRef.current) {
      logResultPath('local-overboard-click', 'path-skip', {
        banId: actBan?.id ?? null,
        allowed: false,
        reason: !actBan?.id
          ? 'no-ban'
          : actionLoading
            ? 'action-loading'
            : 'click-lock',
      });
      return;
    }

    logResultPath('local-overboard-click', 'click', {
      banId: actBan.id,
      allowed: true,
      extra: {
        verifyPhase,
        hasVerifiedBan: !!verifiedBan?.id,
      },
    });

    logOverboardButtonClick(actBan.id, 'submitIncomingOverboard');
    markOverlayUserAction('incoming', actBan.id);
    hapticSuccess();

    void submitIncomingOverboard(actBan)
      .then((res) => {
        if (!res.ok && res.error) {
          alert(res.error);
        }
      })
      .catch((e) => {
        alert(formatDeliveryError(e));
      })
      .finally(() => {
        overboardClickLockRef.current = false;
      });
  }, [
    verifiedBan,
    resolvedIncoming,
    activeIncomingBan,
    hapticSuccess,
    actionLoading,
    markOverlayUserAction,
    submitIncomingOverboard,
    verifyPhase,
    verifiedBan?.id,
    logClickTest,
    activeOverlayKind,
    overlayQueueLength,
  ]);

  useLayoutEffect(() => {
    if (!activeIncomingBan?.id || !visible || verifyPhase === 'failed') return;
    reportOverlayRendered('incoming', activeIncomingBan.id, buttonsEnabled);
    const cardEl =
      cardBodyRef.current?.closest('.modal-card') ??
      cardBodyRef.current;
    verifyOverlayCardPointerHit(
      cardEl instanceof HTMLElement ? cardEl : null,
      activeIncomingBan.id,
      'incoming',
    );
    verifyOverlayCardLayout(cardEl instanceof HTMLElement ? cardEl : null, {
      banId: activeIncomingBan.id,
      kind: replyDirect ? 'incoming-reply-direct' : 'incoming-queue',
    });
    // INCOMING_DOM_MOUNTED — visibility lifetime / SUCCESS handoff may start here.
    acknowledgeIncomingDomMounted(activeIncomingBan.id);
  }, [
    activeIncomingBan?.id,
    replyDirect,
    visible,
    verifyPhase,
    buttonsEnabled,
    reportOverlayRendered,
  ]);

  useLayoutEffect(() => {
    const banId = activeIncomingBan?.id ?? null;
    if (!banId || !visible || verifyPhase === 'failed') {
      return;
    }
    return () => {
      clearIncomingDomMountAck(banId);
    };
  }, [activeIncomingBan?.id, visible, verifyPhase]);

  useEffect(() => {
    if (!activeIncomingBan?.id || !visible || verifyPhase === 'failed') {
      return;
    }
    return installOverlayHitTestProbe({
      banId: activeIncomingBan.id,
      kind: replyDirect ? 'incoming-reply-direct' : 'incoming-queue',
      isCardVisible: () => Boolean(cardBodyRef.current),
    });
  }, [activeIncomingBan?.id, replyDirect, visible, verifyPhase]);

  useLayoutEffect(() => {
    if (!activeIncomingBan?.id || isReplyDeeplinkShell || !visible) return;
    if (typeof document === 'undefined') return;

    const card =
      document.querySelector('.modal-card--incoming') ??
      document.querySelector('.incoming-modal-body');
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.bottom - 72;
    const stack = document.elementsFromPoint(cx, cy);
    const top = stack[0] ?? null;
    const hitCard = top != null && card.contains(top);

    if (hitCard) {
      if (blockingLayerLoggedRef.current) {
        console.log('[BLOCKING LAYER REMOVED]', {
          banId: activeIncomingBan.id,
          topTag: top?.tagName ?? null,
        });
        blockingLayerLoggedRef.current = false;
      }
      console.log('[INCOMING CARD CLICK TEST]', {
        banId: activeIncomingBan.id,
        ok: true,
        buttonsEnabled,
        verifyPhase,
        topTag: top?.tagName ?? null,
        topClass:
          top instanceof HTMLElement ? top.className.slice(0, 80) : null,
      });
      return;
    }

    if (!blockingLayerLoggedRef.current) {
      blockingLayerLoggedRef.current = true;
      console.log('[BLOCKING LAYER FOUND]', {
        banId: activeIncomingBan.id,
        buttonsEnabled,
        verifyPhase,
        topTag: top?.tagName ?? null,
        topClass:
          top instanceof HTMLElement ? top.className.slice(0, 120) : null,
        topPointerEvents:
          top instanceof HTMLElement
            ? getComputedStyle(top).pointerEvents
            : null,
        topOpacity:
          top instanceof HTMLElement ? getComputedStyle(top).opacity : null,
        topVisibility:
          top instanceof HTMLElement ? getComputedStyle(top).visibility : null,
        stackPreview: stack.slice(0, 6).map((el) => ({
          tag: el.tagName,
          class:
            el instanceof HTMLElement ? el.className.slice(0, 60) : '',
        })),
      });
    }
  }, [
    activeIncomingBan?.id,
    activeIncomingBan?.text,
    isReplyDeeplinkShell,
    visible,
    buttonsEnabled,
    verifyPhase,
  ]);

  const replyDirectBodyReady =
    replyDirect &&
    visible &&
    verifyPhase !== 'failed' &&
    !isReplyDeeplinkShellBan(activeIncomingBan);

  useLayoutEffect(() => {
    if (!replyDirect) return;
    reportIncomingDirectOverlayMounted(replyDirectBodyReady);
    if (replyDirectBodyReady && activeIncomingBan?.id) {
      logReplyCardMounted({
        banId: activeIncomingBan.id,
        source: 'reply-direct-overlay',
      });
      logReplyCardTopLayerOk({
        banId: activeIncomingBan.id,
        source: 'reply-direct-overlay-mounted',
      });
    }
    return () => reportIncomingDirectOverlayMounted(false);
  }, [replyDirect, replyDirectBodyReady, activeIncomingBan?.id]);

  if (activeIncomingBan?.id) {
    logIncomingDebug({
      authUserId: viewerId,
      incomingId: activeIncomingBan.id,
      incomingReceiverId: activeIncomingBan.receiver?.id,
      incomingAcknowledged: activeIncomingBan.incomingAcknowledged,
      shouldShow: visible,
      reason: visible ? (visibilityReason ?? 'shown') : (visibilityReason ?? 'hidden'),
      extra: { verifyPhase, isQueueHead },
    });
  }

  const projectedWillRenderIncomingOverlay =
    visible && verifyPhase !== 'failed' && Boolean(activeIncomingBan?.id);
  logResultRenderSelectionTrace({
    activeOverlayKind,
    activeKind: activeOverlayKind,
    effectiveKind: 'incoming',
    shellKind: 'incoming',
    activeBanId: activeIncomingBan?.id ?? null,
    hasNotificationOverlay: visible,
    overlayQueueLength,
    willRenderNotificationOverlay: projectedWillRenderIncomingOverlay,
    renderBranch: 'incoming-overlay',
    reason: !visible
      ? (visibilityReason ?? 'not-visible')
      : verifyPhase === 'failed'
        ? 'verify-failed'
        : !activeIncomingBan?.id
          ? 'no-active-incoming-ban'
          : 'will-render',
  });

  if (!visible) {
    if (activeIncomingBan?.id) {
      logIncomingOverlayReturnNull({
        banId: activeIncomingBan.id,
        reason: visibilityReason ?? 'owner-visible-false',
        replyDirect,
        contentOnly,
        verifyPhase,
        shouldShow: false,
      });
      console.log('INCOMING OVERLAY RENDER', {
        banId: activeIncomingBan.id,
        skipped: true,
        reason: visibilityReason ?? 'owner-visible-false',
        replyDirect,
      });
    } else {
      logIncomingOverlayReturnNull({
        reason: visibilityReason ?? 'no-active-incoming-ban',
        replyDirect,
        contentOnly,
      });
    }
    logResultRenderBranch({
      component: 'IncomingBanOverlay',
      renderBranch: 'incoming-overlay',
      reason: visibilityReason ?? 'not-visible',
      banId: activeIncomingBan?.id ?? null,
      replyDirect,
      contentOnly,
    });
    return null;
  }

  if (verifyPhase === 'failed') {
    logIncomingOverlayReturnNull({
      banId: activeIncomingBan?.id ?? null,
      reason: 'verify-failed',
      verifyPhase,
      shouldShow: visible,
      contentOnly,
      banPropId: banProp?.id ?? null,
      isQueueHead,
    });
    logResultCardRenderDecision({
      kind: 'incoming',
      banId: activeIncomingBan?.id ?? null,
      status: activeIncomingBan?.status ?? null,
      verifyPhase,
      shouldRender: false,
      returnNullReason: 'verify-failed',
      isInNotificationQueue: isQueueHead,
      activeOverlayKind,
      activeUserCardHold: null,
      source: 'IncomingBanOverlay.contentOnly',
    });
    console.log('INCOMING OVERLAY RENDER', {
      banId: activeIncomingBan?.id ?? null,
      skipped: true,
      reason: 'verify-failed',
      verifyPhase,
    });
    logResultRenderBranch({
      component: 'IncomingBanOverlay',
      renderBranch: 'incoming-overlay',
      reason: 'verify-failed',
      banId: activeIncomingBan?.id ?? null,
      verifyPhase,
    });
    return null;
  }

  if (!activeIncomingBan?.id) {
    logResultRenderBranch({
      component: 'IncomingBanOverlay',
      renderBranch: 'incoming-overlay',
      reason: 'no-active-incoming-ban',
      replyDirect,
      contentOnly,
    });
    return null;
  }

  logResultRenderBranch({
    component: 'IncomingBanOverlay',
    renderBranch: 'incoming-overlay',
    reason: replyDirect ? 'reply-direct-render' : contentOnly ? 'content-only-render' : 'modal-render',
    banId: activeIncomingBan.id,
    replyDirect,
    contentOnly,
    embedded,
  });

  const senderLetter = (
    activeIncomingBan.sender?.firstName?.[0] ??
    activeIncomingBan.sender?.username?.[0] ??
    '?'
  ).toUpperCase();

  console.log(
    `[incoming-card-debug] rendering full incoming overlay banId=${activeIncomingBan.id}`,
    { verifyPhase, buttonsEnabled, contentOnly, replyDirect },
  );

  const body = (
    <div
      ref={cardBodyRef}
      className="incoming-modal-body text-center"
      data-overlay-user-card=""
    >
      <p className="incoming-modal-title text-xl font-black text-glow mb-3">
        тебе запретили!
      </p>

      <div className="incoming-modal-sender mb-3">
        <AvatarImage
          src={senderAvatarSrc}
          letter={senderLetter}
          sizeClass="w-20 h-20 mx-auto"
          textClass="text-2xl"
          priority
        />
        <p className="text-muted text-sm mt-2">{senderLabel}</p>
      </div>

      <p className="incoming-modal-text text-lg font-semibold leading-snug mb-4 px-1">
        «{activeIncomingBan.text}»
      </p>

      <div
        className="incoming-modal-actions space-y-2.5"
        ref={actionsRef}
      >
        <BigButton
          onPointerDown={() => {
            logOverlayButtonPointerDown({
              banId: activeIncomingBan?.id ?? null,
              action: 'counter',
            });
          }}
          onClick={handleCounter}
          disabled={actionLoading || !counterEnabled}
        >
          🚫 Запретить в ответ
        </BigButton>
        <BigButton
          variant="ghost"
          onPointerDown={() => {
            logOverlayButtonPointerDown({
              banId: activeIncomingBan?.id ?? null,
              action: 'overboard',
            });
          }}
          onClick={handleOverboard}
          disabled={actionLoading || !overboardEnabled}
        >
          {INCOMING_OVERBOARD_BUTTON_EMOJI} Перебор!
        </BigButton>
      </div>
    </div>
  );

  if (contentOnly) return body;

  if (replyDirect) {
    if (typeof document === 'undefined') return null;
    return (
      <>
        {createPortal(
          <div
            className="check-direct-backdrop-root incoming-reply-direct-backdrop-root"
            style={{ zIndex: APP_NOTIFICATION_BACKDROP_Z_INDEX }}
            aria-hidden
          >
            <div className="check-direct-backdrop" />
          </div>,
          document.body,
        )}
        {createPortal(
          <div
            className="overlay-card-portal-host"
            style={{ zIndex: APP_NOTIFICATION_CARD_Z_INDEX }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Входящий запрет"
              data-overlay-user-card=""
              data-notification-layer=""
              className="modal-card modal-card--incoming modal-card--session-hosted modal-card--handoff"
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
      sessionHosted={notificationSessionActive}
      zIndex={APP_NOTIFICATION_CARD_Z_INDEX}
      closeOnBackdrop={false}
      ariaLabel="Входящий запрет"
      onClose={() => {
        logCardCloseClick({
          kind: 'incoming',
          banId: activeIncomingBan.id,
          source:
            activeIncomingBan.status === 'pending'
              ? 'incoming-soft-close'
              : 'incoming-seen-close',
        });
        if (activeIncomingBan.status === 'pending') {
          dismissIncomingSoft(activeIncomingBan.id);
          return;
        }
        void acknowledgeIncomingSeen(activeIncomingBan.id);
      }}
      cardClassName="modal-card--incoming"
    >
      {body}
    </ModalShell>
  );

  if (embedded) return modal;
  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}

export const IncomingBanOverlay = memo(IncomingBanOverlayInner);
