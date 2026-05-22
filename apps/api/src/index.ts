import 'dotenv/config';
import http from 'http';
import { createApp } from './app';
import { initWebSocket } from './websocket/hub';
import { startBot } from './bot/index';
import { startScheduler } from './jobs/scheduler';
import waitRedis from './waitRedis.js';
const port = parseInt(process.env.API_PORT ?? '4000', 10);
const app = createApp();
const server = http.createServer(app);
await waitRedis(); // ждём, пока Redis станет доступен
initWebSocket(server);
startBot();
startScheduler();

server.listen(port, () => {
  console.log(`[api] 98+ API listening on :${port}`);
});
