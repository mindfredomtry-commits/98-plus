import {
  asPlainObject,
  readNumber,
  ringSortIndex,
  type RelationshipDimension,
  type RelationshipDirection,
  type RelationshipRing,
  type RelationshipScreenPayload,
  type RelationshipOverviewPayload,
} from './relationship-analytics-types';

const DIMENSION_TITLE_FALLBACK: Record<string, string> = {
  INITIATIVE: 'Инициатива',
  RESPONSIVENESS: 'Ответность',
  RESPECT: 'Уважение',
};

const RING_VALUES: RelationshipRing[] = ['OUTER', 'MIDDLE', 'INNER'];

function isRing(value: string | null): value is RelationshipRing {
  return value != null && (RING_VALUES as readonly string[]).includes(value);
}

function isDirection(value: string | null): value is RelationshipDirection {
  return (
    value === 'VIEWER' ||
    value === 'OTHER' ||
    value === 'BALANCED' ||
    value === 'LOW_DATA' ||
    value === 'NOT_AVAILABLE'
  );
}

function readStringField(
  obj: Record<string, unknown>,
  key: string,
): string | null {
  const value = obj[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBooleanField(
  obj: Record<string, unknown>,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = obj[key];
  return typeof value === 'boolean' ? value : defaultValue;
}

function resolveRing(
  ringRaw: string | null,
  code: string,
): RelationshipRing | null {
  if (isRing(ringRaw)) return ringRaw;
  if (code === 'INITIATIVE') return 'OUTER';
  if (code === 'RESPONSIVENESS') return 'MIDDLE';
  if (code === 'RESPECT') return 'INNER';
  return null;
}

function resolveTitle(code: string, title: string | null): string {
  if (title) return title;
  return DIMENSION_TITLE_FALLBACK[code] ?? code;
}

/** Normalize one API dimension row without inventing analytics. */
export function normalizeRelationshipDimension(
  raw: unknown,
): RelationshipDimension | null {
  const obj = asPlainObject(raw);
  if (!obj) return null;

  const code =
    typeof obj.code === 'string' && obj.code.trim()
      ? obj.code.trim()
      : null;
  if (!code || code === 'THIRD_DIMENSION_PENDING') return null;

  const ringRaw =
    typeof obj.ring === 'string' ? obj.ring.toUpperCase() : null;
  const ring = resolveRing(ringRaw, code);

  const directionRaw =
    typeof obj.direction === 'string' ? obj.direction.toUpperCase() : null;
  const direction: RelationshipDirection = isDirection(directionRaw)
    ? directionRaw
    : 'NOT_AVAILABLE';

  const metricCode =
    typeof obj.metricCode === 'string' && obj.metricCode.trim()
      ? obj.metricCode.trim()
      : '';

  return {
    code,
    ring,
    available: readBooleanField(obj, 'available', true),
    publishable: readBooleanField(obj, 'publishable', false),
    viewerShare: readNumber(obj, 'viewerShare'),
    otherShare: readNumber(obj, 'otherShare'),
    displayValue:
      typeof obj.displayValue === 'string' ? obj.displayValue : null,
    direction,
    title: resolveTitle(code, readStringField(obj, 'title')),
    description: readStringField(obj, 'description'),
    confidenceCode: readStringField(obj, 'confidenceCode'),
    confidenceScore: readNumber(obj, 'confidenceScore'),
    sampleSize: readNumber(obj, 'sampleSize'),
    metricCode,
    resultCode: readStringField(obj, 'resultCode'),
    resultName: readStringField(obj, 'resultName'),
    supportingFacts: asPlainObject(obj.supportingFacts),
  };
}

/** Source of truth: relationshipOrb.dimensions from API. */
export function normalizeOrbDimensions(
  rawDimensions: unknown[] | null | undefined,
): RelationshipDimension[] {
  if (!Array.isArray(rawDimensions)) return [];

  return [...rawDimensions]
    .map((item) => normalizeRelationshipDimension(item))
    .filter((item): item is RelationshipDimension => item != null)
    .sort(
      (a, b) =>
        ringSortIndex(a.ring) - ringSortIndex(b.ring) ||
        a.code.localeCompare(b.code),
    );
}

/** Orb rings: only dimensions with a non-null ring (OUTER/MIDDLE/INNER). */
export function selectOrbRingDimensions(
  dimensions: RelationshipDimension[],
): RelationshipDimension[] {
  return dimensions.filter((dim) => dim.ring != null);
}

/** Cards under orb: ring dimensions except NOT_AVAILABLE. */
export function selectCardDimensions(
  dimensions: RelationshipDimension[],
): RelationshipDimension[] {
  return selectOrbRingDimensions(dimensions).filter(
    (dim) => dim.direction !== 'NOT_AVAILABLE',
  );
}

export function extractRelationshipDimensions(
  screen: RelationshipScreenPayload | null | undefined,
): RelationshipDimension[] {
  if (!screen) return [];
  return normalizeOrbDimensions(screen.relationshipOrb?.dimensions);
}

export function extractOverviewDimensions(
  payload: RelationshipOverviewPayload | null | undefined,
): RelationshipDimension[] {
  if (!payload) return [];
  const overview =
    payload.relationshipScreen ?? payload.relationshipOverview;
  if (!overview) return [];
  return normalizeOrbDimensions(overview.relationshipOrb?.dimensions);
}

export function resolveLearnPressView(
  premiumActive: boolean,
): 'premium' | 'peerSelect' {
  return premiumActive ? 'peerSelect' : 'premium';
}

export type RelationshipAnalyticsV8ReceivedLog = {
  viewerUserId: string;
  otherUserId: string;
  dashboardVersion: string | number | null;
  relationshipScreenVersion: string | number | null;
  dimensionCodes: string[];
  rings: Array<RelationshipRing | null>;
  premiumStatus: boolean | null;
};

export function buildV8ReceivedLog(input: {
  viewerUserId: string;
  otherUserId: string;
  dashboardVersion?: string | number | null;
  relationshipScreenVersion?: string | number | null;
  dimensions: RelationshipDimension[];
  premiumStatus?: boolean | null;
}): RelationshipAnalyticsV8ReceivedLog {
  return {
    viewerUserId: input.viewerUserId,
    otherUserId: input.otherUserId,
    dashboardVersion: input.dashboardVersion ?? null,
    relationshipScreenVersion: input.relationshipScreenVersion ?? null,
    dimensionCodes: input.dimensions.map((dim) => dim.code),
    rings: input.dimensions.map((dim) => dim.ring),
    premiumStatus: input.premiumStatus ?? null,
  };
}

export type RelationshipAnalyticsV8RenderedLog = {
  renderedDimensionCodes: string[];
  renderedRingCount: number;
  hasRespect: boolean;
  respectDisplayValue: string | null;
  respectDirection: RelationshipDirection | null;
};

export function buildV8RenderedLog(
  orbDimensions: RelationshipDimension[],
  cardDimensions: RelationshipDimension[],
): RelationshipAnalyticsV8RenderedLog {
  const respect = orbDimensions.find((dim) => dim.code === 'RESPECT');
  return {
    renderedDimensionCodes: cardDimensions.map((dim) => dim.code),
    renderedRingCount: orbDimensions.length,
    hasRespect: respect != null,
    respectDisplayValue: respect?.displayValue ?? null,
    respectDirection: respect?.direction ?? null,
  };
}
