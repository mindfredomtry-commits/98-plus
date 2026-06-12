import type { QueuedOverlay } from '@/lib/overlay-queue';

export function countQueuedOverlaysByKind(items: QueuedOverlay[]) {
  return {
    incoming: items.filter((i) => i.kind === 'incoming').length,
    check: items.filter((i) => i.kind === 'check').length,
    result: items.filter((i) => i.kind === 'result').length,
    total: items.length,
  };
}

export function logQueueDebug(
  stage: string,
  extra?: Record<string, unknown>,
): void {
  console.log(`[queue-debug] ${stage}`, extra ?? {});
}
