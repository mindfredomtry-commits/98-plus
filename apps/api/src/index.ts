import 'dotenv/config';
import http from 'http';
import { createApp } from './app';
import { initWebSocket } from './websocket/hub';
import { startBot } from './bot/index';
import { startScheduler } from './jobs/scheduler';
import waitRedis from './waitRedis.js';

const port = parseInt(process.env.API_PORT ?? '4000', 10);

async function start() {
  await waitRedis();

  const app = createApp();
  const server = http.createServer(app);

  initWebSocket(server);
  startBot();
  startScheduler();
  const { hydrateCheckDueTimers } = await import('./services/ban.service');
  void hydrateCheckDueTimers().catch((e) => {
    console.warn('[check-timer] hydrate failed', (e as Error).message);
  });
  const { runResultSeenBackfillOnce } = await import(
    './services/result-seen-backfill'
  );
  void runResultSeenBackfillOnce().catch((e) => {
    console.warn('[backfill-result-seen] failed', (e as Error).message);
  });

  server.listen(port, () => {
    console.log(`[api] 98+ API listening on :${port}`);
  });
}

start().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});