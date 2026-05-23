import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL is not set');
}

const redis = new Redis(redisUrl);

// функция, которая ждёт, пока Redis станет доступен
async function waitRedis(timeout = 30000) { // 30 секунд
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await redis.ping();
      console.log("✅ Redis доступен!");
      return;
    } catch (err) {
      console.log("Redis ещё не доступен, пробуем снова...");
      await new Promise(r => setTimeout(r, 1000)); // ждём 1 секунду
    }
  }
  throw new Error("❌ Redis не стал доступен за 30 секунд");
}

// экспортируем функцию для использования в старте API
export default waitRedis;