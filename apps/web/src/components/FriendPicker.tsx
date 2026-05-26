'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { FriendCard } from '@98plus/shared';
import { coerceFriendList } from '@98plus/shared';
import { api } from '@/lib/api';
import { preloadAvatarUrls, friendAvatarUrl } from '@/lib/avatar-url';
import { useApp } from './Providers';
import { AvatarImage } from './AvatarImage';
import {
  mergeFriendsWithOptimistic,
} from '@/lib/waiting-lifecycle';

function FriendAvatar({
  friend,
  compact,
  online,
}: {
  friend: FriendCard;
  compact?: boolean;
  online?: boolean;
}) {
  const letter = (
    friend.firstName?.[0] ??
    friend.username?.[0] ??
    '?'
  ).toUpperCase();
  const sizeClass = compact ? 'w-10 h-10' : 'w-[72px] h-[72px]';
  const textClass = compact ? 'text-sm' : 'text-2xl';

  return (
    <AvatarImage
      src={friendAvatarUrl(friend)}
      letter={letter}
      sizeClass={sizeClass}
      textClass={textClass}
      priority={!compact}
      onlineGlow={online}
    />
  );
}

export function FriendAvatarCard({
  friend,
  selected,
  onSelect,
  compact = false,
}: {
  friend: FriendCard;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  const online = friend.presence === 'online';

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileTap={{ scale: 0.94 }}
      animate={{ scale: selected ? 1.04 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      className={`friend-avatar-card flex-shrink-0 flex flex-col items-center snap-center ${
        compact ? 'friend-avatar-card--compact gap-0.5' : 'w-[92px] gap-2'
      } ${selected ? 'friend-avatar-selected' : ''}`}
    >
      <div className="avatar-card-slot">
        <FriendAvatar friend={friend} compact={compact} online={online} />
      </div>
      <p
        className={`font-semibold truncate w-full text-center leading-tight ${
          compact ? 'text-[9px]' : 'text-xs'
        }`}
      >
        {friend.firstName || friend.username || '—'}
      </p>
    </motion.button>
  );
}

function AddMoreCard({
  onClick,
  busy,
  compact,
}: {
  onClick: () => void;
  busy?: boolean;
  compact?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.02 }}
      disabled={busy}
      onClick={onClick}
      className={`friend-add-more-card flex-shrink-0 snap-center ${
        compact ? 'friend-add-more-card--compact' : ''
      } ${busy ? 'friend-add-more-card--busy' : ''}`}
      aria-label="Добавить"
    >
      <span className="friend-add-more-card__plus">{busy ? '…' : '+'}</span>
      <span className="friend-add-more-card__label">
        {busy ? '…' : 'Добавить'}
      </span>
    </motion.button>
  );
}

interface FriendPickerProps {
  token: string;
  value: string;
  onChange: (receiver: string) => void;
  friends?: FriendCard[];
  onFriendsUpdate?: (friends: FriendCard[]) => void;
  inline?: boolean;
  compact?: boolean;
  showAddMore?: boolean;
  onAddMore?: () => void;
  addMoreBusy?: boolean;
  onRequireBan?: () => string | null;
}

function FriendsStripSkeleton() {
  return (
    <div className="friends-strip min-h-[140px] flex gap-2.5 py-1" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="w-[92px] h-[120px] rounded-2xl bg-white/5 animate-pulse flex-shrink-0"
        />
      ))}
    </div>
  );
}

export function FriendPicker(props: FriendPickerProps) {
  const { friendsReady, loading: authLoading, user } = useApp();
  if (authLoading || !friendsReady || !user?.id) {
    return <FriendsStripSkeleton />;
  }
  return <FriendPickerInner {...props} />;
}

function FriendPickerInner({
  token,
  value,
  onChange,
  friends: externalFriends,
  onFriendsUpdate,
  compact = false,
  showAddMore = false,
  onAddMore,
  addMoreBusy = false,
  onRequireBan,
}: FriendPickerProps) {
  const { optimisticSendWait } = useApp();

  const [friends, setFriends] = useState<FriendCard[]>(() =>
    coerceFriendList(externalFriends),
  );

  const loadFriends = useCallback(async () => {
    const { friends: list } = await api<{ friends?: unknown }>('/friends', {
      token,
    });
    const safe = coerceFriendList(list);
    setFriends(safe);
    onFriendsUpdate?.(safe);
  }, [token, onFriendsUpdate]);

  useEffect(() => {
    if (externalFriends !== undefined) {
      setFriends(coerceFriendList(externalFriends));
      return;
    }
    loadFriends().catch(() => setFriends([]));
  }, [externalFriends, loadFriends]);

  useEffect(() => {
    if (!token) return;
    const t = setInterval(() => {
      api('/friends/presence', { method: 'POST', token }).catch(() => {});
    }, 30_000);
    return () => clearInterval(t);
  }, [token]);

  const selectedUsername = useMemo(() => {
    const v = value.replace('@', '').trim().toLowerCase();
    return v || null;
  }, [value]);

  const people = useMemo(() => {
    const base = coerceFriendList(friends);
    const merged =
      externalFriends !== undefined
        ? base
        : mergeFriendsWithOptimistic(base, optimisticSendWait);
    return merged.filter(
      (f) => (f.username ?? '').toLowerCase() !== 'share',
    );
  }, [friends, optimisticSendWait, externalFriends]);

  useEffect(() => {
    preloadAvatarUrls(people.map((f) => friendAvatarUrl(f)));
  }, [people]);

  function pick(username: string | null | undefined) {
    const clean = (username ?? '').replace(/^@/, '').trim();
    if (!clean) return;
    onChange(`@${clean}`);
  }

  function handleAddMore() {
    if (onRequireBan && !onRequireBan()) return;
    onAddMore?.();
  }

  return (
    <div className={compact ? 'friend-picker--compact' : 'space-y-3'}>
      <div className="flex items-center justify-between px-0.5">
        <p className="people-section-title">ТВОИ ЛЮДИ</p>
        {selectedUsername ? (
          <span className="text-[9px] text-accent font-medium">выбран</span>
        ) : null}
      </div>

      <div
        className={`friends-strip flex snap-x snap-mandatory ${
          compact ? 'friends-strip--compact' : 'gap-2.5 py-1 min-h-[140px] items-start -mx-0.5 px-0.5'
        }`}
      >
        {people.map((f, i) => {
          const uname = (f.username ?? '').toLowerCase();
          return (
            <FriendAvatarCard
              key={f.id ?? `pending:${uname || i}`}
              friend={f}
              compact={compact}
              selected={!!selectedUsername && selectedUsername === uname}
              onSelect={() => pick(f.username)}
            />
          );
        })}
        {showAddMore && onAddMore ? (
          <AddMoreCard
            onClick={handleAddMore}
            busy={addMoreBusy}
            compact={compact}
          />
        ) : null}
      </div>
    </div>
  );
}
