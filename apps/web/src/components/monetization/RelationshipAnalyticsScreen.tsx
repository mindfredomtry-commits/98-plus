'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WhatBackIcon } from '../instant-ban/WhatBackIcon';
import { ApiError } from '@/lib/api';
import {
  fetchRelationshipAction,
  fetchRelationshipDashboard,
  fetchRelationshipDay,
} from '@/lib/relationship-analytics-api';
import {
  buildV8ReceivedLog,
  buildV8RenderedLog,
  extractRelationshipDimensions,
  selectCardDimensions,
  selectOrbRingDimensions,
} from '@/lib/relationship-dimensions';
import {
  asPlainObject,
  formatOrbDisplayValue,
  isRelationshipScreenPayload,
  parseWeeklyDynamicsOptions,
  readNumber,
  readRelationshipScreenStatus,
  readUiText,
  type AnalyticsPeer,
  type RelationshipDashboardPayload,
  type RelationshipDayPayload,
  type RelationshipDimension,
  type RelationshipScreenPayload,
  type RelationshipTimelinePayload,
} from '@/lib/relationship-analytics-types';
import { RelationshipOrb } from './RelationshipOrb';
import '../lobby-screen.css';
import './monetization.css';

type Props = {
  token: string | null | undefined;
  peer: AnalyticsPeer;
  viewerUserId?: string | null;
  viewerLabel?: string;
  premiumActive?: boolean | null;
  onBack: () => void;
  onPremiumRequired: () => void;
  onOpenTimeline: (payload: RelationshipTimelinePayload) => void;
  onStartBan?: (peer: AnalyticsPeer) => boolean;
};

const METRIC_TITLE_BY_CODE: Record<string, string> = {
  INITIATIVE: 'Инициатива',
  RESPONSIVENESS: 'Ответность',
  RESPECT: 'Уважение',
};

function getMetricTitle(code?: string): string {
  if (!code) return 'Метрика';
  return METRIC_TITLE_BY_CODE[code] ?? 'Метрика';
}

function getMetricArrow(direction?: string): string {
  if (direction === 'VIEWER') return '→';
  if (direction === 'OTHER') return '←';
  if (direction === 'BALANCED') return '•';
  return '•';
}

function getMetricTone(direction?: string): string {
  if (direction === 'VIEWER') return 'viewer';
  if (direction === 'OTHER') return 'other';
  if (direction === 'BALANCED') return 'balanced';
  return 'muted';
}

function RelationshipMetricTile({
  dimension,
}: {
  dimension: RelationshipDimension;
}) {
  if (dimension.direction === 'NOT_AVAILABLE') {
    return null;
  }

  const title = getMetricTitle(dimension.code);
  const arrow = getMetricArrow(dimension.direction);
  const tone = getMetricTone(dimension.direction);

  return (
    <div
      className={`monetization-metric-tile monetization-metric-tile--${tone}`}
      data-metric-tile={dimension.code}
      aria-label={title}
    >
      <div className="monetization-metric-tile__title">{title}</div>
      <div className="monetization-metric-tile__arrow" aria-hidden="true">
        {arrow}
      </div>
    </div>
  );
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'success'; data: RelationshipDashboardPayload }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string };

type DayLoadState =
  | { kind: 'idle' }
  | { kind: 'loading'; date: string }
  | { kind: 'success'; date: string; data: RelationshipDayPayload }
  | { kind: 'error'; date: string; message: string };

function readDayRelationshipScreen(
  payload: RelationshipDayPayload | null | undefined,
): RelationshipScreenPayload | null {
  if (!payload) return null;
  if (isRelationshipScreenPayload(payload.relationshipScreen)) {
    return payload.relationshipScreen;
  }
  // Soft accept for NO_ACTIVITY payloads that still carry a screen object.
  const soft = asPlainObject(payload.relationshipScreen);
  if (!soft) return null;
  return soft as RelationshipScreenPayload;
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
  const fromUi = readUiText(ui, 'timelineLabel', 'timelineCta', 'actionLabel');
  if (fromUi) return fromUi;

  const action = asPlainObject(payload.action);
  const fromAction = readUiText(action, 'label', 'title', 'cta');
  if (fromAction) return fromAction;

  return 'последние 14 дней';
}

function readMetaVersion(
  payload: RelationshipDashboardPayload,
  screen: RelationshipScreenPayload | null,
  key: 'dashboardVersion' | 'relationshipScreenVersion',
): string | number | null {
  const fromScreen = screen?.meta?.[key];
  if (typeof fromScreen === 'string' || typeof fromScreen === 'number') {
    return fromScreen;
  }
  const fromRoot = payload.meta?.[key];
  if (typeof fromRoot === 'string' || typeof fromRoot === 'number') {
    return fromRoot;
  }
  if (key === 'dashboardVersion' && payload.dashboardVersion != null) {
    return payload.dashboardVersion;
  }
  return null;
}

export function RelationshipAnalyticsScreen({
  token,
  peer,
  viewerUserId = null,
  viewerLabel = 'ты',
  premiumActive = null,
  onBack,
  onPremiumRequired,
  onOpenTimeline,
  onStartBan,
}: Props) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [retryTick, setRetryTick] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayLoadState, setDayLoadState] = useState<DayLoadState>({
    kind: 'idle',
  });
  const actionLockRef = useRef(false);
  const requestIdRef = useRef(0);
  const dayRequestIdRef = useRef(0);
  const onPremiumRequiredRef = useRef(onPremiumRequired);
  onPremiumRequiredRef.current = onPremiumRequired;

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let cancelled = false;
    setLoadState({ kind: 'loading' });
    setActionError(null);
    setSelectedDate(null);
    setDayLoadState({ kind: 'idle' });

    void (async () => {
      try {
        const data = await fetchRelationshipDashboard({
          token,
          otherUserId: peer.userId,
        });
        if (cancelled || requestId !== requestIdRef.current) return;
        if (process.env.NODE_ENV !== 'production') {
          const screen = isRelationshipScreenPayload(data.relationshipScreen)
            ? data.relationshipScreen
            : null;
          const dimensions = extractRelationshipDimensions(screen);
          console.info(
            'RELATIONSHIP_ANALYTICS_V8_RECEIVED',
            buildV8ReceivedLog({
              viewerUserId: viewerUserId ?? 'unknown',
              otherUserId: peer.userId,
              dashboardVersion: readMetaVersion(data, screen, 'dashboardVersion'),
              relationshipScreenVersion: readMetaVersion(
                data,
                screen,
                'relationshipScreenVersion',
              ),
              dimensions,
              premiumStatus: premiumActive,
            }),
          );
        }
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
  }, [token, peer.userId, retryTick, premiumActive, viewerUserId]);

  useEffect(() => {
    if (!selectedDate) {
      setDayLoadState({ kind: 'idle' });
      return;
    }

    const requestId = ++dayRequestIdRef.current;
    let cancelled = false;
    setDayLoadState({ kind: 'loading', date: selectedDate });

    void (async () => {
      try {
        const data = await fetchRelationshipDay({
          token,
          otherUserId: peer.userId,
          date: selectedDate,
        });
        if (cancelled || requestId !== dayRequestIdRef.current) return;
        setDayLoadState({ kind: 'success', date: selectedDate, data });
      } catch (err) {
        if (cancelled || requestId !== dayRequestIdRef.current) return;
        // Day failures must not bounce premium users into purchase flow.
        void err;
        setDayLoadState({
          kind: 'error',
          date: selectedDate,
          message: 'Не удалось загрузить этот день',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedDate, token, peer.userId]);

  const handleRetry = useCallback(() => {
    setRetryTick((n) => n + 1);
  }, []);

  const handleSelectDate = useCallback((date: string | null) => {
    setSelectedDate(date);
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

  const baseRelationshipScreen =
    loadState.kind === 'success' &&
    isRelationshipScreenPayload(loadState.data.relationshipScreen)
      ? loadState.data.relationshipScreen
      : null;

  const dayPayload =
    dayLoadState.kind === 'success' &&
    selectedDate != null &&
    dayLoadState.date === selectedDate
      ? dayLoadState.data
      : null;

  const dayRelationshipScreen = readDayRelationshipScreen(dayPayload);
  const dayStatus = readRelationshipScreenStatus(dayRelationshipScreen);
  const isDayNoActivity = dayStatus === 'NO_ACTIVITY';
  const isDayLoading =
    selectedDate != null &&
    dayLoadState.kind === 'loading' &&
    dayLoadState.date === selectedDate;
  const dayErrorMessage =
    selectedDate != null &&
    dayLoadState.kind === 'error' &&
    dayLoadState.date === selectedDate
      ? dayLoadState.message
      : null;

  // Day overlay only when fetch succeeded; on error keep lifetime dashboard.
  const relationshipScreen =
    selectedDate && dayRelationshipScreen && !dayErrorMessage
      ? dayRelationshipScreen
      : baseRelationshipScreen;

  const weeklyDayOptions = useMemo(
    () => parseWeeklyDynamicsOptions(baseRelationshipScreen?.weeklyDynamics),
    [baseRelationshipScreen],
  );

  const allDimensions = useMemo((): RelationshipDimension[] => {
    if (isDayNoActivity) return [];
    return relationshipScreen
      ? extractRelationshipDimensions(relationshipScreen)
      : [];
  }, [isDayNoActivity, relationshipScreen]);

  const orbDimensions = useMemo(
    () => selectOrbRingDimensions(allDimensions),
    [allDimensions],
  );

  const cardDimensions = useMemo(
    () => selectCardDimensions(allDimensions),
    [allDimensions],
  );

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (!relationshipScreen) return;
    console.info(
      'RELATIONSHIP_ANALYTICS_V8_RENDERED',
      buildV8RenderedLog(orbDimensions, cardDimensions),
    );
  }, [cardDimensions, orbDimensions, relationshipScreen]);

  const screenTitle =
    baseRelationshipScreen?.title?.trim() ||
    relationshipScreen?.title?.trim() ||
    'ваши отношения';
  const peerName =
    baseRelationshipScreen?.peer?.displayName?.trim() ||
    relationshipScreen?.peer?.displayName?.trim() ||
    peer.displayName;
  const peerAvatar =
    baseRelationshipScreen?.peer?.avatarUrl ??
    relationshipScreen?.peer?.avatarUrl ??
    peer.avatarUrl ??
    null;
  const primary = baseRelationshipScreen?.primaryAction ?? null;
  const primaryCode = primary?.code;
  const canStartBan =
    primaryCode === 'START_BAN' && typeof onStartBan === 'function';

  const showDateSelector =
    loadState.kind === 'success' && baseRelationshipScreen != null;

  const showFitLayout =
    loadState.kind === 'success' && baseRelationshipScreen != null;
  const showBanCta = showFitLayout && primaryCode === 'START_BAN';

  const handleImproveNoop = useCallback(() => {
    // UI placeholder — no AI / voice wiring yet.
  }, []);

  return (
    <div
      className={`monetization-screen${
        showFitLayout ? ' monetization-screen--relationship-fit' : ''
      }`}
      role="dialog"
      aria-label={screenTitle}
    >
      <div
        className={`monetization-screen__scroll${
          showFitLayout ? ' monetization-screen__scroll--fit' : ''
        }`}
      >
        <header className="monetization-screen__header monetization-screen__header--peer">
          <button
            type="button"
            className="monetization-back"
            onClick={onBack}
            aria-label="Назад"
          >
            <WhatBackIcon />
          </button>
          <div className="monetization-screen__header-text">
            <h2 className="monetization-screen__peer-title">{peerName}</h2>
            <p className="monetization-screen__section-label">{screenTitle}</p>
          </div>
        </header>

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

        {loadState.kind === 'success' && baseRelationshipScreen ? (
          <div className="monetization-relationship monetization-relationship--fit">
            {showDateSelector ? (
              <div
                className="monetization-relationship__weekly"
                role="group"
                aria-label="Выбор даты"
              >
                <button
                  type="button"
                  className={`monetization-week-chip${
                    selectedDate == null ? ' monetization-week-chip--active' : ''
                  }`}
                  aria-pressed={selectedDate == null}
                  onClick={() => handleSelectDate(null)}
                >
                  всё время
                </button>
                {weeklyDayOptions.map((option) => {
                  const active = selectedDate === option.date;
                  return (
                    <button
                      key={option.date}
                      type="button"
                      className={`monetization-week-chip${
                        active ? ' monetization-week-chip--active' : ''
                      }`}
                      aria-pressed={active}
                      onClick={() => handleSelectDate(option.date)}
                    >
                      {option.label}
                    </button>
                  );
                })}
                <label className="monetization-week-date">
                  <span className="monetization-week-date__label" aria-hidden>
                    выбери день
                  </span>
                  <input
                    type="date"
                    className="monetization-week-date__input"
                    aria-label="выбери день"
                    value={selectedDate ?? ''}
                    onChange={(event) => {
                      const next = event.target.value.trim();
                      handleSelectDate(next.length > 0 ? next : null);
                    }}
                  />
                </label>
              </div>
            ) : null}

            {isDayLoading ? (
              <p className="monetization-muted monetization-muted--tight">
                загружаем день…
              </p>
            ) : null}

            {dayErrorMessage ? (
              <p className="monetization-analytics-inline-error">
                {dayErrorMessage}
              </p>
            ) : null}

            <RelationshipOrb
              compact
              dimensions={isDayLoading ? [] : orbDimensions}
              peerAvatarUrl={peerAvatar}
              peerDisplayName={peerName}
            />

            {!isDayLoading && isDayNoActivity ? (
              <p className="monetization-muted monetization-muted--tight">
                нет данных за выбранный день
              </p>
            ) : null}

            {!isDayLoading && !isDayNoActivity ? (
              cardDimensions.length === 0 ? (
                <p className="monetization-muted monetization-muted--tight">
                  пока нет данных по кольцам динамики
                </p>
              ) : (
                <div
                  className="monetization-relationship__tiles"
                  data-relationship-tiles="v1"
                >
                  {cardDimensions.map((dimension) => (
                    <RelationshipMetricTile
                      key={dimension.code}
                      dimension={dimension}
                    />
                  ))}
                </div>
              )
            ) : null}

            <div className="monetization-improve" aria-label="Улучшение отношений">
              <input
                type="text"
                className="monetization-improve__input"
                placeholder="что хочешь улучшить?"
                readOnly
                tabIndex={0}
                onFocus={(event) => event.currentTarget.blur()}
                onClick={handleImproveNoop}
                aria-disabled="true"
              />
              <div className="monetization-improve__actions">
                <button
                  type="button"
                  className="monetization-improve__btn"
                  onClick={handleImproveNoop}
                  aria-label="AI"
                >
                  <span className="monetization-improve__ai" aria-hidden>
                    ✦
                  </span>
                  <span>AI</span>
                </button>
                <button
                  type="button"
                  className="monetization-improve__btn monetization-improve__btn--icon"
                  onClick={handleImproveNoop}
                  aria-label="Голос"
                >
                  <span aria-hidden>🎙</span>
                </button>
              </div>
            </div>

            {showBanCta ? (
              <div className="monetization-relationship__primary">
                <button
                  type="button"
                  className="btn-98-primary lobby-screen__cta"
                  disabled={!canStartBan}
                  onClick={() => {
                    if (!canStartBan) return;
                    setActionError(null);
                    const ok = onStartBan!(peer);
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

            {actionError ? (
              <p className="monetization-analytics-inline-error">{actionError}</p>
            ) : null}
          </div>
        ) : null}

        {loadState.kind === 'success' && !baseRelationshipScreen ? (
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
