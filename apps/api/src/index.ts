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

  server.listen(port, () => {
    console.log(`[api] 98+ API listening on :${port}`);
  });
}

start().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});