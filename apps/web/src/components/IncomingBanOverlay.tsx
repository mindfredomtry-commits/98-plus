'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BanInteraction } from '@98plus/shared';
import { formatSenderDisplayName } from '@98plus/shared';
import { api } from '@/lib/api';
import {
  formatDeliveryError,
  validateReplyTarget,
  verifyIncomingChallenge,
} from '@/lib/deliver-challenge';
import { challengeLog } from '@/lib/challenge-log';
import { isFreshIncomingForViewer } from '@/lib/incoming-fresh';
import { logIncomingDebug } from '@/lib/incoming-debug';
import { resolveUserAvatarUrl, rememberUserAvatar } from '@/lib/avatar-cache';
import { useApp } from './Providers';
import { BigButton } from './BigButton';
import { AvatarImage } from './AvatarImage';
import { useTelegram } from '@/hooks/useTelegram';
import { ModalShell } from './ModalShell';

type VerifyPhase = 'idle' | 'pending' | 'ok' | 'failed';

function IncomingBanOverlayInner() {
  const {
    token,
    user,
    incomingBan,
    incomingGateActive,
    setIncomingBan,
    acknowledgeIncomingAndStartReply,
    acknowledgeIncomingSeen,
  } = useApp();
  const { haptic, hapticSuccess, bindBack } = useTelegram();
  const [actionLoading, setActionLoading] = useState(false);
  const [verifiedBan, setVerifiedBan] = useState<BanInteraction | null>(null);
  const [verifyPhase, setVerifyPhase] = useState<VerifyPhase>('idle');
  const verifyGenRef = useRef(0);

  const viewerId = user?.id ?? null;

  const closeOnVerifyFail = useCallback(
    (reason: string, banId: string) => {
      challengeLog('overlay:verify-fail', { banId, reason });
      console.log('[incoming-overlay]', { event: 'verify-fail', banId, reason });
      setVerifiedBan(null);
      setVerifyPhase('failed');
      setIncomingBan(null);
    },
    [setIncomingBan],
  );

  useEffect(() => {
    if (!incomingGateActive || !incomingBan?.id) {
      setVerifiedBan(null);
      setVerifyPhase('idle');
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
        if (!isFreshIncomingForViewer(ban, viewerId, new Set())) {
          closeOnVerifyFail('already-acked-or-invalid', banId);
          return;
        }
        validateReplyTarget(ban);
        if (ban.status === 'pending') {
          void api(`/bans/${banId}/accept`, { method: 'POST', token }).catch(
            () => {},
          );
        }
        setVerifiedBan(ban);
        setVerifyPhase('ok');
        challengeLog('overlay:verified', { banId: ban.id });
        console.log('[incoming-overlay]', { event: 'verify-ok', banId: ban.id });
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
    incomingGateActive,
    token,
    viewerId,
    bindBack,
    acknowledgeIncomingSeen,
    closeOnVerifyFail,
  ]);

  const senderAvatarSrc = useMemo(() => {
    if (incomingBan?.sender?.id) {
      rememberUserAvatar(
        incomingBan.sender.id,
        incomingBan.sender.avatarUrl ?? incomingBan.sender.photoUrl ?? null,
      );
    }
    if (verifiedBan?.sender?.id) {
      rememberUserAvatar(
        verifiedBan.sender.id,
        verifiedBan.sender.avatarUrl ?? verifiedBan.sender.photoUrl ?? null,
      );
    }
    return resolveUserAvatarUrl(verifiedBan?.sender ?? incomingBan?.sender);
  }, [incomingBan?.sender, verifiedBan?.sender]);

  const ban = verifiedBan ?? incomingBan;

  const senderLabel = useMemo(() => {
    if (!ban?.sender) return '—';
    const u = ban.sender.username?.replace(/^@/, '').trim();
    if (u) return `@${u}`;
    return formatSenderDisplayName(ban.sender.username, ban.sender.firstName);
  }, [ban?.sender]);

  const handleCounter = useCallback(async () => {
    const actBan = verifiedBan ?? incomingBan;
    if (!actBan?.id || !actBan.sender?.id || actionLoading) return;
    haptic('medium');
    setActionLoading(true);
    try {
      await acknowledgeIncomingAndStartReply(actBan);
    } finally {
      setActionLoading(false);
    }
  }, [
    verifiedBan,
    incomingBan,
    haptic,
    actionLoading,
    acknowledgeIncomingAndStartReply,
  ]);

  const handleOverboard = useCallback(async () => {
    const actBan = verifiedBan ?? incomingBan;
    if (!actBan?.id || !token || actionLoading) return;
    setActionLoading(true);
    hapticSuccess();
    try {
      await acknowledgeIncomingSeen(actBan.id);
      await api(`/bans/${actBan.id}/overboard`, { method: 'POST', token });
      setVerifiedBan(null);
    } catch (e) {
      alert(formatDeliveryError(e));
    } finally {
      setActionLoading(false);
    }
  }, [
    verifiedBan,
    incomingBan,
    token,
    hapticSuccess,
    actionLoading,
    acknowledgeIncomingSeen,
  ]);

  const shouldShow = incomingGateActive;

  if (!incomingBan || !token || !viewerId || !shouldShow) {
    return null;
  }

  if (verifyPhase === 'failed') {
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

  const canAct = !!incomingBan.sender?.id;

  const modal = (
    <ModalShell
      open
      light
      stable
      zIndex={70}
      closeOnBackdrop={false}
      ariaLabel="Входящий запрет"
      onClose={() => void acknowledgeIncomingSeen(incomingBan.id)}
      cardClassName="modal-card--incoming"
    >
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
          <BigButton onClick={handleCounter} disabled={actionLoading || !canAct}>
            🚫 Запретить в ответ
          </BigButton>
          <BigButton
            variant="ghost"
            onClick={handleOverboard}
            disabled={actionLoading || !canAct}
          >
            🫷 Перебор!
          </BigButton>
        </div>
      </div>
    </ModalShell>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}

export const IncomingBanOverlay = memo(IncomingBanOverlayInner);
