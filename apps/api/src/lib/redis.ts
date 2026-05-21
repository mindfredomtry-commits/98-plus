import Redis from 'ioredis';

const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const redis = new Redis(url);

export async function setCooldown(
  key: string,
  seconds: number,
): Promise<boolean> {
  const result = await redis.set(key, '1', 'EX', seconds, 'NX');
  return result === 'OK';
}

export async function hasCooldown(key: string): Promise<boolean> {
  return (await redis.exists(key)) === 1;
}

export async function incrDaily(key: string): Promise<number> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 86400);
  }
  return count;
}

export async function getDailyCount(key: string): Promise<number> {
  const v = await redis.get(key);
  return v ? parseInt(v, 10) : 0;
}
