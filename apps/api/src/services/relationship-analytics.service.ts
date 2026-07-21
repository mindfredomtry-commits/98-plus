import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const RELATIONSHIP_ACTION_CODES = [
  'OPEN_TIMELINE_RECENT_14_DAYS',
] as const;

export type RelationshipActionCode =
  (typeof RELATIONSHIP_ACTION_CODES)[number];

function isJsonObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

type DashboardRow = {
  dashboard_payload: Prisma.JsonValue | null;
};

type DayRow = {
  day_payload: Prisma.JsonValue | null;
};

type OverviewRow = {
  overview_payload: Prisma.JsonValue | null;
};

type PeriodRow = {
  period_payload: Prisma.JsonValue | null;
};

type ActionRow = {
  action_payload: Prisma.JsonValue | null;
};

/**
 * Relationship Dashboard v6 via analytics.get_relationship_dashboard_v1.
 * Returns the SQL JSON payload as-is, or null when missing/invalid.
 */
export async function getRelationshipDashboard(
  viewerUserId: string,
  otherUserId: string,
): Promise<Prisma.JsonValue | null> {
  const rows = await prisma.$queryRaw<DashboardRow[]>`
    select analytics.get_relationship_dashboard_v1(
      ${viewerUserId},
      ${otherUserId}
    ) as dashboard_payload
  `;

  const payload = rows[0]?.dashboard_payload;
  return isJsonObject(payload) ? payload : null;
}

/**
 * Relationship day analytics via analytics.get_relationship_day_v1.
 * Returns the SQL JSON payload as-is (including NO_ACTIVITY), or null when missing/invalid.
 */
export async function getRelationshipDay(
  viewerUserId: string,
  otherUserId: string,
  date: string,
): Promise<Prisma.JsonValue | null> {
  const rows = await prisma.$queryRaw<DayRow[]>`
    select analytics.get_relationship_day_v1(
      ${viewerUserId},
      ${otherUserId},
      ${date}::date
    ) as day_payload
  `;

  const payload = rows[0]?.day_payload;
  return isJsonObject(payload) ? payload : null;
}

/**
 * Relationship period analytics via analytics.get_relationship_period_v1.
 * Returns the SQL JSON payload as-is (including NO_ACTIVITY), or null when missing/invalid.
 */
export async function getRelationshipPeriod(
  viewerUserId: string,
  otherUserId: string,
  range: string,
  anchorDate: string | null,
): Promise<Prisma.JsonValue | null> {
  const rows = await prisma.$queryRaw<PeriodRow[]>`
    select analytics.get_relationship_period_v1(
      ${viewerUserId},
      ${otherUserId},
      ${range},
      ${anchorDate}::date
    ) as period_payload
  `;

  const payload = rows[0]?.period_payload;
  return isJsonObject(payload) ? payload : null;
}

/**
 * Aggregate relationship overview via analytics.get_relationship_overview_v1.
 */
export async function getRelationshipOverview(
  viewerUserId: string,
  range: string,
  anchorDate: string | null,
): Promise<Prisma.JsonValue | null> {
  const rows = await prisma.$queryRaw<OverviewRow[]>`
    select analytics.get_relationship_overview_v1(
      ${viewerUserId},
      ${range},
      ${anchorDate}::date
    ) as overview_payload
  `;

  const payload = rows[0]?.overview_payload;
  return isJsonObject(payload) ? payload : null;
}

/**
 * Relationship action screen via analytics.get_relationship_action_v1.
 * Returns the SQL JSON payload as-is, or null when missing/invalid.
 */
export async function getRelationshipAction(
  viewerUserId: string,
  otherUserId: string,
  actionCode: RelationshipActionCode,
): Promise<Prisma.JsonValue | null> {
  const rows = await prisma.$queryRaw<ActionRow[]>`
    select analytics.get_relationship_action_v1(
      ${viewerUserId},
      ${otherUserId},
      ${actionCode}
    ) as action_payload
  `;

  const payload = rows[0]?.action_payload;
  return isJsonObject(payload) ? payload : null;
}
