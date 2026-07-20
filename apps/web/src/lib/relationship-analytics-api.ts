import { api } from './api';
import {
  isRelationshipDashboardPayload,
  isRelationshipDayPayload,
  isRelationshipTimelinePayload,
  type RelationshipActionCode,
  type RelationshipDashboardPayload,
  type RelationshipDayPayload,
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
