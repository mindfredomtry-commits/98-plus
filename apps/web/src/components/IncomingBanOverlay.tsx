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
import { findFriendByUsername, formatSenderDisplayName } from '@98plus/shared';
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
import {
  REPLY_DEEPLINK_SHELL_SENDER_ID,
  REPLY_DEEPLINK_SHELL_TEXT,
} from '@/lib/reply-deeplink-fast';

type VerifyPhase = 'idle' | 'pending' | 'ok' | 'failed';

interface Props {
  /** Render inside GlobalOverlayHost instead of a separate body portal. */
  embedded?: boolean;
  /** Body only — shell provided by NotificationQueueShell. */
  contentOnly?: boolean;
}

function IncomingBanOverlayInner({ embedded = false, contentOnly = false }: Props) {
  const {
    token,
    user,
    loading: authLoading,
    friends,
    incomingBan,
    dismissIncoming,
    acknowledgeIncomingAndStartReply,
    acknowledgeIncomingSeen,
    openIncomingOverboardOptimistic,
    runIncomingOverboardApi,
    notificationSessionActive,
    activeOverlayKind,
    markOverlayUserAction,
    reportOverlayRendered,
    replyDeeplinkFastShell,
  } = useApp();
  const { haptic, hapticSuccess, bindBack } = useTelegram();
  const [actionLoading, setActionLoading] = useState(false);
  const [verifiedBan, setVerifiedBan] = useState<BanInteraction | null>(null);
  const [verifyPhase, setVerifyPhase] = useState<VerifyPhase>('idle');
  const verifyGenRef = useRef(0);
  const overboardClickLockRef = useRef(false);
  const replyShellBanIdRef = useRef<string | null>(null);
  const blockingLayerLoggedRef = useRef(false);

  const viewerId = user?.id ?? null;

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
  }, [incomingBan?.id]);

  const isReplyDeeplinkShell =
    replyDeeplinkFastShell ||
    incomingBan?.sender?.id === REPLY_DEEPLINK_SHELL_SENDER_ID ||
    incomingBan?.text === REPLY_DEEPLINK_SHELL_TEXT;

  useEffect(() => {
    if (!incomingBan?.id || !token || !viewerId) {
      setVerifiedBan(null);
      setVerifyPhase('idle');
      return;
    }
    if (!shouldShowIncomingBanModal(incomingBan, viewerId, new Set())) {
      return;
    }

    if (isReplyDeeplinkShell) {
      replyShellBanIdRef.current = incomingBan.id;
      blockingLayerLoggedRef.current = false;
      console.log('[incoming-overlay]', {
        event: 'reply-deeplink-shell',
        banId: incomingBan.id,
        source: 'reply-deeplink-fast',
      });
      setVerifiedBan(null);
      setVerifyPhase('pending');
      return;
    }

    if (
      replyShellBanIdRef.current &&
      incomingBan.id === replyShellBanIdRef.current
    ) {
      replyShellBanIdRef.current = null;
      setVerifiedBan(incomingBan);
      setVerifyPhase('ok');
      console.log('[INCOMING CARD HYDRATED]', {
        banId: incomingBan.id,
        source: 'overlay-ui',
        textLen: incomingBan.text?.length ?? 0,
        senderId: incomingBan.sender?.id ?? null,
      });
      const unbindBack = bindBack(() => {
        if (incomingBan.status === 'pending') return;
        void acknowledgeIncomingSeen(incomingBan.id);
      }, true);
      return () => {
        unbindBack?.();
      };
    }

    console.log('[incoming-overlay]', {
      event: 'optimistic-show',
      banId: incomingBan.id,
    });
    setVerifiedBan(null);
    setVerifyPhase('pending');

    const gen = ++verifyGenRef.current;
    const banId = incomingBan.id;

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
      if (incomingBan.status === 'pending') return;
      void acknowledgeIncomingSeen(incomingBan.id);
    }, true);

    return () => {
      verifyGenRef.current += 1;
      unbindBack?.();
    };
  }, [
    incomingBan,
    isReplyDeeplinkShell,
    token,
    viewerId,
    bindBack,
    acknowledgeIncomingSeen,
    closeOnVerifyFail,
  ]);

  const resolvedIncoming = useMemo(() => {
    if (!incomingBan) return null;
    if (incomingBan.sender?.id) return incomingBan;
    const username = incomingBan.sender?.username?.replace(/^@/, '').trim();
    if (!username) return incomingBan;
    const friend = findFriendByUsername(friends, username);
    const senderId = friend?.id ?? friend?.userId;
    if (!senderId) return incomingBan;
    const friendAvatar =
      friend.avatarUrl ?? friend.photoUrl ?? null;
    return {
      ...incomingBan,
      sender: {
        ...incomingBan.sender!,
        id: senderId,
        avatarUrl: incomingBan.sender?.avatarUrl ?? friendAvatar,
        photoUrl: incomingBan.sender?.photoUrl ?? friendAvatar,
      },
    };
  }, [friends, incomingBan]);

  const displayBan = verifiedBan ?? resolvedIncoming ?? incomingBan;

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
  const shouldShow = incomingBan
    ? isQueueHead ||
      shouldShowIncomingBanModal(incomingBan, viewerId, new Set())
    : false;

  const canAct =
    !!displayBan?.sender?.id &&
    displayBan.sender.id !== REPLY_DEEPLINK_SHELL_SENDER_ID;
  const buttonsEnabled =
    !isReplyDeeplinkShell && verifyPhase !== 'failed' && !!incomingBan?.id;
  const counterEnabled = buttonsEnabled && canAct;
  const overboardEnabled = buttonsEnabled;

  const logClickTest = useCallback(
    (action: 'counter' | 'overboard') => {
      console.log('[INCOMING CARD CLICK TEST]', {
        banId: incomingBan?.id ?? null,
        action,
        buttonsEnabled,
        counterEnabled,
        overboardEnabled,
        verifyPhase,
      });
    },
    [
      incomingBan?.id,
      buttonsEnabled,
      counterEnabled,
      overboardEnabled,
      verifyPhase,
    ],
  );

  const handleCounter = useCallback(() => {
    logClickTest('counter');
    const actBan = verifiedBan ?? resolvedIncoming ?? incomingBan;
    if (!actBan?.id || !actBan.sender?.id || actionLoading) return;
    markOverlayUserAction('incoming', actBan.id);
    haptic('medium');
    setActionLoading(true);
    acknowledgeIncomingAndStartReply(actBan);
    setActionLoading(false);
  }, [
    verifiedBan,
    resolvedIncoming,
    incomingBan,
    haptic,
    actionLoading,
    markOverlayUserAction,
    acknowledgeIncomingAndStartReply,
    logClickTest,
  ]);

  const handleOverboard = useCallback(() => {
    logClickTest('overboard');
    const actBan = verifiedBan ?? resolvedIncoming ?? incomingBan;
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
      fallbackBans: [verifiedBan, resolvedIncoming, incomingBan].filter(
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
    incomingBan,
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
    if (!incomingBan?.id || !shouldShow || verifyPhase === 'failed') return;
    reportOverlayRendered('incoming', incomingBan.id, buttonsEnabled);
  }, [
    incomingBan?.id,
    shouldShow,
    verifyPhase,
    buttonsEnabled,
    reportOverlayRendered,
  ]);

  useLayoutEffect(() => {
    if (!incomingBan?.id || isReplyDeeplinkShell || !shouldShow) return;
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
          banId: incomingBan.id,
          topTag: top?.tagName ?? null,
        });
        blockingLayerLoggedRef.current = false;
      }
      console.log('[INCOMING CARD CLICK TEST]', {
        banId: incomingBan.id,
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
        banId: incomingBan.id,
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
    incomingBan?.id,
    incomingBan?.text,
    isReplyDeeplinkShell,
    shouldShow,
    buttonsEnabled,
    verifyPhase,
  ]);

  if (incomingBan?.id) {
    logIncomingDebug({
      authUserId: viewerId,
      incomingId: incomingBan.id,
      incomingReceiverId: incomingBan.receiver?.id,
      incomingAcknowledged: incomingBan.incomingAcknowledged,
      shouldShow,
      reason: shouldShow ? 'shown' : 'session-dismissed',
      extra: { verifyPhase, isQueueHead },
    });
  }

  if (!incomingBan || !token || !viewerId) {
    if (incomingBan?.id) {
      console.log('INCOMING OVERLAY RENDER', {
        banId: incomingBan.id,
        skipped: true,
        reason: !token ? 'no-token' : 'no-viewer',
      });
    }
    return null;
  }

  if (!shouldShow || verifyPhase === 'failed') {
    console.log('INCOMING OVERLAY RENDER', {
      banId: incomingBan.id,
      skipped: true,
      reason: !shouldShow ? 'guard-rejected' : 'verify-failed',
      verifyPhase,
    });
    return null;
  }

  if (!isReplyDeeplinkShell && !incomingBan.text?.trim()) {
    return null;
  }

  const senderLetter = (
    incomingBan.sender?.firstName?.[0] ??
    incomingBan.sender?.username?.[0] ??
    '?'
  ).toUpperCase();

  console.log('INCOMING OVERLAY RENDER', {
    banId: incomingBan.id,
    verifyPhase,
    buttonsEnabled,
    contentOnly,
  });

  const body = isReplyDeeplinkShell ? (
    <div
      className="incoming-modal-body text-center incoming-modal-body--shell"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="incoming-modal-title text-xl font-black text-glow mb-3">
        тебе запретили!
      </p>

      <div className="incoming-modal-sender mb-3">
        <div
          className="w-20 h-20 mx-auto rounded-full bg-white/10 animate-pulse"
          aria-hidden
        />
        <div className="h-4 w-24 mx-auto mt-2 rounded bg-white/10 animate-pulse" />
      </div>

      <div className="incoming-modal-text mb-4 px-6 space-y-2">
        <div className="h-5 w-full rounded bg-white/10 animate-pulse" />
        <div className="h-5 w-4/5 mx-auto rounded bg-white/10 animate-pulse" />
      </div>

      <div className="incoming-modal-actions space-y-2.5">
        <BigButton disabled>🚫 Запретить в ответ</BigButton>
        <BigButton variant="ghost" disabled>
          🫷 Перебор!
        </BigButton>
      </div>
    </div>
  ) : (
    <div className="incoming-modal-body text-center">
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
        «{incomingBan.text}»
      </p>

      <div className="incoming-modal-actions space-y-2.5">
        <BigButton
          onClick={handleCounter}
          disabled={actionLoading || !counterEnabled}
        >
          🚫 Запретить в ответ
        </BigButton>
        <BigButton
          variant="ghost"
          onClick={handleOverboard}
          disabled={actionLoading || !overboardEnabled}
        >
          🫷 Перебор!
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
      handoff={notificationSessionActive}
      zIndex={APP_NOTIFICATION_Z_INDEX}
      closeOnBackdrop={false}
      ariaLabel="Входящий запрет"
      onClose={() => void acknowledgeIncomingSeen(incomingBan.id)}
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
