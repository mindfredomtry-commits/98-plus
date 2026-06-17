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
import { markOverboardClickStart } from '@/lib/overboard-timing-debug';
import { logResultPath } from '@/lib/result-open-trace';
import { resolveUserAvatarUrl, rememberUserAvatar } from '@/lib/avatar-cache';
import { useApp } from './Providers';
import { BigButton } from './BigButton';
import { AvatarImage } from './AvatarImage';
import { useTelegram } from '@/hooks/useTelegram';
import { ModalShell } from './ModalShell';
import { APP_NOTIFICATION_Z_INDEX } from '@/lib/overlay-queue';
import { shouldBlockOverlayUserTap } from '@/lib/overlay-input-guard';
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
}

function IncomingBanOverlayInner({
  ban: banProp,
  replyDirect = false,
  embedded = false,
  contentOnly = false,
}: Props) {
  const {
    token,
    user,
    loading: authLoading,
    friends,
    incomingBan,
    dismissIncoming,
    dismissIncomingSoft,
    acknowledgeIncomingAndStartReply,
    acknowledgeIncomingSeen,
    openIncomingOverboardOptimistic,
    runIncomingOverboardApi,
    notificationSessionActive,
    activeOverlayKind,
    incomingGateActive,
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
  const activeIncomingBan = banProp ?? incomingBan;

  useEffect(() => {
    if (!replyDirect) {
      reportIncomingDirectOverlayMounted(false);
    }
  }, [replyDirect]);

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
  const shouldShow = activeIncomingBan
    ? replyDirect ||
      banProp != null ||
      isQueueHead ||
      incomingGateActive ||
      replyDeeplinkFastShell ||
      isReplyDeeplinkShell ||
      shouldShowIncomingBanModal(activeIncomingBan, viewerId, new Set())
    : false;

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
    if (shouldBlockOverlayUserTap('incoming-counter')) return;
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
    if (shouldBlockOverlayUserTap('incoming-overboard')) return;
    logClickTest('overboard');
    const actBan = verifiedBan ?? resolvedIncoming ?? activeIncomingBan;
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

    const clickTs = markOverboardClickStart();
    overboardClickLockRef.current = true;
    logOverboardButtonClick(actBan.id, 'openIncomingOverboardOptimistic');
    markOverlayUserAction('incoming', actBan.id);
    hapticSuccess();

    const opened = openIncomingOverboardOptimistic(actBan, clickTs, {
      fallbackBans: [verifiedBan, resolvedIncoming, activeIncomingBan].filter(
        (row): row is BanInteraction => !!row?.id,
      ),
    });
    if (!opened) {
      logResultPath('local-overboard-click', 'path-skip', {
        banId: actBan.id,
        allowed: false,
        reason: 'openIncomingOverboardOptimistic-false',
      });
      overboardClickLockRef.current = false;
      alert('Не удалось открыть перебор');
      return;
    }

    void runIncomingOverboardApi(actBan, clickTs)
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
    openIncomingOverboardOptimistic,
    runIncomingOverboardApi,
    verifyPhase,
    verifiedBan?.id,
    logClickTest,
  ]);

  useLayoutEffect(() => {
    if (!activeIncomingBan?.id || !shouldShow || verifyPhase === 'failed') return;
    reportOverlayRendered('incoming', activeIncomingBan.id, buttonsEnabled);
    const cardEl =
      cardBodyRef.current?.closest('.modal-card') ??
      cardBodyRef.current;
    verifyOverlayCardPointerHit(
      cardEl instanceof HTMLElement ? cardEl : null,
      activeIncomingBan.id,
      'incoming',
    );
  }, [
    activeIncomingBan?.id,
    shouldShow,
    verifyPhase,
    buttonsEnabled,
    reportOverlayRendered,
  ]);

  useLayoutEffect(() => {
    if (!activeIncomingBan?.id || isReplyDeeplinkShell || !shouldShow) return;
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
    shouldShow,
    buttonsEnabled,
    verifyPhase,
  ]);

  const canRenderBody =
    !!activeIncomingBan && !!viewerId && (replyDirect || !!token);
  const replyDirectBodyReady =
    replyDirect &&
    canRenderBody &&
    shouldShow &&
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
      shouldShow,
      reason: shouldShow ? 'shown' : 'session-dismissed',
      extra: { verifyPhase, isQueueHead },
    });
  }

  if (!canRenderBody) {
    if (activeIncomingBan?.id) {
      console.log('INCOMING OVERLAY RENDER', {
        banId: activeIncomingBan.id,
        skipped: true,
        reason: !viewerId ? 'no-viewer' : 'no-token',
        replyDirect,
      });
    }
    return null;
  }

  if (!shouldShow || verifyPhase === 'failed') {
    console.log('INCOMING OVERLAY RENDER', {
      banId: activeIncomingBan.id,
      skipped: true,
      reason: !shouldShow ? 'guard-rejected' : 'verify-failed',
      verifyPhase,
    });
    return null;
  }

  if (!replyDirect && isReplyDeeplinkShellBan(activeIncomingBan)) {
    console.log('[incoming-card-debug] ready false reason: shell-ban', {
      banId: activeIncomingBan.id,
    });
    return null;
  }

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

  const modal = (
    <ModalShell
      open
      light
      stable
      handoff={replyDirect || notificationSessionActive}
      zIndex={APP_NOTIFICATION_Z_INDEX}
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
