'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WhatBackIcon } from '../instant-ban/WhatBackIcon';
import { ApiError } from '@/lib/api';
import {
  fetchRelationshipAction,
  fetchRelationshipDashboard,
} from '@/lib/relationship-analytics-api';
import {
  asPlainObject,
  coerceOrbDimension,
  formatOrbDisplayValue,
  isRelationshipScreenPayload,
  readNumber,
  readUiText,
  ringSortIndex,
  type AnalyticsPeer,
  type RelationshipDashboardPayload,
  type RelationshipOrbDimension,
  type RelationshipScreenPayload,
  type RelationshipTimelinePayload,
} from '@/lib/relationship-analytics-types';
import { RelationshipOrb } from './RelationshipOrb';
import { RelationshipDirectionRow } from './RelationshipDirectionRow';
import '../lobby-screen.css';

type Props = {
  token: string | null | undefined;
  peer: AnalyticsPeer;
  viewerLabel?: string;
  onBack: () => void;
  onPremiumRequired: () => void;
  onOpenTimeline: (payload: RelationshipTimelinePayload) => void;
  onStartBan?: (peer: AnalyticsPeer) => boolean;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'success'; data: RelationshipDashboardPayload }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string };

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
  const fromUi = readUiText(ui, 'timelineLabel', 'timelineCta', 'actionLabel');
  if (fromUi) return fromUi;

  const action = asPlainObject(payload.action);
  const fromAction = readUiText(action, 'label', 'title', 'cta');
  if (fromAction) return fromAction;

  return 'последние 14 дней';
}

function visibleDimensions(
  screen: RelationshipScreenPayload,
): RelationshipOrbDimension[] {
  const raw = screen.relationshipOrb?.dimensions;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => coerceOrbDimension(d))
    .filter((d): d is RelationshipOrbDimension => d != null)
    .filter((d) => d.available !== false && d.direction !== 'NOT_AVAILABLE')
    .sort((a, b) => ringSortIndex(a.ring) - ringSortIndex(b.ring));
}

export function RelationshipAnalyticsScreen({
  token,
  peer,
  viewerLabel = 'ты',
  onBack,
  onPremiumRequired,
  onOpenTimeline,
  onStartBan,
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

  const relationshipScreen =
    loadState.kind === 'success' &&
    isRelationshipScreenPayload(loadState.data.relationshipScreen)
      ? loadState.data.relationshipScreen
      : null;

  const dims = useMemo(
    () => (relationshipScreen ? visibleDimensions(relationshipScreen) : []),
    [relationshipScreen],
  );

  const screenTitle =
    relationshipScreen?.title?.trim() || 'ваши отношения';
  const peerName =
    relationshipScreen?.peer?.displayName?.trim() || peer.displayName;
  const peerAvatar =
    relationshipScreen?.peer?.avatarUrl ?? peer.avatarUrl ?? null;
  const summary = relationshipScreen?.summary?.trim() || null;

  const rec = relationshipScreen?.recommendation ?? null;
  const recTitle = rec?.title?.trim() || null;
  const recSummary =
    rec?.summary?.trim() ||
    (typeof rec?.description === 'string' ? rec.description.trim() : null);
  const recActionCode = rec?.action?.code;
  const recActionLabel = rec?.action?.label?.trim() || null;

  const primary = relationshipScreen?.primaryAction ?? null;
  const primaryCode = primary?.code;
  const canStartBan =
    primaryCode === 'START_BAN' && typeof onStartBan === 'function';

  const weeklyDynamics = relationshipScreen?.weeklyDynamics;

  return (
    <div
      className="monetization-screen"
      role="dialog"
      aria-label={screenTitle}
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
          <h2 className="monetization-screen__nav-title">{screenTitle}</h2>
        </header>

        <div className="monetization-analytics-peer monetization-analytics-peer--orb-heading">
          <div className="monetization-analytics-peer__meta">
            <p className="monetization-analytics-peer__name">{peerName}</p>
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

        {loadState.kind === 'success' && relationshipScreen ? (
          <div className="monetization-relationship">
            {Array.isArray(weeklyDynamics) && weeklyDynamics.length > 0 ? (
              <div className="monetization-relationship__weekly" />
            ) : null}

            <RelationshipOrb
              dimensions={dims}
              peerAvatarUrl={peerAvatar}
              peerDisplayName={peerName}
            />

            {summary ? (
              <p className="monetization-relationship__summary">{summary}</p>
            ) : null}

            <div className="monetization-relationship__dims">
              {dims.map((dim, index) => (
                <RelationshipDirectionRow
                  key={`${dim.ring ?? dim.code ?? 'dim'}-${index}`}
                  dimension={dim}
                  viewerLabel={viewerLabel}
                  peerLabel={peerName}
                />
              ))}
            </div>

            {(recTitle || recSummary || recActionLabel) && (
              <section className="monetization-relationship__rec">
                {recTitle ? (
                  <h3 className="monetization-relationship__rec-title">
                    {recTitle}
                  </h3>
                ) : null}
                {recSummary ? (
                  <p className="monetization-relationship__rec-text">
                    {recSummary}
                  </p>
                ) : null}
                {recActionCode === 'OPEN_TIMELINE_RECENT_14_DAYS' ||
                recActionLabel ? (
                  <button
                    type="button"
                    className="monetization-cta monetization-cta--ghost"
                    disabled={actionLoading}
                    onClick={() => {
                      if (
                        recActionCode === 'OPEN_TIMELINE_RECENT_14_DAYS' ||
                        !recActionCode
                      ) {
                        void handleOpenTimeline();
                      }
                    }}
                  >
                    {actionLoading
                      ? 'загружаем…'
                      : recActionLabel || 'последние 14 дней'}
                  </button>
                ) : null}
              </section>
            )}

            {actionError ? (
              <p className="monetization-analytics-inline-error">{actionError}</p>
            ) : null}

            {primaryCode === 'START_BAN' ? (
              <div className="monetization-relationship__primary">
                <button
                  type="button"
                  className="btn-98-primary lobby-screen__cta"
                  disabled={!canStartBan}
                  onClick={() => {
                    if (!canStartBan) return;
                    setActionError(null);
                    const ok = onStartBan(peer);
                    if (ok === false) {
                      setActionError(
                        'Не удалось открыть отправку. Обнови список пользователей и попробуй снова.',
                      );
                    }
                  }}
                >
                  🚫 ЗАПРЕЩАТЬ
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {loadState.kind === 'success' && !relationshipScreen ? (
          <LegacyDashboardView
            data={loadState.data}
            actionLoading={actionLoading}
            actionError={actionError}
            onOpenTimeline={() => void handleOpenTimeline()}
          />
        ) : null}
      </div>
    </div>
  );
}

function LegacyDashboardView({
  data,
  actionLoading,
  actionError,
  onOpenTimeline,
}: {
  data: RelationshipDashboardPayload;
  actionLoading: boolean;
  actionError: string | null;
  onOpenTimeline: () => void;
}) {
  const ui = asPlainObject(data.ui);
  const hero = asPlainObject(data.hero);
  const orb = asPlainObject(data.orb);

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
  const orbCaption = readUiText(orb, 'caption', 'subtitle', 'description', 'text');
  const orbDisplayValue = formatOrbDisplayValue(orb);

  const insights = insightItems(data);
  const patterns = patternItems(data);

  const insightsSectionTitle =
    readUiText(ui, 'insightsTitle') ?? 'Основные выводы';
  const patternsSectionTitle =
    readUiText(ui, 'patternsTitle') ?? 'Особенности ваших отношений';
  const recommendationSectionTitle =
    readUiText(ui, 'recommendationTitle') ?? 'Рекомендуем';

  return (
    <>
      {(heroTitle || heroSummary) && (
        <section className="monetization-analytics-hero">
          {heroTitle ? (
            <h1 className="monetization-analytics-hero__title">{heroTitle}</h1>
          ) : null}
          {heroSummary ? (
            <p className="monetization-analytics-hero__summary">{heroSummary}</p>
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
            <p className="monetization-analytics-orb__value">{orbDisplayValue}</p>
          ) : null}
          {orbTitle ? (
            <p className="monetization-analytics-orb__state">{orbTitle}</p>
          ) : null}
          {orbCaption && orbCaption !== orbTitle ? (
            <p className="monetization-analytics-orb__caption">{orbCaption}</p>
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
              const title = readUiText(item, 'title', 'label', 'headline', 'name');
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
                    <p className="monetization-analytics-card__title">{title}</p>
                  ) : null}
                  {text ? (
                    <p className="monetization-analytics-card__text">{text}</p>
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
                  <p className="monetization-analytics-card__title">{title}</p>
                  {text && text !== title ? (
                    <p className="monetization-analytics-card__text">{text}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {(() => {
        const rec = primaryRecommendation(data);
        if (!rec) return null;
        const title = readUiText(rec, 'title', 'label', 'headline');
        const text = readUiText(rec, 'text', 'description', 'summary', 'body');
        if (!title && !text) return null;
        return (
          <section className="monetization-analytics-block">
            <h3 className="monetization-analytics-block__title">
              {recommendationSectionTitle}
            </h3>
            <div className="monetization-analytics-card monetization-analytics-card--accent">
              {title ? (
                <p className="monetization-analytics-card__title">{title}</p>
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
          onClick={onOpenTimeline}
        >
          {actionLoading ? 'загружаем…' : timelineCtaLabel(data)}
        </button>
        {actionError ? (
          <p className="monetization-analytics-inline-error">{actionError}</p>
        ) : null}
      </div>
    </>
  );
}
