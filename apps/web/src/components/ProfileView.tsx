'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { UserPublic } from '@98plus/shared';
import { api } from '@/lib/api';
import { EnergyBar } from './EnergyBar';
import { BigButton } from './BigButton';
import { useApp } from './Providers';
import { AvatarImage } from './AvatarImage';
import { preloadAvatarUrls } from '@/lib/avatar-url';
import { logAvatarStartup } from '@/lib/avatar-startup-diag';
import { enrichUserPublic, userAvatarSrc } from '@/lib/user-public-avatar';

interface ProfileData {
  user: UserPublic;
  publicSelfBans: { id: string; text: string }[];
  recentBans: { id: string; text: string }[];
  strongestInteractions: { id: string; text: string }[];
}

export function ProfileView({ userId }: { userId?: string }) {
  const { token, user: me } = useApp();
  const [data, setData] = useState<ProfileData | null>(null);
  const [selfText, setSelfText] = useState('');
  const [selfPublic, setSelfPublic] = useState(false);

  const id = userId ?? me?.id;
  const sessionProfile = useMemo(
    () => (me && id === me.id ? enrichUserPublic(me) : null),
    [me, id],
  );

  useEffect(() => {
    const src = userAvatarSrc(sessionProfile);
    if (src) preloadAvatarUrls([src]);
  }, [sessionProfile]);

  useEffect(() => {
    if (!token || !id) return;
    api<ProfileData>(`/users/profile/${id}`, { token }).then((d) =>
      setData({ ...d, user: enrichUserPublic(d.user) }),
    );
  }, [token, id]);

  const displayUser = data?.user ?? sessionProfile;
  const profileRenderLoggedRef = useRef(false);
  useEffect(() => {
    if (!displayUser || profileRenderLoggedRef.current) return;
    profileRenderLoggedRef.current = true;
    logAvatarStartup('[profile-render]', {
      userId: displayUser.id,
      via: data ? 'api' : 'session',
      hasAvatar: !!userAvatarSrc(displayUser),
    });
  }, [displayUser, data]);

  async function createSelfBan() {
    if (!token || !selfText.trim()) return;
    await api('/users/self-bans', {
      method: 'POST',
      token,
      body: JSON.stringify({ text: selfText, isPublic: selfPublic }),
    });
    setSelfText('');
    const refreshed = await api<ProfileData>(`/users/profile/${id}`, { token });
    setData({ ...refreshed, user: enrichUserPublic(refreshed.user) });
  }

  if (!displayUser) {
    return <div className="text-muted text-center py-12">...</div>;
  }

  const isMe = me?.id === displayUser.id;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-4">
        <AvatarImage
          src={userAvatarSrc(displayUser)}
          letter={(displayUser.firstName[0] ?? '?').toUpperCase()}
          sizeClass="w-16 h-16"
          textClass="text-2xl"
          priority
        />
        <div>
          <h1 className="text-xl font-bold">{displayUser.firstName}</h1>
          {displayUser.username && (
            <p className="text-muted text-sm">@{displayUser.username}</p>
          )}
          <p className="text-accent text-sm">🔥 {displayUser.streak} streak</p>
        </div>
      </div>

      <EnergyBar user={displayUser} />

      {data && data.publicSelfBans.length > 0 && (
        <section>
          <h3 className="text-sm text-muted mb-2">Self-bans</h3>
          {data.publicSelfBans.map((s) => (
            <p key={s.id} className="bg-card rounded-xl px-3 py-2 mb-2 text-sm">
              🚫 {s.text}
            </p>
          ))}
        </section>
      )}

      {data && data.strongestInteractions.length > 0 && (
        <section>
          <h3 className="text-sm text-muted mb-2">Сильные interaction</h3>
          {data.strongestInteractions.map((b) => (
            <p key={b.id} className="text-sm mb-1 truncate">
              ⚡ {b.text}
            </p>
          ))}
        </section>
      )}

      {isMe && (
        <section className="space-y-3">
          <h3 className="text-sm text-muted">Новый self-ban</h3>
          <input
            value={selfText}
            onChange={(e) => setSelfText(e.target.value)}
            placeholder="Запрещаю себе..."
            className="w-full bg-card rounded-2xl px-4 py-3 outline-none"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selfPublic}
              onChange={(e) => setSelfPublic(e.target.checked)}
            />
            Публичный
          </label>
          <BigButton onClick={createSelfBan}>Создать</BigButton>
        </section>
      )}
    </motion.div>
  );
}
