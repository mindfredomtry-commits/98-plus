'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  coerceFriendList,
  findFriendByUsername,
  type FriendCard,
} from '@98plus/shared';
import { useApp } from '../Providers';
import { useTelegram } from '@/hooks/useTelegram';
import { useSendChallenge } from '@/hooks/useSendChallenge';
import { useInstantBanViewport } from '@/hooks/useInstantBanViewport';
import { safeResolveReceiverTarget } from '@/lib/resolve-receiver';
import { resolveDevSendTarget } from '@/lib/dev-receiver';
import { isClientDevAuthEnabled } from '@/lib/config';
import {
  instantBanDebug,
  instantBanPayoffArmDebug,
  instantBanSendBeforeDebug,
  instantBanSendErrorDebug,
  instantBanSendSuccessDebug,
  isInstantBanLiteMode,
} from '@/lib/instant-ban-debug';
import { resolveLobbyInfluencePercent } from '@/lib/lobby-influence';
import { shareInstantBanInviteMore } from '@/lib/share';
import { InfluenceRing } from '../lobby/InfluenceRing';
import { ArenaLobbyIdle } from './ArenaLobbyIdle';
import { WhoScreen } from './WhoScreen';
import { WhatScreen } from './WhatScreen';
import { ConfirmScreen } from './ConfirmScreen';
import '../lobby-screen.css';
import './instant-ban.css';

const DEFAULT_DURATION_MINUTES = 3;

/** Parent send-flow phases (arena shell stays mounted). */
export type SendFlowPhase =
  | 'idle'
  | 'selectingTarget'
  | 'composingBan'
  | 'confirming';

/** Legacy step ids for CSS hooks / debug. */
type LegacyStep = 'idle' | 'who' | 'what' | 'confirm';

type Props = {
  sendStarted: boolean;
  onStartSend: () => void;
  influencePercent: number;
  inviteUsername?: string | null;
  onClose?: () => void;
};

function legacyStepFromPhase(phase: SendFlowPhase): LegacyStep {
  switch (phase) {
    case 'idle':
      return 'idle';
    case 'selectingTarget':
      return 'who';
    case 'composingBan':
      return 'what';
    case 'confirming':
      return 'confirm';
  }
}

function triggerConfirmHaptic(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(30);
    }
    const telegramHaptic = (
      window as Window & {
        Telegram?: {
          WebApp?: {
            HapticFeedback?: {
              notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
            };
          };
        };
      }
    ).Telegram?.WebApp?.HapticFeedback;
    telegramHaptic?.notificationOccurred?.('success');
  } catch {
    // no-op
  }
}

export function InstantBanFlow({
  sendStarted,
  onStartSend,
  influencePercent,
  inviteUsername = null,
}: Props) {
  const flowId = useId();
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const {
    token,
    user,
    friends,
    reloadPending,
    reloadFriends,
    refreshUser,
    onboard,
    scheduleDeferredSync,
    applyOptimisticSend,
    confirmOptimisticSend,
    rollbackOptimisticSend,
  } = useApp();
  const { haptic } = useTelegram();

  const [phase, setPhase] = useState<SendFlowPhase>(
    sendStarted ? 'selectingTarget' : 'idle',
  );
  const [selectedUser, setSelectedUser] = useState<FriendCard | null>(null);
  const [banText, setBanText] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmEnterKey, setConfirmEnterKey] = useState(0);
  const [payoffArmToken, setPayoffArmToken] = useState(0);
  const sendSnapshotRef = useRef<{
    banText: string;
    selectedUser: FriendCard;
    durationMinutes: number;
  } | null>(null);
  const confirmSendContextRef = useRef<{
    payoffPhase: string;
    sendTriggered: boolean;
  }>({ payoffPhase: 'none', sendTriggered: false });
  const confirmAbortReleaseRef = useRef<(() => void) | null>(null);
  const payoffArmedRef = useRef(false);
  const payoffArmTokenRef = useRef(0);
  const lobbyOrbMountRef = useRef<HTMLDivElement>(null);

  const legacyStep = legacyStepFromPhase(phase);
  const overlayOpen = phase === 'selectingTarget' || phase === 'composingBan';

  useInstantBanViewport(phase === 'composingBan');

  useEffect(() => {
    if (sendStarted && phase === 'idle') {
      setPhase('selectingTarget');
    }
  }, [sendStarted, phase]);

  useEffect(() => {
    instantBanDebug('flow-mount', { flowId });
    return () => {
      instantBanDebug('flow-unmount', { flowId });
    };
  }, [flowId]);

  useEffect(() => {
    instantBanDebug('flow-render', {
      flowId,
      phase,
      legacyStep,
      renderCount: renderCountRef.current,
    });
  });

  const safeFriends = useMemo(() => {
    try {
      return coerceFriendList(friends).filter(
        (f) => (f.username ?? '').toLowerCase() !== 'share',
      );
    } catch {
      return [];
    }
  }, [friends]);

  const resetForAnother = useCallback(() => {
    setPhase('selectingTarget');
    setSelectedUser(null);
    setBanText('');
    setDurationMinutes(DEFAULT_DURATION_MINUTES);
    setSendError(null);
    payoffArmedRef.current = false;
    sendSnapshotRef.current = null;
  }, []);

  const onSuccess = useCallback(() => {
    setSendError(null);
    payoffArmedRef.current = true;
    const nextToken = payoffArmTokenRef.current + 1;
    payoffArmTokenRef.current = nextToken;
    instantBanSendSuccessDebug({
      payoffArmToken: nextToken,
      payoffPending: confirmSendContextRef.current.sendTriggered,
      payoffPhase: confirmSendContextRef.current.payoffPhase,
    });
    instantBanPayoffArmDebug({
      payoffArmToken: nextToken,
      payoffPending: confirmSendContextRef.current.sendTriggered,
    });
    setPayoffArmToken(nextToken);
  }, []);

  const { send, inFlight, sharing } = useSendChallenge({
    token,
    friends: safeFriends,
    onSuccess,
    onOptimisticApply: (p) => {
      applyOptimisticSend({
        username: p.username,
        firstName:
          findFriendByUsername(safeFriends, p.username)?.firstName ??
          p.username,
        banText: p.text,
        durationMinutes: p.durationMinutes,
      });
    },
    onConfirm: (p) => {
      confirmOptimisticSend(p.username);
    },
    onFail: (p) => {
      rollbackOptimisticSend({
        username: p.username,
        message: p.message,
      });
      const message = p.message || 'Не получилось отправить запрет';
      instantBanSendErrorDebug({
        message,
        error: p,
        payoffArmed: payoffArmedRef.current,
        payoffArmToken: payoffArmTokenRef.current,
      });
      if (payoffArmedRef.current) {
        instantBanDebug('send-error-after-payoff-armed', {
          message,
          payoffArmToken: payoffArmTokenRef.current,
        });
        return;
      }
      setSendError(message);
    },
    onboard,
    refreshUser,
    reloadPending,
    reloadFriends,
    scheduleDeferredSync,
  });

  const overlayTitle = useMemo(() => {
    switch (phase) {
      case 'selectingTarget':
        return 'КОМУ ЗАПРЕЩАЕШЬ?';
      case 'composingBan':
        return 'ЧТО ЗАПРЕЩАЕШЬ?';
      default:
        return '';
    }
  }, [phase]);

  const handleBeginSend = useCallback(() => {
    onStartSend();
    setPhase('selectingTarget');
  }, [onStartSend]);

  const handleSelectUser = useCallback((friend: FriendCard) => {
    setSelectedUser(friend);
    setBanText('');
    setDurationMinutes(DEFAULT_DURATION_MINUTES);
    setSendError(null);
    setPhase('composingBan');
  }, []);

  const handleWhatSubmit = useCallback((text: string, duration: number) => {
    setBanText(text);
    setDurationMinutes(duration);
    payoffArmedRef.current = false;
    sendSnapshotRef.current = null;
    setConfirmEnterKey((k) => k + 1);
    setPhase('confirming');
  }, []);

  const handleWhatBack = useCallback(() => {
    setPhase('selectingTarget');
  }, []);

  const handleConfirmBack = useCallback(() => {
    setPhase('composingBan');
  }, []);

  const handleInviteMore = useCallback(() => {
    shareInstantBanInviteMore(user?.username ?? null);
    haptic('light');
  }, [user?.username, haptic]);

  const handleSendContextChange = useCallback(
    (ctx: { payoffPhase: string; sendTriggered: boolean }) => {
      confirmSendContextRef.current = ctx;
    },
    [],
  );

  const handleBindAbortRelease = useCallback((abort: () => void) => {
    confirmAbortReleaseRef.current = abort;
  }, []);

  const executeSend = useCallback(async (): Promise<'started' | 'skipped' | 'rejected'> => {
    const snap = sendSnapshotRef.current;
    if (!snap) {
      instantBanDebug('send-skipped', { reason: 'no-snapshot' });
      return 'rejected';
    }

    const { banText: snapText, selectedUser: snapUser, durationMinutes: snapDuration } =
      snap;

    const username = (snapUser.username ?? '').replace(/^@/, '').trim();
    const resolved = safeResolveReceiverTarget(username, safeFriends, {
      receiverUserId: snapUser.userId ?? null,
      receiverTelegramId: snapUser.telegramId ?? null,
    });
    const devTarget = resolveDevSendTarget(safeFriends, `@${username}`, {
      username: user?.username,
      userId: user?.id,
    });

    const sendTarget = devTarget ?? {
      receiverUsername: `@${username}`,
      receiverUserId: resolved.receiverUserId ?? snapUser.userId ?? null,
      receiverTelegramId:
        resolved.receiverTelegramId ?? snapUser.telegramId ?? null,
    };

    const instantDirectSend =
      Boolean(username) &&
      (resolved.isRegistered ||
        Boolean(sendTarget.receiverUserId || sendTarget.receiverTelegramId));

    instantBanSendBeforeDebug({
      banText: snapText,
      selectedUserId: snapUser.id ?? snapUser.userId ?? null,
      selectedUsername: snapUser.username ?? null,
      durationMinutes: snapDuration,
      senderUserId: user?.id ?? null,
      currentUserId: user?.id ?? null,
      payoffPhase: confirmSendContextRef.current.payoffPhase,
      sendTriggered: confirmSendContextRef.current.sendTriggered,
      inFlight,
      sharing,
      hasToken: Boolean(token),
      receiverUserId: sendTarget.receiverUserId,
      receiverTelegramId: sendTarget.receiverTelegramId,
      devAuth: isClientDevAuthEnabled(),
      devPeerResolved: Boolean(devTarget?.receiverUserId),
      instantDirectSend,
      isRegistered: resolved.isRegistered,
    });

    if (!token) {
      instantBanDebug('send-rejected', { reason: 'no-token' });
      setSendError('Не получилось отправить запрет');
      return 'rejected';
    }

    const text = snapText.trim();
    if (text.length < 3) {
      instantBanDebug('send-rejected', { reason: 'text-too-short', length: text.length });
      setSendError('Не получилось отправить запрет');
      return 'rejected';
    }

    if (!username) {
      instantBanDebug('send-rejected', { reason: 'no-username' });
      setSendError('Не получилось отправить запрет');
      return 'rejected';
    }

    if (isClientDevAuthEnabled() && !sendTarget.receiverUserId) {
      instantBanDebug('send-rejected', { reason: 'dev-peer-missing' });
      setSendError('Выбери Dev Peer в списке людей');
      return 'rejected';
    }

    if (!payoffArmedRef.current) {
      setSendError(null);
    }
    triggerConfirmHaptic();
    haptic('medium');

    try {
      const outcome = await send({
        text,
        receiverUsername: sendTarget.receiverUsername.startsWith('@')
          ? sendTarget.receiverUsername
          : `@${sendTarget.receiverUsername}`,
        receiverUserId: sendTarget.receiverUserId,
        receiverTelegramId: sendTarget.receiverTelegramId,
        durationMinutes: snapDuration,
      });
      if (outcome === 'skipped') {
        instantBanDebug('send-skipped', { reason: 'hook-in-flight' });
        return 'skipped';
      }
      return 'started';
    } catch (e) {
      instantBanSendErrorDebug({
        message: e instanceof Error ? e.message : String(e),
        error: e,
        payoffArmed: payoffArmedRef.current,
      });
      return 'started';
    }
  }, [token, haptic, safeFriends, user?.username, user?.id, send]);

  const captureSendSnapshot = useCallback(() => {
    if (!selectedUser) return false;
    sendSnapshotRef.current = {
      banText,
      selectedUser,
      durationMinutes,
    };
    return true;
  }, [banText, selectedUser, durationMinutes]);

  const handleConfirmRelease = useCallback(async () => {
    instantBanDebug('confirm-release', {
      payoffPending: confirmSendContextRef.current.sendTriggered,
    });
    if (!captureSendSnapshot()) {
      confirmAbortReleaseRef.current?.();
      return;
    }

    const outcome = await executeSend();
    if (outcome === 'rejected') {
      instantBanDebug('send-abort-release', { reason: 'send-rejected' });
      confirmAbortReleaseRef.current?.();
    }
  }, [captureSendSnapshot, executeSend]);

  const handleRetrySend = useCallback(async () => {
    if (!captureSendSnapshot()) return;
    await executeSend();
  }, [captureSendSnapshot, executeSend]);

  const lobbyInfluencePercent = useMemo(
    () => Math.min(100, Math.max(0, influencePercent)),
    [influencePercent],
  );

  const liteMode = isInstantBanLiteMode();
  const whatMobileSafe = phase === 'composingBan';

  return (
    <div
      className={`lobby-screen instant-ban-arena-send instant-ban-flow${
        whatMobileSafe ? ' instant-ban-flow--what-mobile-safe' : ''
      }${liteMode ? ' instant-ban-debug-lite' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="98+ arena"
      data-instant-ban-view="InstantBanFlow"
      data-send-phase={phase}
      data-instant-ban-step={legacyStep}
    >
      <div className="lobby-screen__grid" aria-hidden />
      <div className="lobby-screen__particles" aria-hidden>
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className="lobby-screen__particle" />
        ))}
      </div>

      <div className="instant-ban-arena-send__stage">
        <div
          ref={lobbyOrbMountRef}
          className={`lobby-screen__orb-wrap${
            phase === 'confirming' ? ' lobby-screen__orb-wrap--confirm' : ''
          }${overlayOpen ? ' lobby-screen__orb-wrap--overlay-dim' : ''}`}
        >
          {phase !== 'confirming' ? (
            <>
              <InfluenceRing value={lobbyInfluencePercent} />
              <div className="lobby-screen__orb">
                <span className="lobby-screen__title">98+</span>
              </div>
            </>
          ) : null}
        </div>

        {phase === 'confirming' && selectedUser ? (
          <div className="instant-ban-arena-send__confirm-layer">
            <ConfirmScreen
              key={`confirm-${confirmEnterKey}-${selectedUser.id ?? selectedUser.userId ?? selectedUser.username}`}
              enterKey={confirmEnterKey}
              sharedLobbyOrb
              sharedOrbMountRef={lobbyOrbMountRef}
              influencePercent={lobbyInfluencePercent}
              senderUser={user}
              selectedUser={selectedUser}
              banText={banText}
              durationMinutes={durationMinutes}
              sending={inFlight || sharing}
              error={sendError}
              payoffArmToken={payoffArmToken}
              onConfirm={() => void handleConfirmRelease()}
              onAgain={resetForAnother}
              onRetry={() => void handleRetrySend()}
              onBack={handleConfirmBack}
              onSendContextChange={handleSendContextChange}
              onBindAbortRelease={handleBindAbortRelease}
            />
          </div>
        ) : null}

        {overlayOpen ? (
          <div
            className={`instant-ban-send-overlay${
              phase === 'composingBan' ? ' instant-ban-send-overlay--compose' : ''
            }`}
            role="presentation"
          >
            {phase === 'selectingTarget' ? (
              <div className="instant-ban-send-overlay__panel">
                <h1 className="instant-ban-send-overlay__title">{overlayTitle}</h1>
                <div className="instant-ban-send-overlay__body">
                  <WhoScreen
                    friends={safeFriends}
                    onSelect={handleSelectUser}
                    onInviteMore={handleInviteMore}
                  />
                </div>
              </div>
            ) : null}
            {phase === 'composingBan' && selectedUser ? (
              <WhatScreen
                key={selectedUser.id ?? selectedUser.userId ?? selectedUser.username}
                overlayTitle={overlayTitle}
                selectedUser={selectedUser}
                initialBanText={banText}
                initialDurationMinutes={durationMinutes}
                onSubmit={handleWhatSubmit}
                onBack={handleWhatBack}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {phase === 'idle' ? (
        <ArenaLobbyIdle
          influencePercent={lobbyInfluencePercent}
          inviteUsername={inviteUsername}
          onBeginSend={handleBeginSend}
        />
      ) : null}
    </div>
  );
}
