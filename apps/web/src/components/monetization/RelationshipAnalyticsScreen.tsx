'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AvatarImage } from '../AvatarImage';
import { WhatBackIcon } from '../instant-ban/WhatBackIcon';
import { ApiError } from '@/lib/api';
import {
  fetchRelationshipAction,
  fetchRelationshipDashboard,
} from '@/lib/relationship-analytics-api';
import {
  asPlainObject,
  readNumber,
  readString,
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
  if (Array.isArray(raw)) {
    return raw
      .map((item) => asPlainObject(item))
      .filter((item): item is Record<string, unknown> => item != null)
      .slice(0, 4);
  }
  const obj = asPlainObject(raw);
  if (!obj) return [];
  const nested = obj.items ?? obj.list ?? obj.patterns;
  if (!Array.isArray(nested)) return [];
  return nested
    .map((item) => asPlainObject(item))
    .filter((item): item is Record<string, unknown> => item != null)
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
    (readString(obj, 'title', 'text', 'label', 'summary') ? obj : null)
  );
}

function timelineCtaLabel(payload: RelationshipDashboardPayload): string {
  const rec = primaryRecommendation(payload);
  const fromRec = readString(
    rec,
    'actionLabel',
    'ctaLabel',
    'buttonLabel',
    'actionText',
  );
  if (fromRec) return fromRec;

  const ui = asPlainObject(payload.ui);
  const fromUi = readString(
    ui,
    'timelineLabel',
    'timelineCta',
    'actionLabel',
  );
  if (fromUi) return fromUi;

  const action = asPlainObject(payload.action);
  const fromAction = readString(action, 'label', 'title', 'cta');
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

  const hero = loadState.kind === 'success' ? asPlainObject(loadState.data.hero) : null;
  const orb = loadState.kind === 'success' ? asPlainObject(loadState.data.orb) : null;
  const heroTitle = readString(hero, 'title', 'headline', 'heading', 'label');
  const heroSummary = readString(
    hero,
    'summary',
    'description',
    'text',
    'subtitle',
    'lead',
  );
  const confidence = readNumber(hero, 'confidence', 'confidenceScore');
  const sampleSize = readNumber(hero, 'sampleSize', 'sample_size', 'n');
  const orbValue = readNumber(orb, 'value', 'score', 'balance');
  const orbState = readString(orb, 'state', 'label', 'status', 'caption');
  const orbCaption = readString(orb, 'caption', 'subtitle', 'description', 'text');

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
                    {confidence != null ? `уверенность ${Math.round(confidence * (confidence <= 1 ? 100 : 1))}%` : null}
                    {confidence != null && sampleSize != null ? ' · ' : null}
                    {sampleSize != null ? `выборка ${sampleSize}` : null}
                  </p>
                )}
              </section>
            )}

            {(orbValue != null || orbState) && (
              <section className="monetization-analytics-orb">
                {orbValue != null ? (
                  <p className="monetization-analytics-orb__value">{orbValue}</p>
                ) : null}
                {orbState ? (
                  <p className="monetization-analytics-orb__state">{orbState}</p>
                ) : null}
                {orbCaption ? (
                  <p className="monetization-analytics-orb__caption">
                    {orbCaption}
                  </p>
                ) : null}
              </section>
            )}

            {insightItems(loadState.data).length > 0 ? (
              <section className="monetization-analytics-block">
                <h3 className="monetization-analytics-block__title">insights</h3>
                <ul className="monetization-analytics-list">
                  {insightItems(loadState.data).map((item, index) => {
                    const title = readString(
                      item,
                      'title',
                      'label',
                      'headline',
                      'name',
                    );
                    const text = readString(
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

            {patternItems(loadState.data).length > 0 ? (
              <section className="monetization-analytics-block">
                <h3 className="monetization-analytics-block__title">patterns</h3>
                <ul className="monetization-analytics-list">
                  {patternItems(loadState.data).map((item, index) => {
                    const title =
                      readString(item, 'title', 'label', 'name', 'text') ??
                      readString(item, 'code');
                    const text = readString(
                      item,
                      'description',
                      'summary',
                      'body',
                    );
                    if (!title && !text) return null;
                    return (
                      <li
                        key={`pattern-${index}-${title ?? text}`}
                        className="monetization-analytics-card"
                      >
                        {title ? (
                          <p className="monetization-analytics-card__title">
                            {title}
                          </p>
                        ) : null}
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
              const title = readString(rec, 'title', 'label', 'headline');
              const text = readString(
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
                    recommendation
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
