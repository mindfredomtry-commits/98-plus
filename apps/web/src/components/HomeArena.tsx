'use client';

import { memo, useMemo, useCallback, useEffect, useState } from 'react';
import { isIncomingOverlayBan, type BanInteraction, type UserPublic } from '@98plus/shared';
import { useApp } from './Providers';
import { SocialHeader } from './SocialHeader';
import { SocialPulseStrip } from './SocialPulseStrip';
import { ChallengeCompose } from './ChallengeCompose';
import { DurationPills } from './DurationPills';
import { FriendPicker } from './FriendPicker';
import { ActiveChallenges } from './ActiveChallenges';
import { FirstBanOnboarding } from './FirstBanOnboarding';
import {
  sendFirstBanChallenge,
  shareBanViaTelegram,
} from '@/lib/first-challenge-share';

interface Props {
  user: UserPublic;
}

function HomeArenaInner({ user }: Props) {
  const {
    token,
    friends,
    activeBans,
    sendReceiver,
    setSendReceiver,
    sendText,
    setSendText,
    sendDuration,
    setSendDuration,
    setIncomingBan,
    setCheckBan,
    showFirstBanOnboarding,
    completeFirstBan,
    refreshUser,
    reloadPending,
    reloadFriends,
    onboard,
    setBanSentOpen,
    setSendOpen,
  } = useApp();

  const [firstShareBusy, setFirstShareBusy] = useState(false);

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

  const openChallenge = useCallback(
    (b: BanInteraction | null | undefined) => {
      if (!b?.id) return;
      if (isIncomingOverlayBan(b) && b.sender?.id) {
        setIncomingBan(b);
      } else if (b.status === 'checking') {
        setCheckBan(b);
      }
    },
    [setIncomingBan, setCheckBan],
  );

  const runAddMoreShare = useCallback(async () => {
    if (!token || firstShareBusy) return;
    const text = sendText.trim();
    if (text.length < 3) {
      setSendOpen(true);
      return;
    }
    setFirstShareBusy(true);
    try {
      await shareBanViaTelegram({
        token,
        banText: text,
        durationMinutes: sendDuration,
        afterShare: async () => {
          await reloadFriends();
          await reloadPending();
        },
      });
      setBanSentOpen(true);
    } catch (e) {
      alert((e as Error).message || 'Не удалось отправить');
    } finally {
      setFirstShareBusy(false);
    }
  }, [
    token,
    firstShareBusy,
    sendText,
    sendDuration,
    reloadFriends,
    reloadPending,
    setBanSentOpen,
    setSendOpen,
  ]);

  const runFirstBanShare = useCallback(async () => {
    if (!token || firstShareBusy) return;
    const text = sendText.trim();
    if (text.length < 3) return;

    setFirstShareBusy(true);
    try {
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
      setBanSentOpen(true);
    } catch (e) {
      alert((e as Error).message || 'Не удалось отправить');
    } finally {
      setFirstShareBusy(false);
    }
  }, [
    token,
    firstShareBusy,
    sendText,
    sendDuration,
    completeFirstBan,
    onboard,
    refreshUser,
    reloadPending,
    reloadFriends,
    setBanSentOpen,
  ]);

  return (
    <div className="home-arena space-y-4">
      <SocialHeader user={user} liveCount={safeActiveBans.length} />

      {!showFirstBanOnboarding ? (
        <SocialPulseStrip friends={safeFriends} liveBans={safeActiveBans.length} />
      ) : null}

      {showFirstBanOnboarding ? (
        <FirstBanOnboarding
          banText={sendText}
          onBanTextChange={setSendText}
          durationMinutes={sendDuration}
          onDurationChange={setSendDuration}
          onPickChat={runFirstBanShare}
          pickChatBusy={firstShareBusy}
        />
      ) : (
        <>
          <section className="glass-card border border-accent/15 p-3 -mx-1 shadow-glow-sm">
            {token ? (
              <FriendPicker
                token={token}
                value={sendReceiver ?? ''}
                onChange={setSendReceiver}
                friends={safeFriends}
                inline
                showAddMore
                onAddMore={runAddMoreShare}
              />
            ) : null}
          </section>

          <section className="glass-card border border-accent/15 p-3 -mx-1 shadow-glow-sm">
            <ChallengeCompose value={sendText} onChange={setSendText} />
          </section>

          <DurationPills value={sendDuration} onChange={setSendDuration} />
        </>
      )}

      <ActiveChallenges items={safeActiveBans} onOpen={openChallenge} />
    </div>
  );
}

export const HomeArena = memo(
  HomeArenaInner,
  (prev, next) =>
    (prev.user?.id ?? '') === (next.user?.id ?? '') &&
    prev.user?.energyPercent === next.user?.energyPercent,
);
