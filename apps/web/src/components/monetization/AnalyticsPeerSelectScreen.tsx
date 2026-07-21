'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EntitlementDTO, FriendCard, UserPublic } from '@98plus/shared';
import { AvatarImage } from '../AvatarImage';
import { WhatBackIcon } from '../instant-ban/WhatBackIcon';
import { friendAvatarUrl } from '@/lib/avatar-url';
import { fetchRelationshipOverview } from '@/lib/relationship-analytics-api';
import {
  selectCardDimensions,
  selectOrbRingDimensions,
} from '@/lib/relationship-dimensions';
import {
  readRelationshipScreenStatus,
  type AnalyticsPeer,
  type RelationshipOverviewPayload,
  type RelationshipOverviewRangeCode,
  type RelationshipScreenPayload,
} from '@/lib/relationship-analytics-types';
import {
  resolveUserDisplayName,
} from '@/lib/user-display-name';
import { userAvatarSrc } from '@/lib/user-public-avatar';
import { RelationshipMetricTile } from './RelationshipMetricTile';
import { RelationshipOrb } from './RelationshipOrb';
import './monetization.css';

type Props = {
  friends: FriendCard[];
  token: string | null | undefined;
  user: UserPublic | null;
  premiumActive: boolean;
  activePremium: EntitlementDTO | null;
  entitlementLoading: boolean;
  onOpenPremium: () => void;
  onSelect: (peer: AnalyticsPeer) => void;
  onBack: () => void;
};

const OVERVIEW_RANGE_OPTIONS: {
  id: RelationshipOverviewRangeCode;
  label: string;
}[] = [
  { id: '1D', label: '1Д' },
  { id: '1W', label: '1Н' },
  { id: '1M', label: '1М' },
  { id: '1Y', label: '1Г' },
  { id: 'ALL', label: 'ВСЁ' },
];

function localTodayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function friendDisplayName(friend: FriendCard): string {
  const first = friend.firstName?.trim();
  if (first) return first;
  const username = friend.username?.trim();
  if (username) return username.startsWith('@') ? username : `@${username}`;
  return 'друг';
}

function friendLetter(friend: FriendCard): string {
  const source =
    friend.firstName?.trim() || friend.username?.replace(/^@/, '').trim();
  return (source?.[0] ?? '?').toUpperCase();
}

type OverviewLoadState =
  | { kind: 'idle' }
  | { kind: 'loading'; range: RelationshipOverviewRangeCode }
  | {
      kind: 'success';
      range: RelationshipOverviewRangeCode;
      data: RelationshipOverviewPayload;
    }
  | {
      kind: 'error';
      range: RelationshipOverviewRangeCode;
      message: string;
    };

function readOverviewScreen(
  payload: RelationshipOverviewPayload | null | undefined,
): RelationshipScreenPayload | null {
  const overview =
    payload?.relationshipScreen ?? payload?.relationshipOverview;
  if (!overview) return null;
  return overview as RelationshipScreenPayload;
}

function getOverviewDimensions(
  payload: RelationshipOverviewPayload | null | undefined,
) {
  return (
    payload?.relationshipScreen?.relationshipOrb?.dimensions ??
    payload?.relationshipOverview?.relationshipOrb?.dimensions ??
    payload?.overviewAnalytics?.relationshipOrb?.dimensions ??
    []
  );
}

function formatPremiumExpiryShort(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return null;
  }
}

/** Friends with a real registered userId — only these can be analytics peers. */
export function analyticsEligibleFriends(
  friends: FriendCard[],
): FriendCard[] {
  return friends.filter((f) => {
    const id = f.userId?.trim();
    return Boolean(id);
  });
}

export function AnalyticsPeerSelectScreen({
  friends,
  token,
  user,
  premiumActive,
  activePremium,
  entitlementLoading,
  onOpenPremium,
  onSelect,
  onBack,
}: Props) {
  const [selectedRange, setSelectedRange] =
    useState<RelationshipOverviewRangeCode>('ALL');
  const [overviewState, setOverviewState] = useState<OverviewLoadState>({
    kind: 'idle',
  });

  const viewerAvatar = userAvatarSrc(user);
  const viewerName = resolveUserDisplayName(user);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    const range = selectedRange;

    setOverviewState({ kind: 'loading', range });

    fetchRelationshipOverview({
      token,
      range,
      anchorDate: range === '1D' ? localTodayIsoDate() : undefined,
    })
      .then((data) => {
        if (cancelled) return;
        setOverviewState({ kind: 'success', range, data });
      })
      .catch(() => {
        if (cancelled) return;
        setOverviewState({
          kind: 'error',
          range,
          message: 'не удалось загрузить сводку',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRange, token]);

  const overviewPayload =
    overviewState.kind === 'success' && overviewState.range === selectedRange
      ? overviewState.data
      : null;

  const overviewScreen = readOverviewScreen(overviewPayload);
  const overviewStatus = readRelationshipScreenStatus(overviewScreen);
  const isOverviewLoading =
    overviewState.kind === 'loading' &&
    overviewState.range === selectedRange;
  const isOverviewNoActivity = overviewStatus === 'NO_ACTIVITY';
  const overviewErrorMessage =
    overviewState.kind === 'error' && overviewState.range === selectedRange
      ? overviewState.message
      : null;

  const allDimensions = useMemo(() => {
    if (isOverviewLoading || isOverviewNoActivity || !overviewPayload) {
      return [];
    }
    return getOverviewDimensions(overviewPayload);
  }, [isOverviewLoading, isOverviewNoActivity, overviewPayload]);

  const orbDimensions = useMemo(
    () => selectOrbRingDimensions(allDimensions),
    [allDimensions],
  );

  const cardDimensions = useMemo(
    () => selectCardDimensions(allDimensions),
    [allDimensions],
  );

  const handleSelectRange = useCallback(
    (range: RelationshipOverviewRangeCode) => {
      setSelectedRange(range);
    },
    [],
  );

  const eligible = analyticsEligibleFriends(friends);
  const premiumExpiryLabel = formatPremiumExpiryShort(
    activePremium?.expiresAt ?? null,
  );
  const premiumBadgeLabel = premiumExpiryLabel
    ? `premium 98+ до ${premiumExpiryLabel}`
    : 'premium 98+';

  return (
    <div
      className="monetization-screen"
      role="dialog"
      aria-label="С кем посмотреть аналитику"
    >
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
          <h2 className="monetization-screen__nav-title">с кем посмотреть?</h2>
        </header>

        <div className="monetization-peer-premium-cta monetization-peer-premium-cta--top">
          {premiumActive ? (
            <div
              className="monetization-overview-premium-status monetization-overview-premium-status--badge"
              aria-label={premiumBadgeLabel}
            >
              {entitlementLoading ? '…' : premiumBadgeLabel}
            </div>
          ) : (
            <button
              type="button"
              className="monetization-overview-premium-status monetization-overview-premium-status--learn"
              onClick={onOpenPremium}
              aria-label="98+ premium — узнать"
            >
              узнать
            </button>
          )}
        </div>

        <section
          className="monetization-relationship-overview"
          aria-label="Твои отношения с людьми"
        >
          <h3 className="monetization-relationship-overview__title">
            твои отношения с людьми
          </h3>

          <div
            className="monetization-relationship__range-selector"
            role="group"
            aria-label="Период"
          >
            {OVERVIEW_RANGE_OPTIONS.map((option) => {
              const active = selectedRange === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`monetization-range-chip${
                    active ? ' monetization-range-chip--active' : ''
                  }`}
                  aria-pressed={active}
                  onClick={() => handleSelectRange(option.id)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {isOverviewLoading ? (
            <p className="monetization-muted monetization-muted--tight">
              загружаем…
            </p>
          ) : null}

          {overviewErrorMessage ? (
            <p className="monetization-analytics-inline-error">
              {overviewErrorMessage}
            </p>
          ) : null}

          <RelationshipOrb
            compact
            dimensions={isOverviewLoading ? [] : orbDimensions}
            peerAvatarUrl={viewerAvatar}
            peerDisplayName={viewerName}
          />

          {!isOverviewLoading && isOverviewNoActivity ? (
            <p className="monetization-muted monetization-muted--tight">
              За выбранный период ещё нет действий
            </p>
          ) : null}

          {!isOverviewLoading &&
          !isOverviewNoActivity &&
          cardDimensions.length > 0 ? (
            <div
              className="monetization-relationship__tiles"
              data-relationship-tiles="overview"
            >
              {cardDimensions.map((dimension) => (
                <RelationshipMetricTile
                  key={dimension.code}
                  dimension={dimension}
                />
              ))}
            </div>
          ) : null}

          <p className="monetization-peer-lead monetization-peer-lead--after-tiles">
            выбери человека, чтобы узнать, что происходит между вами
          </p>
        </section>

        {eligible.length === 0 ? (
          <div className="monetization-analytics-empty">
            <p className="monetization-analytics-empty__title">
              пока не с кем строить аналитику
            </p>
            <p className="monetization-analytics-empty__text">
              добавь человека и совершите несколько действий в 98+
            </p>
            <button
              type="button"
              className="monetization-cta"
              onClick={onBack}
            >
              назад
            </button>
          </div>
        ) : (
          <ul className="monetization-peer-list">
            {eligible.map((friend) => {
              const userId = friend.userId!.trim();
              const displayName = friendDisplayName(friend);
              return (
                <li key={userId}>
                  <button
                    type="button"
                    className="monetization-peer-row"
                    onClick={() =>
                      onSelect({
                        userId,
                        displayName,
                        avatarUrl: friendAvatarUrl(friend),
                      })
                    }
                  >
                    <AvatarImage
                      src={friendAvatarUrl(friend)}
                      letter={friendLetter(friend)}
                      sizeClass="w-12 h-12"
                      textClass="text-lg"
                      ringClassName="ring-white/10"
                    />
                    <span className="monetization-peer-row__name">
                      {displayName}
                    </span>
                    <span className="monetization-peer-row__chevron" aria-hidden>
                      ›
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
