import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { verifyToken } from '../lib/jwt';
import { randomUUID } from 'crypto';
import { touchPresence } from '../services/presence.service';
import { listFriends } from '../services/friends.service';

const clients = new Map<string, Set<WebSocket>>();
const PING_MS = 25_000;

export function initWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  const pingInterval = setInterval(() => {
    for (const [, set] of clients) {
      for (const ws of set) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', eventId: randomUUID() }));
        }
      }
    }
  }, PING_MS);

  wss.on('close', () => clearInterval(pingInterval));

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const { userId } = payload;
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId)!.add(ws);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string };
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', eventId: randomUUID() }));
        }
      } catch {
        /* ignore */
      }
    });

    ws.on('close', () => {
      clients.get(userId)?.delete(ws);
      if (clients.get(userId)?.size === 0) clients.delete(userId);
    });

    touchPresence(userId).catch(() => {});

    ws.send(
      JSON.stringify({
        type: 'connected',
        eventId: randomUUID(),
        payload: { userId },
      }),
    );

    listFriends(userId)
      .then((friends) => {
        ws.send(
          JSON.stringify({
            type: 'friends:updated',
            eventId: randomUUID(),
            payload: { friends },
          }),
        );
      })
      .catch(() => {});
  });

  return wss;
}

export function broadcastToUser(
  userId: string,
  event: { type: string; payload: unknown; eventId?: string },
): void {
  const set = clients.get(userId);
  if (!set) return;
  const msg = JSON.stringify({
    ...event,
    eventId: event.eventId ?? randomUUID(),
  });
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

export function broadcastEnergyPopup(
  userId: string,
  delta: number,
  message?: string,
): void {
  broadcastToUser(userId, {
    type: 'energy:popup',
    payload: {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      delta,
      message,
    },
  });
}

export function getConnectedUserIds(): string[] {
  return [...clients.keys()];
}
