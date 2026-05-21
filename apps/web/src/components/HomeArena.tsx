'use client';

import { memo, useMemo, useCallback } from 'react';
import { isIncomingOverlayBan, type BanInteraction, type UserPublic } from '@98plus/shared';
import { useApp } from './Providers';
import { SocialHeader } from './SocialHeader';
import { SocialPulseStrip } from './SocialPulseStrip';
import { ChallengeCompose } from './ChallengeCompose';
import { DurationPills } from './DurationPills';
import { FriendPicker } from './FriendPicker';
import { ActiveChallenges } from './ActiveChallenges';

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
  } = useApp();

  const safeFriends = useMemo(
    () => (Array.isArray(friends) ? friends : []),
    [friends],
  );
  const safeActiveBans = useMemo(
    () => (Array.isArray(activeBans) ? activeBans : []),
    [activeBans],
  );

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

  return (
    <div className="home-arena space-y-4">
      <SocialHeader user={user} liveCount={safeActiveBans.length} />

      <SocialPulseStrip friends={safeFriends} liveBans={safeActiveBans.length} />

      <section className="glass-card border border-accent/15 p-3 -mx-1 shadow-glow-sm">
        {token ? (
          <FriendPicker
            token={token}
            value={sendReceiver ?? ''}
            onChange={setSendReceiver}
            friends={safeFriends}
            inline
          />
        ) : null}
      </section>

      <section className="glass-card border border-accent/15 p-3 -mx-1 shadow-glow-sm">
        <ChallengeCompose value={sendText} onChange={setSendText} />
      </section>

      <DurationPills value={sendDuration} onChange={setSendDuration} />

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
