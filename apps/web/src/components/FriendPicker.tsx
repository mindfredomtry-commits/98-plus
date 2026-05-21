'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FriendCard, FriendSearchResult } from '@98plus/shared';
import { coerceFriendList, sanitizeFriendCard } from '@98plus/shared';
import { api } from '@/lib/api';
import { useApp } from './Providers';
import { mergeFriendsWithOptimistic, isOptimisticSendWaitActive } from '@/lib/waiting-lifecycle';

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
      return 'приглашён';
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

interface FriendPickerProps {
  token: string;
  value: string;
  onChange: (receiver: string) => void;
  friends?: FriendCard[];
  onFriendsUpdate?: (friends: FriendCard[]) => void;
  inline?: boolean;
}

export function FriendPicker({
  token,
  value,
  onChange,
  friends: externalFriends,
  onFriendsUpdate,
}: FriendPickerProps) {
  const { optimisticSendWait } = useApp();
  const [friends, setFriends] = useState<FriendCard[]>(() =>
    coerceFriendList(externalFriends),
  );
  const [search, setSearch] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchResult, setSearchResult] = useState<FriendSearchResult | null>(
    null,
  );
  const [searching, setSearching] = useState(false);

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

  useEffect(() => {
    const q = search.replace('@', '').trim();
    if (q.length < 2) {
      setSearchResult(null);
      return;
    }
    const handle = setTimeout(() => {
      setSearching(true);
      api<FriendSearchResult>(`/friends/search?q=${encodeURIComponent(q)}`, {
        token,
      })
        .then(setSearchResult)
        .catch(() => setSearchResult(null))
        .finally(() => setSearching(false));
    }, 320);
    return () => clearTimeout(handle);
  }, [search, token]);

  const selectedUsername = useMemo(() => {
    const v = value.replace('@', '').trim().toLowerCase();
    return v || null;
  }, [value]);

  const searchOnlyCard: FriendCard | null = useMemo(() => {
    if (!searchResult?.username || !searchResult.canSendBan) return null;
    const u = searchResult.user;
    if (u) {
      return sanitizeFriendCard({
        id: u.id,
        userId: u.id,
        telegramId: u.telegramId,
        username: searchResult.username,
        firstName: u.firstName,
        photoUrl: u.photoUrl,
        auraLabel: u.auraLabel,
        streak: u.streak,
        energyPercent: u.energyPercent,
        presence: 'offline',
        lastSeenAt: null,
        interactionCount: 0,
        isRegistered: true,
        relation: 'friend',
        friendState: 'offline',
      });
    }
    return sanitizeFriendCard({
      id: `new:${searchResult.username}`,
      userId: null,
      username: searchResult.username,
      firstName: searchResult.username,
      photoUrl: null,
      auraLabel: 'Контакт',
      streak: 0,
      energyPercent: 0,
      presence: 'offline',
      lastSeenAt: null,
      interactionCount: 0,
      isRegistered: false,
      relation: 'pending',
      friendState: 'invited',
      recentChallenge: null,
    });
  }, [searchResult]);

  const people = useMemo(
    () => mergeFriendsWithOptimistic(coerceFriendList(friends), optimisticSendWait),
    [friends, optimisticSendWait],
  );

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
        {people.length === 0 ? (
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

      <div className="pt-1 border-t border-white/5">
        {!searchExpanded ? (
          <button
            type="button"
            onClick={() => setSearchExpanded(true)}
            className="w-full text-center text-xs text-muted/70 py-2.5 hover:text-accent transition-colors"
          >
            Найти кого ещё вызвать
          </button>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative pt-2"
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Найти кого ещё вызвать"
              autoFocus
              className="w-full glass-card rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent/40 border border-white/5"
            />
            {searching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted mt-1">
                …
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setSearchExpanded(false);
                setSearch('');
                setSearchResult(null);
              }}
              className="mt-2 w-full text-[10px] text-muted"
            >
              Скрыть
            </button>
          </motion.div>
        )}
        {searchExpanded &&
          searchOnlyCard &&
          search.length >= 2 &&
          !people.some(
            (f) =>
              (f.username ?? '').toLowerCase() ===
              (searchOnlyCard.username ?? '').toLowerCase(),
          ) && (
            <div className="mt-3 flex justify-center">
              <FriendAvatarCard
                friend={searchOnlyCard}
                selected={
                  selectedUsername === searchOnlyCard.username.toLowerCase()
                }
                onSelect={() => pick(searchOnlyCard.username)}
              />
            </div>
          )}
        {searchResult && !searchResult.canSendBan && search.length >= 2 && (
          <p className="text-[10px] text-warning text-center mt-1">это ты</p>
        )}
      </div>
    </div>
  );
}
