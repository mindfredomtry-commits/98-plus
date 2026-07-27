/**
 * Map network/session payloads → owner QueueItem (render-complete).
 */

import type { BanInteraction, BanResult } from '@98plus/shared';
import type { QueueItem } from './notification-owner.types';

function senderLabel(ban: BanInteraction): string {
  const s = ban.sender;
  if (!s) return 'Игрок';
  if (s.username) return `@${s.username}`;
  if (s.firstName) return s.firstName;
  return 'Игрок';
}

export function queueItemFromIncoming(ban: BanInteraction): QueueItem {
  return {
    kind: 'incoming',
    displayId: `incoming:${ban.id}`,
    banId: ban.id,
    card: {
      banId: ban.id,
      text: ban.text ?? '',
      senderLabel: senderLabel(ban),
    },
  };
}

export function queueItemFromCheck(ban: BanInteraction): QueueItem {
  return {
    kind: 'check',
    displayId: `check:${ban.id}`,
    banId: ban.id,
    card: {
      banId: ban.id,
      text: ban.text ?? '',
      senderLabel: senderLabel(ban),
    },
  };
}

export function queueItemFromResult(result: BanResult): QueueItem {
  return {
    kind: 'result',
    displayId: `result:${result.id}`,
    banId: result.id,
    card: {
      banId: result.id,
      title: result.headline || 'Результат',
      body: result.subline || result.text || '',
      outcome: result.outcome ?? null,
    },
  };
}

export function resultCardFromBanResult(result: BanResult) {
  return {
    banId: result.id,
    title: result.headline || 'Результат',
    body: result.subline || result.text || '',
    outcome: result.outcome ?? null,
  };
}
