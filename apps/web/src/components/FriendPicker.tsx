'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FriendCard } from '@98plus/shared';
import { coerceFriendList } from '@98plus/shared';
import { api } from '@/lib/api';
import { useApp } from './Providers';
import {
  mergeFriendsWithOptimistic,
  isOptimisticSendWaitActive,
} from '@/lib/waiting-lifecycle';

function FriendAvatar({
  friend,
  size = 'lg',
}: {
  friend: FriendCard;
  size?: 'lg' | 'md';
}) {
  const letter = (
    friend.firstName?.[0] ??
    friend.username?.[0] ??
    '?'
  ).toUpperCase();
  const dim = size === 'lg' ? 'w-[72px] h-[72px] text-2xl' : 'w-12 h-12 text-lg';

  if (friend.photoUrl) {
    return (
      <img
        src={friend.photoUrl}
        alt=""
        loading="lazy"
        className={`${dim} rounded-full object-cover ring-2 ring-white/15 bg-card`}
      />
    );
  }

  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center font-bold bg-gradient-to-br from-white/10 to-white/5 ring-2 ring-white/10 text-muted`}
    >
      {letter}
    </div>
  );
}

function stateBadge(friend: FriendCard): string | null {
  if (friend.challengeState === 'incoming_pending') return 'вызвал';
  switch (friend.friendState) {
    case 'pending':
      return 'ждёт';
    case 'in_challenge':
      return 'в игре';
    case 'invited':
      return 'ждёт';
    case 'active':
      return 'онлайн';
    default:
      return null;
  }
}

export function FriendAvatarCard({
  friend,
  selected,
  onSelect,
}: {
  friend: FriendCard;
  selected: boolean;
  onSelect: () => void;
}) {
  const online = friend.presence === 'online';
  const recent = friend.presence === 'recent';
  const isOptimistic = (friend.id ?? '').startsWith('optimistic:');
  const pending =
    isOptimistic ||
    friend.challengeState === 'outgoing_pending' ||
    friend.hasPendingInvite;
  const hotStreak = (friend.streak ?? 0) >= 3;
  const badge = stateBadge(friend);

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileTap={{ scale: 0.92 }}
      animate={{ scale: selected ? 1.06 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      className={`friend-avatar-card flex-shrink-0 flex flex-col items-center gap-2 w-[92px] snap-center ${
        selected ? 'friend-avatar-selected' : ''
      } ${pending ? 'friend-pending-pulse' : ''} ${
        online ? 'friend-online-ring' : recent ? 'friend-recent-glow' : ''
      }`}
    >
      <div className="relative">
        <FriendAvatar friend={friend} size="lg" />
        {friend.userId && (
          <span
            className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-[2.5px] border-bg ${
              online
                ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]'
                : recent
                  ? 'bg-amber-400'
                  : 'bg-white/25'
            }`}
          />
        )}
        {hotStreak && (
          <motion.span
            animate={{ scale: [1, 1.15, 1], opacity: [0.9, 1, 0.9] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
            className="absolute -top-1 -left-1 text-sm"
          >
            🔥
          </motion.span>
        )}
        {badge && (
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent/90 text-white shadow-glow-sm">
            {badge}
          </span>
        )}
      </div>

      <div className="text-center w-full px-0.5">
        <p className="text-xs font-semibold truncate leading-tight">
          {friend.firstName || friend.username || '—'}
        </p>
        <p className="text-[10px] text-muted truncate">
          @{friend.username || '—'}
        </p>
        {friend.userId && (
          <div className="flex items-center justify-center gap-1.5 mt-1 text-[9px] text-muted">
            <span>⚡{friend.energyPercent}</span>
            {friend.streak > 0 && <span>🔥{friend.streak}</span>}
          </div>
        )}
        {isOptimistic ? (
          <motion.p
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
            className="text-[9px] text-accent mt-0.5"
          >
            ⚡ вызов ушёл
          </motion.p>
        ) : !friend.isRegistered ? (
          <p className="text-[9px] text-accent/80 mt-0.5">вызов отправлен</p>
        ) : friend.photoUrl ? null : (
          <p className="text-[9px] text-muted/70 mt-0.5">в 98+</p>
        )}
      </div>
    </motion.button>
  );
}

function AddMoreCard({
  onClick,
  busy,
}: {
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.03 }}
      disabled={busy}
      onClick={onClick}
      className={`friend-add-more-card flex-shrink-0 snap-center ${busy ? 'friend-add-more-card--busy' : ''}`}
      aria-label="Добавить ещё"
    >
      <span className="friend-add-more-card__plus">{busy ? '…' : '+'}</span>
      <span className="friend-add-more-card__label">
        {busy ? 'Открываем…' : 'Добавить ещё'}
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
  showAddMore?: boolean;
  onAddMore?: () => void;
  addMoreBusy?: boolean;
}

export function FriendPicker({
  token,
  value,
  onChange,
  friends: externalFriends,
  onFriendsUpdate,
  showAddMore = false,
  onAddMore,
  addMoreBusy = false,
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
    const merged = mergeFriendsWithOptimistic(
      coerceFriendList(friends),
      optimisticSendWait,
    );
    return merged.filter(
      (f) => (f.username ?? '').toLowerCase() !== 'share',
    );
  }, [friends, optimisticSendWait]);

  function pick(username: string | null | undefined) {
    const clean = (username ?? '').replace(/^@/, '').trim();
    if (!clean) return;
    onChange(`@${clean}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-0.5">
        <p className="text-xs text-muted uppercase tracking-wider">Твои люди</p>
        {selectedUsername && (
          <motion.span
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-[10px] text-accent font-medium"
          >
            выбран
          </motion.span>
        )}
      </div>

      <div className="friends-strip flex gap-4 py-2 -mx-1 px-2 snap-x snap-mandatory min-h-[140px] items-start">
        {people.length === 0 && !showAddMore ? (
          <div className="flex flex-col items-center justify-center py-6 px-4 text-center w-full min-w-0">
            <p className="text-sm text-white/90 font-medium">Пока здесь никого</p>
            <p className="text-xs text-muted/80 mt-2">Отправь первый запрет</p>
          </div>
        ) : (
          people.map((f, i) => {
            const uname = (f.username ?? '').toLowerCase();
            return (
              <motion.div
                key={f.id ?? `pending:${uname || i}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <FriendAvatarCard
                  friend={f}
                  selected={!!selectedUsername && selectedUsername === uname}
                  onSelect={() => pick(f.username)}
                />
              </motion.div>
            );
          })
        )}
        {showAddMore && onAddMore ? (
          <AddMoreCard onClick={onAddMore} busy={addMoreBusy} />
        ) : null}
      </div>

      <AnimatePresence>
        {selectedUsername && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center text-[11px] text-accent/90"
          >
            {isOptimisticSendWaitActive(optimisticSendWait) &&
            optimisticSendWait?.username === selectedUsername
              ? '⚡ вызов ушёл — ждём в арене'
              : people.find(
                  (p) => (p.username ?? '').toLowerCase() === selectedUsername,
                )?.recentChallenge ?? 'готов к вызову'}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
