'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WhatBackIcon } from '../instant-ban/WhatBackIcon';
import { ApiError } from '@/lib/api';
import {
  fetchRelationshipAction,
  fetchRelationshipDashboard,
  fetchRelationshipPeriod,
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
  readNumber,
  readRelationshipScreenStatus,
  readUiText,
  type AnalyticsPeer,
  type RelationshipDashboardPayload,
  type RelationshipDimension,
  type RelationshipPeriodPayload,
  type RelationshipPeriodRangeCode,
  type RelationshipScreenPayload,
  type RelationshipTimelinePayload,
} from '@/lib/relationship-analytics-types';
import { RelationshipOrb } from './RelationshipOrb';
import { RelationshipMetricTile } from './RelationshipMetricTile';
import '../lobby-screen.css';
import './monetization.css';

type Props = {
  token: string | null | undefined;
  peer: AnalyticsPeer;
  viewerUserId?: string | null;
  viewerLabel?: string;
  premiumActive?: boolean | null;
  onBack: () => void;
  onOpenTimeline: (payload: RelationshipTimelinePayload) => void;
  onStartBan?: (peer: AnalyticsPeer) => boolean;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'success'; data: RelationshipDashboardPayload }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string };

type PeriodLoadState =
  | { kind: 'idle' }
  | { kind: 'loading'; range: RelationshipPeriodRangeCode }
  | { kind: 'success'; range: RelationshipPeriodRangeCode; data: RelationshipPeriodPayload }
  | { kind: 'error'; range: RelationshipPeriodRangeCode; message: string };

type RelationshipRange = RelationshipPeriodRangeCode | 'ALL';

const RELATIONSHIP_RANGE_OPTIONS: Array<{
  id: RelationshipRange;
  label: string;
}> = [
  { id: '1D', label: '1Д' },
  { id: '1W', label: '1Н' },
  { id: '1M', label: '1М' },
  { id: '1Y', label: '1Г' },
  { id: 'ALL', label: 'ВСЁ' },
];

function isPeriodRange(
  range: RelationshipRange,
): range is RelationshipPeriodRangeCode {
  return range !== 'ALL';
}

/** Local calendar date YYYY-MM-DD (for 1D = today semantics). */
function localTodayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readPeriodRelationshipScreen(
  payload: RelationshipPeriodPayload | null | undefined,
): RelationshipScreenPayload | null {
  if (!payload) return null;
  if (isRelationshipScreenPayload(payload.relationshipScreen)) {
    return payload.relationshipScreen;
  }
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
  onOpenTimeline,
  onStartBan,
}: Props) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [retryTick, setRetryTick] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<RelationshipRange>('ALL');
  const [periodLoadState, setPeriodLoadState] = useState<PeriodLoadState>({
    kind: 'idle',
  });
  const actionLockRef = useRef(false);
  const requestIdRef = useRef(0);
  const periodRequestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let cancelled = false;
    setLoadState({ kind: 'loading' });
    setActionError(null);
    setSelectedRange('ALL');
    setPeriodLoadState({ kind: 'idle' });

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
    if (!isPeriodRange(selectedRange)) {
      setPeriodLoadState({ kind: 'idle' });
      return;
    }

    const range = selectedRange;
    const requestId = ++periodRequestIdRef.current;
    let cancelled = false;
    setPeriodLoadState({ kind: 'loading', range });

    void (async () => {
      try {
        const data = await fetchRelationshipPeriod({
          token,
          otherUserId: peer.userId,
          range,
          anchorDate: range === '1D' ? localTodayIsoDate() : undefined,
        });
        if (cancelled || requestId !== periodRequestIdRef.current) return;
        setPeriodLoadState({ kind: 'success', range, data });
      } catch (err) {
        if (cancelled || requestId !== periodRequestIdRef.current) return;
        // Period failures must not bounce premium users into purchase flow.
        void err;
        setPeriodLoadState({
          kind: 'error',
          range,
          message: 'Не удалось загрузить период',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedRange, token, peer.userId]);

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
      if (err instanceof ApiError && err.status === 404) {
        setActionError('за этот период пока нет данных');
        return;
      }
      setActionError('не удалось открыть период');
    } finally {
      actionLockRef.current = false;
      setActionLoading(false);
    }
  }, [actionLoading, onOpenTimeline, peer.userId, token]);

  const baseRelationshipScreen =
    loadState.kind === 'success' &&
    isRelationshipScreenPayload(loadState.data.relationshipScreen)
      ? loadState.data.relationshipScreen
      : null;

  const activePeriodRange = isPeriodRange(selectedRange) ? selectedRange : null;

  const periodPayload =
    periodLoadState.kind === 'success' &&
    activePeriodRange != null &&
    periodLoadState.range === activePeriodRange
      ? periodLoadState.data
      : null;

  const periodRelationshipScreen = readPeriodRelationshipScreen(periodPayload);
  const periodStatus = readRelationshipScreenStatus(periodRelationshipScreen);
  const isPeriodNoActivity =
    activePeriodRange != null && periodStatus === 'NO_ACTIVITY';
  const isPeriodLoading =
    activePeriodRange != null &&
    periodLoadState.kind === 'loading' &&
    periodLoadState.range === activePeriodRange;
  const periodErrorMessage =
    activePeriodRange != null &&
    periodLoadState.kind === 'error' &&
    periodLoadState.range === activePeriodRange
      ? periodLoadState.message
      : null;

  // Successful period fetch (incl. NO_ACTIVITY) uses period screen.
  // Period load/error: never show lifetime arcs as a stand-in.
  // Lifetime fallback only on network/server error.
  const relationshipScreen = (() => {
    if (activePeriodRange == null) {
      return baseRelationshipScreen;
    }
    if (periodErrorMessage) {
      return baseRelationshipScreen;
    }
    if (
      periodLoadState.kind === 'success' &&
      periodLoadState.range === activePeriodRange &&
      periodRelationshipScreen
    ) {
      return periodRelationshipScreen;
    }
    return null;
  })();

  const showPeriodOrb = activePeriodRange == null || !isPeriodLoading;

  const periodNoActivityMessage =
    activePeriodRange === '1D'
      ? 'Сегодня между вами ещё не было действий'
      : 'нет данных за выбранный период';

  const handleSelectRange = useCallback((range: RelationshipRange) => {
    setSelectedRange(range);
  }, []);

  const allDimensions = useMemo((): RelationshipDimension[] => {
    if (activePeriodRange != null) {
      if (isPeriodLoading || isPeriodNoActivity || !relationshipScreen) {
        return [];
      }
    }
    return relationshipScreen
      ? extractRelationshipDimensions(relationshipScreen)
      : [];
  }, [
    activePeriodRange,
    isPeriodLoading,
    isPeriodNoActivity,
    relationshipScreen,
  ]);

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

  const showRangeSelector =
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
            {showRangeSelector ? (
              <div
                className="monetization-relationship__range-selector"
                role="group"
                aria-label="Период"
              >
                {RELATIONSHIP_RANGE_OPTIONS.map((option) => {
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
            ) : null}

            <h2 className="monetization-relationship__orb-title">
              ваши отношения
            </h2>

            {isPeriodLoading ? (
              <p className="monetization-muted monetization-muted--tight">
                загружаем период…
              </p>
            ) : null}

            {periodErrorMessage ? (
              <p className="monetization-analytics-inline-error">
                {periodErrorMessage}
              </p>
            ) : null}

            {showPeriodOrb ? (
              <RelationshipOrb
                compact
                dimensions={isPeriodLoading ? [] : orbDimensions}
                peerAvatarUrl={peerAvatar}
                peerDisplayName={peerName}
              />
            ) : null}

            {!isPeriodLoading && isPeriodNoActivity ? (
              <p className="monetization-muted monetization-muted--tight">
                {periodNoActivityMessage}
              </p>
            ) : null}

            {!isPeriodLoading && !isPeriodNoActivity ? (
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
