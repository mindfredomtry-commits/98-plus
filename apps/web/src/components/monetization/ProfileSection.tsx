'use client';

import type { EntitlementDTO, UserPublic } from '@98plus/shared';
import { AvatarImage } from '../AvatarImage';
import { WhatBackIcon } from '../instant-ban/WhatBackIcon';
import { userAvatarSrc } from '@/lib/user-public-avatar';
import {
  resolveAvatarLetter,
  resolveUserDisplayName,
} from '@/lib/user-display-name';

type Props = {
  user: UserPublic | null;
  premiumActive: boolean;
  activePremium: EntitlementDTO | null;
  entitlementLoading: boolean;
  onBack: () => void;
  onOpenPremium: () => void;
};

function formatPremiumExpiry(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export function ProfileSection({
  user,
  premiumActive,
  activePremium,
  entitlementLoading,
  onBack,
  onOpenPremium,
}: Props) {
  const displayName = resolveUserDisplayName(user);
  const expiryLabel = formatPremiumExpiry(activePremium?.expiresAt ?? null);
  const accessLabel = premiumActive
    ? expiryLabel
      ? `98+ premium · активен до ${expiryLabel}`
      : '98+ premium'
    : 'бесплатный доступ';

  return (
    <div className="monetization-screen" role="dialog" aria-label="Профиль">
      <div className="monetization-screen__scroll">
        <header className="monetization-screen__header">
          <button
            type="button"
            className="monetization-back"
            onClick={onBack}
            aria-label="Назад"
          >
            <WhatBackIcon />
          </button>
          <h2 className="monetization-screen__nav-title">профиль</h2>
        </header>

        <div className="monetization-profile-head">
          <AvatarImage
            src={userAvatarSrc(user)}
            letter={resolveAvatarLetter(user)}
            sizeClass="w-24 h-24"
            textClass="text-3xl"
            ringClassName="ring-white/10"
            priority
          />
          <h1 className="monetization-profile-head__name">{displayName}</h1>
          <span
            className={`monetization-access${
              premiumActive ? ' monetization-access--premium' : ''
            }`}
          >
            {entitlementLoading ? '…' : accessLabel}
          </span>
        </div>

        <button
          type="button"
          className="monetization-premium-card"
          onClick={onOpenPremium}
          aria-label="98+ premium — узнать"
        >
          <span className="monetization-premium-card__glow" aria-hidden />
          <span className="monetization-premium-card__title">98+ premium</span>
          <span className="monetization-premium-card__lead">
            узнай, что происходит между вами
          </span>
          <span className="monetization-premium-card__desc">
            личная статистика влияния, ответов и ваших общих циклов
          </span>
          <span className="monetization-premium-card__cta">узнать</span>
        </button>
      </div>
    </div>
  );
}
