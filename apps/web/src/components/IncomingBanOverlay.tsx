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
import { resolveUserAvatarUrl, rememberUserAvatar } from '@/lib/avatar-cache';
import { useApp } from './Providers';
import { BigButton } from './BigButton';
import { AvatarImage } from './AvatarImage';
import { useTelegram } from '@/hooks/useTelegram';
import { ModalShell } from './ModalShell';
import { APP_NOTIFICATION_Z_INDEX } from '@/lib/overlay-queue';

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
  } = useApp();
  const { haptic, hapticSuccess, bindBack } = useTelegram();
  const [actionLoading, setActionLoading] = useState(false);
  const [verifiedBan, setVerifiedBan] = useState<BanInteraction | null>(null);
  const [verifyPhase, setVerifyPhase] = useState<VerifyPhase>('idle');
  const verifyGenRef = useRef(0);
  const overboardClickLockRef = useRef(false);

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

  useEffect(() => {
    if (!incomingBan?.id || !token || !viewerId) {
      setVerifiedBan(null);
      setVerifyPhase('idle');
      return;
    }
    if (!shouldShowIncomingBanModal(incomingBan, viewerId, new Set())) {
      return;
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
    return {
      ...incomingBan,
      sender: {
        ...incomingBan.sender!,
        id: senderId,
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

  const handleCounter = useCallback(() => {
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
  ]);

  const handleOverboard = useCallback(() => {
    const actBan = verifiedBan ?? resolvedIncoming ?? incomingBan;
    if (!actBan?.id || actionLoading || overboardClickLockRef.current) return;

    const clickTs = markOverboardClickStart();
    overboardClickLockRef.current = true;
    logOverboardButtonClick(actBan.id, 'openIncomingOverboardOptimistic');
    markOverlayUserAction('incoming', actBan.id);
    hapticSuccess();

    const opened = openIncomingOverboardOptimistic(actBan, clickTs);
    if (!opened) {
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
  ]);

  const isQueueHead = activeOverlayKind === 'incoming';
  const shouldShow = incomingBan
    ? isQueueHead ||
      shouldShowIncomingBanModal(incomingBan, viewerId, new Set())
    : false;

  const canAct = !!displayBan?.sender?.id;
  const buttonsEnabled = verifyPhase !== 'failed' && !!incomingBan?.id;
  const counterEnabled = buttonsEnabled && canAct;
  const overboardEnabled = buttonsEnabled;

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

  if (!incomingBan.text?.trim()) {
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

  const body = (
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
