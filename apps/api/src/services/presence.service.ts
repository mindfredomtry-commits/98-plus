import { redis } from '../lib/redis';

const PRESENCE_TTL = 90;

export async function touchPresence(userId: string): Promise<void> {
  await redis.set(`presence:${userId}`, Date.now().toString(), 'EX', PRESENCE_TTL);
}

export async function getPresence(userId: string): Promise<'online' | 'recent' | 'offline'> {
  const v = await redis.get(`presence:${userId}`);
  if (!v) return 'offline';
  const age = Date.now() - parseInt(v, 10);
  if (age < 60_000) return 'online';
  if (age < 300_000) return 'recent';
  return 'offline';
}

export async function getPresenceBatch(
  userIds: string[],
): Promise<Record<string, 'online' | 'recent' | 'offline'>> {
  const out: Record<string, 'online' | 'recent' | 'offline'> = {};
  if (userIds.length === 0) return out;

  const unique = [...new Set(userIds)];
  try {
    const pipeline = redis.pipeline();
    for (const id of unique) {
      pipeline.get(`presence:${id}`);
    }
    const results = await pipeline.exec();
    const now = Date.now();
    unique.forEach((id, i) => {
      const row = results?.[i];
      const err = row?.[0];
      const v = row?.[1] as string | null | undefined;
      if (err || v == null || v === '') {
        out[id] = 'offline';
        return;
      }
      const age = now - parseInt(v, 10);
      if (age < 60_000) out[id] = 'online';
      else if (age < 300_000) out[id] = 'recent';
      else out[id] = 'offline';
    });
  } catch {
    for (const id of unique) out[id] = 'offline';
  }
  return out;
}
