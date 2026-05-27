'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { UserPublic } from '@98plus/shared';
import { api } from '@/lib/api';
import { EnergyBar } from './EnergyBar';
import { BigButton } from './BigButton';
import { useApp } from './AppContext';
import { AvatarImage } from './AvatarImage';
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

  useEffect(() => {
    if (!token || !id) return;
    api<ProfileData>(`/users/profile/${id}`, { token }).then((d) =>
      setData({ ...d, user: enrichUserPublic(d.user) }),
    );
  }, [token, id]);

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

  if (!data) {
    return <div className="text-muted text-center py-12">...</div>;
  }

  const isMe = me?.id === data.user.id;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-4">
        <AvatarImage
          src={userAvatarSrc(enrichUserPublic(data.user))}
          letter={(data.user.firstName[0] ?? '?').toUpperCase()}
          sizeClass="w-16 h-16"
          textClass="text-2xl"
        />
        <div>
          <h1 className="text-xl font-bold">{data.user.firstName}</h1>
          {data.user.username && (
            <p className="text-muted text-sm">@{data.user.username}</p>
          )}
          <p className="text-accent text-sm">🔥 {data.user.streak} streak</p>
        </div>
      </div>

      <EnergyBar user={data.user} />

      {data.publicSelfBans.length > 0 && (
        <section>
          <h3 className="text-sm text-muted mb-2">Self-bans</h3>
          {data.publicSelfBans.map((s) => (
            <p key={s.id} className="bg-card rounded-xl px-3 py-2 mb-2 text-sm">
              🚫 {s.text}
            </p>
          ))}
        </section>
      )}

      {data.strongestInteractions.length > 0 && (
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
