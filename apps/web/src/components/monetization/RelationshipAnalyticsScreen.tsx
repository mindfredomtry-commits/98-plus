'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AvatarImage } from '../AvatarImage';
import { WhatBackIcon } from '../instant-ban/WhatBackIcon';
import { ApiError } from '@/lib/api';
import {
  fetchRelationshipAction,
  fetchRelationshipDashboard,
} from '@/lib/relationship-analytics-api';
import {
  asPlainObject,
  formatOrbDisplayValue,
  readNumber,
  readUiText,
  type AnalyticsPeer,
  type RelationshipDashboardPayload,
  type RelationshipTimelinePayload,
} from '@/lib/relationship-analytics-types';

type Props = {
  token: string | null | undefined;
  peer: AnalyticsPeer;
  onBack: () => void;
  onPremiumRequired: () => void;
  onOpenTimeline: (payload: RelationshipTimelinePayload) => void;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'success'; data: RelationshipDashboardPayload }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string };

function peerLetter(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

function insightItems(payload: RelationshipDashboardPayload): Record<string, unknown>[] {
  if (!Array.isArray(payload.insights)) return [];
  return payload.insights
    .map((item) => asPlainObject(item))
    .filter((item): item is Record<string, unknown> => item != null)
    .slice(0, 4);
}

function patternItems(
  payload: RelationshipDashboardPayload,
): Record<string, unknown>[] {
  const raw = payload.patterns;
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else {
    const obj = asPlainObject(raw);
    const nested = obj?.items ?? obj?.list ?? obj?.patterns;
    if (Array.isArray(nested)) list = nested;
  }

  return list
    .map((item) => asPlainObject(item))
    .filter((item): item is Record<string, unknown> => item != null)
    .filter((item) => {
      const title = readUiText(
        item,
        'title',
        'label',
        'headline',
        'name',
        'text',
        'summary',
        'description',
        'body',
      );
      return Boolean(title);
    })
    .slice(0, 4);
}

function primaryRecommendation(
  payload: RelationshipDashboardPayload,
): Record<string, unknown> | null {
  const raw = payload.recommendations;
  if (Array.isArray(raw)) {
    return asPlainObject(raw[0]);
  }
  const obj = asPlainObject(raw);
  if (!obj) return null;
  return (
    asPlainObject(obj.primary) ??
    asPlainObject(obj.main) ??
    asPlainObject(obj.top) ??
    asPlainObject(obj.recommendation) ??
    (readUiText(obj, 'title', 'text', 'label', 'summary') ? obj : null)
  );
}

function timelineCtaLabel(payload: RelationshipDashboardPayload): string {
  const rec = primaryRecommendation(payload);
  const fromRec = readUiText(
    rec,
    'actionLabel',
    'ctaLabel',
    'buttonLabel',
    'actionText',
  );
  if (fromRec) return fromRec;

  const ui = asPlainObject(payload.ui);
  const fromUi = readUiText(
    ui,
    'timelineLabel',
    'timelineCta',
    'actionLabel',
  );
  if (fromUi) return fromUi;

  const action = asPlainObject(payload.action);
  const fromAction = readUiText(action, 'label', 'title', 'cta');
  if (fromAction) return fromAction;

  return 'последние 14 дней';
}

export function RelationshipAnalyticsScreen({
  token,
  peer,
  onBack,
  onPremiumRequired,
  onOpenTimeline,
}: Props) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [retryTick, setRetryTick] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionLockRef = useRef(false);
  const requestIdRef = useRef(0);
  const onPremiumRequiredRef = useRef(onPremiumRequired);
  onPremiumRequiredRef.current = onPremiumRequired;

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let cancelled = false;
    setLoadState({ kind: 'loading' });
    setActionError(null);

    void (async () => {
      try {
        const data = await fetchRelationshipDashboard({
          token,
          otherUserId: peer.userId,
        });
        if (cancelled || requestId !== requestIdRef.current) return;
        setLoadState({ kind: 'success', data });
      } catch (err) {
        if (cancelled || requestId !== requestIdRef.current) return;
        if (err instanceof ApiError && err.status === 403) {
          onPremiumRequiredRef.current();
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setLoadState({ kind: 'notFound' });
          return;
        }
        void err;
        setLoadState({
          kind: 'error',
          message: 'не удалось загрузить аналитику',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, peer.userId, retryTick]);

  const handleRetry = useCallback(() => {
    setRetryTick((n) => n + 1);
  }, []);

  const handleOpenTimeline = useCallback(async () => {
    if (actionLockRef.current || actionLoading) return;
    actionLockRef.current = true;
    setActionLoading(true);
    setActionError(null);
    try {
      const payload = await fetchRelationshipAction({
        token,
        otherUserId: peer.userId,
        actionCode: 'OPEN_TIMELINE_RECENT_14_DAYS',
      });
      onOpenTimeline(payload);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        onPremiumRequired();
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        setActionError('за этот период пока нет данных');
        return;
      }
      setActionError('не удалось открыть период');
    } finally {
      actionLockRef.current = false;
      setActionLoading(false);
    }
  }, [actionLoading, onOpenTimeline, onPremiumRequired, peer.userId, token]);

  const successData =
    loadState.kind === 'success' ? loadState.data : null;
  const ui = successData ? asPlainObject(successData.ui) : null;
  const hero = successData ? asPlainObject(successData.hero) : null;
  const orb = successData ? asPlainObject(successData.orb) : null;

  const heroTitle = readUiText(hero, 'title', 'headline', 'heading', 'label');
  const heroSummary = readUiText(
    hero,
    'summary',
    'description',
    'text',
    'subtitle',
    'lead',
  );
  const confidence = readNumber(hero, 'confidence', 'confidenceScore');
  const sampleSize = readNumber(hero, 'sampleSize', 'sample_size', 'n');

  const orbTitle = readUiText(
    orb,
    'title',
    'label',
    'headline',
    'summary',
    'description',
    'caption',
    'text',
  );
  const orbCaption = readUiText(
    orb,
    'caption',
    'subtitle',
    'description',
    'text',
  );
  const orbDisplayValue = formatOrbDisplayValue(orb);

  const insights = useMemo(
    () => (successData ? insightItems(successData) : []),
    [successData],
  );
  const patterns = useMemo(
    () => (successData ? patternItems(successData) : []),
    [successData],
  );

  const insightsSectionTitle =
    readUiText(ui, 'insightsTitle') ?? 'Основные выводы';
  const patternsSectionTitle =
    readUiText(ui, 'patternsTitle') ?? 'Особенности ваших отношений';
  const recommendationSectionTitle =
    readUiText(ui, 'recommendationTitle') ?? 'Рекомендуем';

  return (
    <div
      className="monetization-screen"
      role="dialog"
      aria-label="Аналитика между вами"
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
          <h2 className="monetization-screen__nav-title">между вами</h2>
        </header>

        <div className="monetization-analytics-peer">
          <AvatarImage
            src={peer.avatarUrl}
            letter={peerLetter(peer.displayName)}
            sizeClass="w-14 h-14"
            textClass="text-xl"
            ringClassName="ring-white/10"
            priority
          />
          <div className="monetization-analytics-peer__meta">
            <p className="monetization-analytics-peer__name">{peer.displayName}</p>
            <p className="monetization-analytics-peer__sub">личная динамика</p>
          </div>
        </div>

        {loadState.kind === 'loading' ? (
          <p className="monetization-muted">собираем картину…</p>
        ) : null}

        {loadState.kind === 'notFound' ? (
          <div className="monetization-analytics-empty">
            <p className="monetization-analytics-empty__title">
              пока недостаточно данных
            </p>
            <p className="monetization-analytics-empty__text">
              совершите больше действий друг с другом, и здесь появится аналитика
            </p>
            <button type="button" className="monetization-cta" onClick={onBack}>
              назад
            </button>
          </div>
        ) : null}

        {loadState.kind === 'error' ? (
          <div className="monetization-analytics-empty">
            <p className="monetization-analytics-empty__title">
              {loadState.message}
            </p>
            <div className="monetization-analytics-actions">
              <button
                type="button"
                className="monetization-cta"
                onClick={handleRetry}
              >
                повторить
              </button>
              <button
                type="button"
                className="monetization-cta monetization-cta--ghost"
                onClick={onBack}
              >
                назад
              </button>
            </div>
          </div>
        ) : null}

        {loadState.kind === 'success' ? (
          <>
            {(heroTitle || heroSummary) && (
              <section className="monetization-analytics-hero">
                {heroTitle ? (
                  <h1 className="monetization-analytics-hero__title">
                    {heroTitle}
                  </h1>
                ) : null}
                {heroSummary ? (
                  <p className="monetization-analytics-hero__summary">
                    {heroSummary}
                  </p>
                ) : null}
                {(confidence != null || sampleSize != null) && (
                  <p className="monetization-analytics-hero__meta">
                    {confidence != null
                      ? `уверенность ${Math.round(confidence * (confidence <= 1 ? 100 : 1))}%`
                      : null}
                    {confidence != null && sampleSize != null ? ' · ' : null}
                    {sampleSize != null ? `выборка ${sampleSize}` : null}
                  </p>
                )}
              </section>
            )}

            {(orbDisplayValue || orbTitle) && (
              <section className="monetization-analytics-orb">
                {orbDisplayValue ? (
                  <p className="monetization-analytics-orb__value">
                    {orbDisplayValue}
                  </p>
                ) : null}
                {orbTitle ? (
                  <p className="monetization-analytics-orb__state">{orbTitle}</p>
                ) : null}
                {orbCaption && orbCaption !== orbTitle ? (
                  <p className="monetization-analytics-orb__caption">
                    {orbCaption}
                  </p>
                ) : null}
              </section>
            )}

            {insights.length > 0 ? (
              <section className="monetization-analytics-block">
                <h3 className="monetization-analytics-block__title">
                  {insightsSectionTitle}
                </h3>
                <ul className="monetization-analytics-list">
                  {insights.map((item, index) => {
                    const title = readUiText(
                      item,
                      'title',
                      'label',
                      'headline',
                      'name',
                    );
                    const text = readUiText(
                      item,
                      'text',
                      'description',
                      'summary',
                      'body',
                    );
                    if (!title && !text) return null;
                    return (
                      <li
                        key={`insight-${index}-${title ?? text}`}
                        className="monetization-analytics-card"
                      >
                        {title ? (
                          <p className="monetization-analytics-card__title">
                            {title}
                          </p>
                        ) : null}
                        {text ? (
                          <p className="monetization-analytics-card__text">
                            {text}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {patterns.length > 0 ? (
              <section className="monetization-analytics-block">
                <h3 className="monetization-analytics-block__title">
                  {patternsSectionTitle}
                </h3>
                <ul className="monetization-analytics-list">
                  {patterns.map((item, index) => {
                    const title = readUiText(
                      item,
                      'title',
                      'label',
                      'headline',
                      'name',
                      'text',
                      'summary',
                      'description',
                      'body',
                    );
                    const text = readUiText(
                      item,
                      'description',
                      'summary',
                      'body',
                      'text',
                    );
                    if (!title) return null;
                    return (
                      <li
                        key={`pattern-${index}-${title}`}
                        className="monetization-analytics-card"
                      >
                        <p className="monetization-analytics-card__title">
                          {title}
                        </p>
                        {text && text !== title ? (
                          <p className="monetization-analytics-card__text">
                            {text}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {(() => {
              const rec = primaryRecommendation(loadState.data);
              if (!rec) return null;
              const title = readUiText(rec, 'title', 'label', 'headline');
              const text = readUiText(
                rec,
                'text',
                'description',
                'summary',
                'body',
              );
              if (!title && !text) return null;
              return (
                <section className="monetization-analytics-block">
                  <h3 className="monetization-analytics-block__title">
                    {recommendationSectionTitle}
                  </h3>
                  <div className="monetization-analytics-card monetization-analytics-card--accent">
                    {title ? (
                      <p className="monetization-analytics-card__title">
                        {title}
                      </p>
                    ) : null}
                    {text ? (
                      <p className="monetization-analytics-card__text">{text}</p>
                    ) : null}
                  </div>
                </section>
              );
            })()}

            <div className="monetization-analytics-cta-wrap">
              <button
                type="button"
                className="monetization-cta"
                disabled={actionLoading}
                onClick={() => void handleOpenTimeline()}
              >
                {actionLoading
                  ? 'загружаем…'
                  : timelineCtaLabel(loadState.data)}
              </button>
              {actionError ? (
                <p className="monetization-analytics-inline-error">
                  {actionError}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
