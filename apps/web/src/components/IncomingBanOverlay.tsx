'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { BanInteraction } from '@98plus/shared';
import { formatSenderDisplayName } from '@98plus/shared';
import { api, pingApi } from '@/lib/api';
import {
  formatDeliveryError,
  validateReplyTarget,
  verifyIncomingChallenge,
} from '@/lib/deliver-challenge';
import { challengeLog } from '@/lib/challenge-log';
import {
  isValidIncomingOverlayPayload,
  shouldShowIncomingBanModal,
} from '@/lib/incoming-challenge';
import { explainIncomingHidden, logIncomingDebug } from '@/lib/incoming-debug';
import { useApp } from './Providers';
import { BigButton } from './BigButton';
import { useTelegram } from '@/hooks/useTelegram';
import { ModalShell } from './ModalShell';

function IncomingBanOverlayInner() {
  const {
    token,
    user,
    loading: authLoading,
    isAppReady,
    incomingBan,
    acknowledgeIncomingAndStartReply,
    acknowledgeIncomingSeen,
    reloadPending,
    onboard,
  } = useApp();
  const { haptic, hapticSuccess, bindBack } = useTelegram();
  const [loading, setLoading] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [verifiedBan, setVerifiedBan] = useState<BanInteraction | null>(null);

  const viewerId = user?.id ?? null;

  const bootstrap = useCallback(async () => {
    if (!incomingBan?.id || !token) {
      setVerifiedBan(null);
      return;
    }

    if (!isValidIncomingOverlayPayload(incomingBan, viewerId)) {
      return;
    }

    setBootError(null);

    try {
      const apiOk = await pingApi();
      if (!apiOk) {
        setBootError('Нет связи с API');
        return;
      }

      const ban = await verifyIncomingChallenge(token, incomingBan.id);
      if (!isValidIncomingOverlayPayload(ban, viewerId)) {
        challengeLog('overlay:already-acked', { banId: incomingBan.id });
        return;
      }
      validateReplyTarget(ban);
      setVerifiedBan(ban);
      challengeLog('overlay:verified', { banId: ban.id });
    } catch (e) {
      setBootError(formatDeliveryError(e));
      setVerifiedBan(null);
    }
  }, [incomingBan, token, viewerId]);

  useEffect(() => {
    if (!incomingBan || !token) return;
    if (!shouldShowIncomingBanModal(incomingBan, viewerId, new Set())) {
      return;
    }
    void bootstrap();
    onboard().catch(() => {});
    return bindBack(() => {
      if (incomingBan.status === 'pending') return;
      void acknowledgeIncomingSeen(incomingBan.id);
    }, true);
  }, [incomingBan, token, viewerId, bindBack, onboard, bootstrap, acknowledgeIncomingSeen]);

  const ban = verifiedBan ?? incomingBan;

  const senderLabel = useMemo(() => {
    if (!ban?.sender) return '';
    const u = ban.sender.username?.replace(/^@/, '').trim();
    if (u) return `@${u}`;
    return formatSenderDisplayName(ban.sender.username, ban.sender.firstName);
  }, [ban?.sender]);

  const handleCounter = useCallback(async () => {
    if (!ban?.id || !ban.sender || loading) return;
    haptic('medium');
    setLoading(true);
    try {
      await acknowledgeIncomingAndStartReply(ban);
    } finally {
      setLoading(false);
    }
  }, [ban, haptic, loading, acknowledgeIncomingAndStartReply]);

  const handleOverboard = useCallback(async () => {
    if (!ban?.id || !token || loading) return;
    setLoading(true);
    hapticSuccess();
    try {
      await acknowledgeIncomingSeen(ban.id);
      await api(`/bans/${ban.id}/overboard`, { method: 'POST', token });
      setVerifiedBan(null);
      await reloadPending();
    } catch (e) {
      alert(formatDeliveryError(e));
    } finally {
      setLoading(false);
    }
  }, [ban?.id, token, hapticSuccess, loading, acknowledgeIncomingSeen, reloadPending]);

  const hideReason = explainIncomingHidden(
    incomingBan,
    viewerId,
    authLoading,
    viewerId,
    new Set(),
  );

  const shouldShow = incomingBan
    ? shouldShowIncomingBanModal(incomingBan, viewerId, new Set())
    : false;

  if (incomingBan?.id) {
    logIncomingDebug({
      authUserId: viewerId,
      incomingId: incomingBan.id,
      incomingReceiverId: incomingBan.receiver?.id,
      incomingAcknowledged: incomingBan.incomingAcknowledged,
      shouldShow,
      reason: shouldShow ? 'shown' : hideReason.reason,
    });
  }

  if (!incomingBan || !token || authLoading || !viewerId || !isAppReady) {
    return null;
  }

  if (!shouldShow) {
    return null;
  }

  if (!ban || !isValidIncomingOverlayPayload(ban, viewerId)) {
    return null;
  }

  const canAct = !!ban.sender?.id && !bootError;

  return (
    <ModalShell
      open
      light
      closeOnBackdrop={false}
      ariaLabel="Входящий запрет"
      onClose={() => void acknowledgeIncomingSeen(ban.id)}
      cardClassName="modal-card--incoming"
    >
      <div className="incoming-modal-body text-center">
        <p className="incoming-modal-title text-xl font-black text-glow mb-3">
          тебе запретили!
        </p>

        <div className="incoming-modal-sender mb-3">
          <SenderAvatar
            name={ban.sender?.firstName ?? '—'}
            photoUrl={ban.sender?.photoUrl ?? null}
          />
          <p className="text-muted text-sm mt-2">{senderLabel}</p>
        </div>

        <p className="incoming-modal-text text-lg font-semibold leading-snug mb-4 px-1">
          «{ban.text}»
        </p>

        {bootError ? (
          <p className="text-warning text-xs mb-3 max-w-xs mx-auto">{bootError}</p>
        ) : null}

        <div className="incoming-modal-actions space-y-2.5">
          <BigButton onClick={handleCounter} disabled={loading || !canAct}>
            🚫 Запретить в ответ
          </BigButton>
          <BigButton
            variant="ghost"
            onClick={handleOverboard}
            disabled={loading || !canAct}
          >
            🫷 Перебор!
          </BigButton>
        </div>
      </div>
    </ModalShell>
  );
}

export const IncomingBanOverlay = memo(IncomingBanOverlayInner);

function SenderAvatar({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl: string | null;
}) {
  return (
    <div className="modal-avatar mx-auto" aria-hidden>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-lg font-bold">{name[0]?.toUpperCase() ?? '?'}</span>
      )}
    </div>
  );
}
