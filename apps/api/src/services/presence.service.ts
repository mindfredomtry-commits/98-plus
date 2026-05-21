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
  await Promise.all(
    userIds.map(async (id) => {
      out[id] = await getPresence(id);
    }),
  );
  return out;
}
