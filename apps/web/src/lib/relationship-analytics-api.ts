import { api } from './api';
import {
  isRelationshipDashboardPayload,
  isRelationshipDayPayload,
  isRelationshipPeriodPayload,
  isRelationshipTimelinePayload,
  type RelationshipActionCode,
  type RelationshipDashboardPayload,
  type RelationshipDayPayload,
  type RelationshipPeriodPayload,
  type RelationshipPeriodRangeCode,
  type RelationshipTimelinePayload,
} from './relationship-analytics-types';

export class RelationshipAnalyticsPayloadError extends Error {
  constructor(message = 'Unexpected analytics response') {
    super(message);
    this.name = 'RelationshipAnalyticsPayloadError';
  }
}

export async function fetchRelationshipDashboard(input: {
  token: string | null | undefined;
  otherUserId: string;
}): Promise<RelationshipDashboardPayload> {
  const otherUserId = input.otherUserId.trim();
  const data = await api<unknown>(
    `/analytics/relationships/${encodeURIComponent(otherUserId)}/dashboard`,
    {
      token: input.token,
      retries: 1,
    },
  );

  if (!isRelationshipDashboardPayload(data)) {
    throw new RelationshipAnalyticsPayloadError(
      'Unexpected analytics response',
    );
  }
  return data;
}

export async function fetchRelationshipDay(input: {
  token: string | null | undefined;
  otherUserId: string;
  date: string;
}): Promise<RelationshipDayPayload> {
  const otherUserId = input.otherUserId.trim();
  const date = input.date.trim();
  const data = await api<unknown>(
    `/analytics/relationships/${encodeURIComponent(otherUserId)}/day?date=${encodeURIComponent(date)}`,
    {
      token: input.token,
      retries: 0,
    },
  );

  if (!isRelationshipDayPayload(data)) {
    throw new RelationshipAnalyticsPayloadError(
      'Unexpected analytics response',
    );
  }
  return data;
}

export async function fetchRelationshipPeriod(input: {
  token: string | null | undefined;
  otherUserId: string;
  range: RelationshipPeriodRangeCode;
  anchorDate?: string | null;
}): Promise<RelationshipPeriodPayload> {
  const otherUserId = input.otherUserId.trim();
  const params = new URLSearchParams({ range: input.range });
  const anchorDate = input.anchorDate?.trim();
  if (anchorDate) {
    params.set('anchorDate', anchorDate);
  }

  const data = await api<unknown>(
    `/analytics/relationships/${encodeURIComponent(otherUserId)}/period?${params.toString()}`,
    {
      token: input.token,
      retries: 0,
    },
  );

  if (!isRelationshipPeriodPayload(data)) {
    throw new RelationshipAnalyticsPayloadError(
      'Unexpected analytics response',
    );
  }
  return data;
}

export async function fetchRelationshipAction(input: {
  token: string | null | undefined;
  otherUserId: string;
  actionCode: RelationshipActionCode;
}): Promise<RelationshipTimelinePayload> {
  const otherUserId = input.otherUserId.trim();
  const data = await api<unknown>(
    `/analytics/relationships/${encodeURIComponent(otherUserId)}/actions`,
    {
      method: 'POST',
      token: input.token,
      retries: 0,
      body: JSON.stringify({ actionCode: input.actionCode }),
    },
  );

  if (!isRelationshipTimelinePayload(data)) {
    throw new RelationshipAnalyticsPayloadError(
      'Unexpected analytics response',
    );
  }
  return data;
}
