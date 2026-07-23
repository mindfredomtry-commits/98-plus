import { prisma } from '../lib/prisma';

/**
 * Legacy product / server analytics write-path.
 * Compatible with incomplete payloads — does not call Studio Tracker V2.
 */
export async function trackEvent(
  name: string,
  userId?: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.analyticsEvent.create({
      data: {
        name,
        userId: userId ?? null,
        meta: meta ? (meta as object) : undefined,
      },
    });
  } catch (e) {
    console.error('[analytics]', name, e);
  }
}

export async function getAlphaStats() {
  const since = new Date(Date.now() - 7 * 86400000);
  const events = await prisma.analyticsEvent.groupBy({
    by: ['name'],
    where: { createdAt: { gte: since } },
    _count: { name: true },
  });
  return events.map((e) => ({ name: e.name, count: e._count.name }));
}
