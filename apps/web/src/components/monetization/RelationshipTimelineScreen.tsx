'use client';

import { AvatarImage } from '../AvatarImage';
import { WhatBackIcon } from '../instant-ban/WhatBackIcon';
import {
  asPlainObject,
  formatAnalyticsDate,
  formatOrbDisplayValue,
  readNumber,
  readUiText,
  type AnalyticsPeer,
  type RelationshipTimelineDay,
  type RelationshipTimelinePayload,
} from '@/lib/relationship-analytics-types';

type Props = {
  peer: AnalyticsPeer;
  payload: RelationshipTimelinePayload;
  onBack: () => void;
};

function peerLetter(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

function dayActivityLines(day: RelationshipTimelineDay): string[] {
  const activity = asPlainObject(day.activity);
  if (!activity) return [];
  const lines: string[] = [];
  const interactionCount = readNumber(activity, 'interactionCount');
  const banSentCount = readNumber(activity, 'banSentCount');
  const banReceivedCount = readNumber(activity, 'banReceivedCount');
  const replySentCount = readNumber(activity, 'replySentCount');
  const replyReceivedCount = readNumber(activity, 'replyReceivedCount');

  if (interactionCount != null) lines.push(`взаимодействий: ${interactionCount}`);
  if (banSentCount != null) lines.push(`баны отправлены: ${banSentCount}`);
  if (banReceivedCount != null) lines.push(`баны получены: ${banReceivedCount}`);
  if (replySentCount != null) lines.push(`ответы отправлены: ${replySentCount}`);
  if (replyReceivedCount != null) {
    lines.push(`ответы получены: ${replyReceivedCount}`);
  }
  return lines;
}

function dayResultLines(day: RelationshipTimelineDay): string[] {
  const results = asPlainObject(day.results);
  if (!results) return [];
  const count = readNumber(results, 'count');
  if (count == null || count <= 0) return [];

  const lines: string[] = [];
  const keys: Array<[string, string]> = [
    ['overboardCount', 'перебор'],
    ['bothYesCount', 'оба подтвердили'],
    ['bothNoCount', 'оба не подтвердили'],
    ['splitCount', 'ответы не совпали'],
    ['timeoutCount', 'без ответа'],
    ['expiredCount', 'завершились по времени'],
  ];
  for (const [key, label] of keys) {
    const value = readNumber(results, key);
    if (value != null && value > 0) lines.push(`${label}: ${value}`);
  }
  return lines;
}

/** Neutral day-orb line — never shows state/code enums. */
function dayOrbLine(day: RelationshipTimelineDay): string | null {
  const orb = asPlainObject(day.orb);
  if (!orb) return null;

  const uiText = readUiText(
    orb,
    'title',
    'label',
    'headline',
    'summary',
    'description',
    'caption',
    'text',
    'displayValue',
    'formattedValue',
  );
  if (uiText) return uiText;

  const percent = formatOrbDisplayValue(orb);
  if (percent) return `показатель: ${percent}`;

  return null;
}

export function RelationshipTimelineScreen({ peer, payload, onBack }: Props) {
  const ui = asPlainObject(payload.ui);
  const range = asPlainObject(payload.range);
  const title =
    readUiText(ui, 'title', 'screen', 'label') ?? 'последние 14 дней';

  const from = readUiText(range, 'from', 'start', 'startDate');
  const to = readUiText(range, 'to', 'end', 'endDate');
  const activeDayCount = readNumber(range, 'activeDayCount');
  const calendarDayCount = readNumber(range, 'calendarDayCount');
  const interactionCount = readNumber(range, 'interactionCount');

  return (
    <div
      className="monetization-screen"
      role="dialog"
      aria-label={title}
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
          <h2 className="monetization-screen__nav-title">{title}</h2>
        </header>

        <div className="monetization-analytics-peer">
          <AvatarImage
            src={peer.avatarUrl}
            letter={peerLetter(peer.displayName)}
            sizeClass="w-12 h-12"
            textClass="text-lg"
            ringClassName="ring-white/10"
          />
          <div className="monetization-analytics-peer__meta">
            <p className="monetization-analytics-peer__name">{peer.displayName}</p>
          </div>
        </div>

        <section className="monetization-timeline-summary">
          {(from || to) && (
            <p className="monetization-timeline-summary__range">
              {from ? formatAnalyticsDate(from) : '…'}
              {' — '}
              {to ? formatAnalyticsDate(to) : '…'}
            </p>
          )}
          <ul className="monetization-timeline-summary__stats">
            {activeDayCount != null ? (
              <li>активных дней: {activeDayCount}</li>
            ) : null}
            {calendarDayCount != null ? (
              <li>календарных дней: {calendarDayCount}</li>
            ) : null}
            {interactionCount != null ? (
              <li>взаимодействий: {interactionCount}</li>
            ) : null}
          </ul>
        </section>

        <ul className="monetization-timeline-list">
          {payload.timeline.map((day) => {
            const orbLine = dayOrbLine(day);
            const activityLines = dayActivityLines(day);
            const resultLines = dayResultLines(day);

            return (
              <li key={day.date} className="monetization-timeline-day">
                <p className="monetization-timeline-day__date">
                  {formatAnalyticsDate(day.date)}
                </p>
                {orbLine ? (
                  <p className="monetization-timeline-day__orb">{orbLine}</p>
                ) : null}
                {activityLines.length > 0 ? (
                  <ul className="monetization-timeline-day__lines">
                    {activityLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {resultLines.length > 0 ? (
                  <ul className="monetization-timeline-day__results">
                    {resultLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>

        {payload.timeline.length === 0 ? (
          <p className="monetization-muted">за этот период пока нет дней</p>
        ) : null}
      </div>
    </div>
  );
}
