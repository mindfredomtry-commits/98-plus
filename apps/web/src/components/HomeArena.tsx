'use client';

import { memo, useMemo, useCallback, useEffect, useState } from 'react';
import type { BanInteraction, UserPublic } from '@98plus/shared';
import { useApp } from './Providers';
import { CompactArenaHeader } from './CompactArenaHeader';
import { ChallengeCompose } from './ChallengeCompose';
import { DurationPills } from './DurationPills';
import { FriendPicker } from './FriendPicker';
import { FirstBanOnboarding } from './FirstBanOnboarding';
import {
  sendFirstBanChallenge,
  shareBanViaTelegram,
} from '@/lib/first-challenge-share';
import { isClientDevAuthEnabled } from '@/lib/config';
import { pickDevReceiverFriend } from '@/lib/dev-receiver';

interface Props {
  user: UserPublic;
}

function HomeArenaInner({ user }: Props) {
  const {
    token,
    friends,
    isAppReady,
    loading: authLoading,
    activeBans,
    sendReceiver,
    setSendReceiver,
    sendText,
    setSendText,
    sendDuration,
    setSendDuration,
    showFirstBanOnboarding,
    completeFirstBan,
    refreshUser,
    reloadPending,
    reloadFriends,
    onboard,
    setBanSentOpen,
    setInlineBanError,
    triggerBanInputShake,
  } = useApp();

  const [shareBusy, setShareBusy] = useState(false);

  const safeFriends = useMemo(
    () => (Array.isArray(friends) ? friends : []),
    [friends],
  );
  const safeActiveBans = useMemo(
    () => (Array.isArray(activeBans) ? activeBans : []),
    [activeBans],
  );

  useEffect(() => {
    if (!showFirstBanOnboarding) return;
    if (sendDuration < 60) {
      setSendDuration(60);
    }
  }, [showFirstBanOnboarding, sendDuration, setSendDuration]);

  useEffect(() => {
    if (!isClientDevAuthEnabled() || showFirstBanOnboarding) return;
    const peer = pickDevReceiverFriend(
      safeFriends,
      user.username,
      user.id,
    );
    if (!peer?.username) return;
    const want = `@${peer.username}`;
    const current = sendReceiver?.replace(/^@/, '').trim().toLowerCase();
    const self = user.username?.toLowerCase();
    if (!current || current === self || current === 'dev_user') {
      setSendReceiver(want);
    }
  }, [
    safeFriends,
    sendReceiver,
    setSendReceiver,
    showFirstBanOnboarding,
    user.username,
    user.id,
  ]);

  const requireBanText = useCallback((): string | null => {
    const text = sendText.trim();
    if (text.length >= 3) return text;
    setInlineBanError('Сначала напиши запрет');
    triggerBanInputShake();
    return null;
  }, [sendText, setInlineBanError, triggerBanInputShake]);

  const runShareFlow = useCallback(
    async (opts: { markFirstBan?: boolean }) => {
      if (!token || shareBusy) return;
      const text = requireBanText();
      if (!text) return;

      setShareBusy(true);
      setInlineBanError(null);
      try {
        if (opts.markFirstBan) {
          await sendFirstBanChallenge({
            token,
            banText: text,
            durationMinutes: sendDuration,
            afterShare: async () => {
              completeFirstBan();
              await onboard().catch(() => {});
              await refreshUser();
              await reloadPending();
              await reloadFriends();
            },
          });
        } else {
          await shareBanViaTelegram({
            token,
            banText: text,
            durationMinutes: sendDuration,
            afterShare: async () => {
              await reloadFriends();
              await reloadPending();
            },
          });
        }
        setBanSentOpen(true);
      } catch (e) {
        setInlineBanError((e as Error).message || 'Не удалось отправить');
      } finally {
        setShareBusy(false);
      }
    },
    [
      token,
      shareBusy,
      requireBanText,
      sendDuration,
      setInlineBanError,
      completeFirstBan,
      onboard,
      refreshUser,
      reloadPending,
      reloadFriends,
      setBanSentOpen,
    ],
  );

  const runAddMoreShare = useCallback(
    () => runShareFlow({ markFirstBan: false }),
    [runShareFlow],
  );

  const runFirstBanShare = useCallback(
    () => runShareFlow({ markFirstBan: true }),
    [runShareFlow],
  );

  return (
    <div className="home-arena home-arena--compact">
      {showFirstBanOnboarding ? (
        <FirstBanOnboarding
          banText={sendText}
          onBanTextChange={setSendText}
          durationMinutes={sendDuration}
          onDurationChange={setSendDuration}
          onPickChat={runFirstBanShare}
          pickChatBusy={shareBusy}
        />
      ) : (
        <>
          <CompactArenaHeader
            user={user}
            liveCount={safeActiveBans.length}
            friends={safeFriends}
          />

          <div className="challenge-stack glass-card border border-accent/15 shadow-glow-sm">
            <ChallengeCompose
              value={sendText}
              onChange={setSendText}
              compact
            />
            <DurationPills
              value={sendDuration}
              onChange={setSendDuration}
              compact
            />
          </div>

          {token ? (
            <section className="people-section glass-card border border-accent/12 shadow-glow-sm">
              {authLoading || !isAppReady ? (
                <FriendsStripSkeleton />
              ) : (
                <FriendPicker
                  key={user.id}
                  token={token}
                  value={sendReceiver ?? ''}
                  onChange={setSendReceiver}
                  friends={safeFriends}
                  inline
                  compact
                  showAddMore
                  onAddMore={runAddMoreShare}
                  addMoreBusy={shareBusy}
                  onRequireBan={requireBanText}
                />
              )}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function FriendsStripSkeleton() {
  return (
    <div className="friends-strip min-h-[140px] flex gap-2.5 py-1 px-0.5" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="w-[92px] h-[120px] rounded-2xl bg-white/5 animate-pulse flex-shrink-0"
        />
      ))}
    </div>
  );
}

export const HomeArena = memo(
  HomeArenaInner,
  (prev, next) =>
    (prev.user?.id ?? '') === (next.user?.id ?? '') &&
    prev.user?.energyPercent === next.user?.energyPercent,
);
