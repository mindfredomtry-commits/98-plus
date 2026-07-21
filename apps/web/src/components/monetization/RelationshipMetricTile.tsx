'use client';

import type { RelationshipDimension } from '@/lib/relationship-analytics-types';
import {
  getRelationshipMetricColor,
  metricPerspectiveOpacity,
  resolveMetricPerspectiveState,
  type RelationshipPerspective,
} from './relationship-metric-colors';

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
  if (direction === 'BALANCED') return '→←';
  if (direction === 'LOW_DATA') return '—';
  return '—';
}

function getMetricTone(direction?: string): string {
  if (direction === 'VIEWER') return 'viewer';
  if (direction === 'OTHER') return 'other';
  if (direction === 'BALANCED') return 'balanced';
  return 'muted';
}

export function RelationshipMetricTile({
  dimension,
  perspective,
}: {
  dimension: RelationshipDimension;
  /** Detail-only: when omitted, tile keeps full (legacy/overview) intensity. */
  perspective?: RelationshipPerspective;
}) {
  if (dimension.direction === 'NOT_AVAILABLE') {
    return null;
  }

  const title = getMetricTitle(dimension.code);
  const arrow = getMetricArrow(dimension.direction);
  const tone = getMetricTone(dimension.direction);
  const metricColor = getRelationshipMetricColor(dimension.code, dimension.ring);
  const arrowMuted = dimension.direction === 'LOW_DATA';
  const arrowBalanced = dimension.direction === 'BALANCED';

  const perspectiveState =
    perspective == null
      ? null
      : resolveMetricPerspectiveState(dimension.direction, perspective);
  const tileOpacity =
    perspectiveState == null
      ? undefined
      : metricPerspectiveOpacity(perspectiveState);

  return (
    <div
      className={`monetization-metric-tile monetization-metric-tile--${tone}${
        perspectiveState
          ? ` monetization-metric-tile--perspective-${perspectiveState}`
          : ''
      }`}
      data-metric-tile={dimension.code}
      aria-label={title}
      style={{
        ['--metric-color' as string]: metricColor,
        ...(tileOpacity != null
          ? { ['--metric-tile-opacity' as string]: String(tileOpacity) }
          : {}),
      }}
    >
      <div className="monetization-metric-tile__title">{title}</div>
      <div
        className={`monetization-metric-tile__arrow${
          arrowBalanced ? ' monetization-metric-tile__arrow--balanced' : ''
        }${arrowMuted ? ' monetization-metric-tile__arrow--muted' : ''}`}
        aria-hidden="true"
      >
        {arrow}
      </div>
    </div>
  );
}
