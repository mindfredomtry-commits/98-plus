import type { BanInteraction, BanResult } from '@98plus/shared';

export type QueuedOverlay =
  | { kind: 'incoming'; ban: BanInteraction }
  | { kind: 'check'; ban: BanInteraction }
  | { kind: 'result'; result: BanResult };

export const APP_NOTIFICATION_Z_INDEX = 100;

export function overlayQueueKey(item: QueuedOverlay): string {
  const id = item.kind === 'result' ? item.result.id : item.ban.id;
  return `${item.kind}:${id}`;
}

export function overlayBanId(item: QueuedOverlay): string {
  return item.kind === 'result' ? item.result.id : item.ban.id;
}

/** FIFO enqueue with dedup; result supersedes pending check/incoming for same ban. */
export function enqueueOverlay(
  queue: QueuedOverlay[],
  item: QueuedOverlay,
): QueuedOverlay[] {
  if (queue.some((q) => overlayQueueKey(q) === overlayQueueKey(item))) {
    return queue;
  }

  let next = queue;
  const banId = overlayBanId(item);

  if (item.kind === 'result') {
    next = next.filter(
      (q) => overlayBanId(q) !== banId || q.kind === 'result',
    );
  }

  return [...next, item];
}

export function dequeueOverlay(queue: QueuedOverlay[]): QueuedOverlay[] {
  return queue.length <= 1 ? [] : queue.slice(1);
}

export function popOverlayHead(queue: QueuedOverlay[]): QueuedOverlay[] {
  return queue.slice(1);
}

export function removeOverlaysForBan(
  queue: QueuedOverlay[],
  banId: string,
  kinds?: QueuedOverlay['kind'][],
): QueuedOverlay[] {
  return queue.filter((q) => {
    if (overlayBanId(q) !== banId) return true;
    if (!kinds) return false;
    return !kinds.includes(q.kind);
  });
}

export function removeOverlayByKey(
  queue: QueuedOverlay[],
  key: string,
): QueuedOverlay[] {
  return queue.filter((q) => overlayQueueKey(q) !== key);
}
