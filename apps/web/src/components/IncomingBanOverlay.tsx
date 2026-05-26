'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { BanInteraction, SessionState } from '@98plus/shared';
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
import { useApp } from './Providers';
import { BigButton } from './BigButton';
import { useTelegram } from '@/hooks/useTelegram';
import { ModalShell } from './ModalShell';

function IncomingBanOverlayInner() {
  const {
    token,
    user,
    incomingBan,
    dismissIncoming,
    applySession,
    reloadPending,
    onboard,
    startIncomingReply,
  } = useApp();
  const { haptic, hapticSuccess, bindBack } = useTelegram();
  const [loading, setLoading] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [verifiedBan, setVerifiedBan] = useState<BanInteraction | null>(null);

  const safeDismiss = useCallback(
    (banId?: string, reason?: string) => {
      challengeLog('overlay:dismiss', { banId: banId ?? null, reason });
      dismissIncoming(banId);
    },
    [dismissIncoming],
  );

  const bootstrap = useCallback(async () => {
    if (!incomingBan?.id || !token) {
      setVerifiedBan(null);
      return;
    }

    if (!isValidIncomingOverlayPayload(incomingBan, user?.id)) {
      safeDismiss(incomingBan.id, 'invalid-local-payload');
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
      if (!isValidIncomingOverlayPayload(ban, user?.id)) {
        safeDismiss(incomingBan.id, 'resolved-on-server');
        return;
      }
      validateReplyTarget(ban);
      setVerifiedBan(ban);
      challengeLog('overlay:verified', { banId: ban.id });
    } catch (e) {
      setBootError(formatDeliveryError(e));
      setVerifiedBan(null);
    }
  }, [incomingBan, token, user?.id, safeDismiss]);

  useEffect(() => {
    if (!incomingBan || !token) return;
    if (!isValidIncomingOverlayPayload(incomingBan, user?.id)) {
      safeDismiss(incomingBan.id, 'stale-incoming');
      return;
    }
    void bootstrap();
    onboard().catch(() => {});
    return bindBack(() => {
      if (incomingBan.status === 'pending') return;
      safeDismiss(incomingBan.id, 'back-button');
    }, true);
  }, [incomingBan, token, bindBack, safeDismiss, onboard, bootstrap]);

  const ban = verifiedBan ?? incomingBan;

  const senderLabel = useMemo(() => {
    if (!ban?.sender) return '';
    const u = ban.sender.username?.replace(/^@/, '').trim();
    if (u) return `@${u}`;
    return formatSenderDisplayName(ban.sender.username, ban.sender.firstName);
  }, [ban?.sender]);

  const finishWithSession = useCallback(
    (action: string, banId: string, session?: SessionState) => {
      challengeLog(`resolve:${action}`, { banId });
      safeDismiss(banId, action);
      setVerifiedBan(null);
      if (session) applySession(session);
    },
    [applySession, safeDismiss],
  );

  const handleCounter = useCallback(() => {
    if (!ban?.id || !ban.sender) return;
    haptic('medium');
    startIncomingReply(ban);
    safeDismiss(ban.id, 'counter-flow');
  }, [ban, haptic, safeDismiss, startIncomingReply]);

  const handleOverboard = useCallback(async () => {
    if (!ban?.id || !token) return;
    setLoading(true);
    hapticSuccess();
    try {
      await api(`/bans/${ban.id}/overboard`, { method: 'POST', token });
      finishWithSession('overboard', ban.id);
      await reloadPending();
    } catch (e) {
      alert(formatDeliveryError(e));
    } finally {
      setLoading(false);
    }
  }, [ban?.id, token, hapticSuccess, finishWithSession, reloadPending]);

  const viewerId = user?.id ?? null;

  if (
    !incomingBan ||
    !token ||
    !shouldShowIncomingBanModal(incomingBan, viewerId, new Set())
  ) {
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
      onClose={() => safeDismiss(ban.id, 'backdrop-blocked')}
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
