import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { randomUUID } from 'crypto';
import { verifyToken } from '../lib/jwt';
import { redis } from '../lib/redis';
import { touchPresence } from '../services/presence.service';
import { listFriends } from '../services/friends.service';

const clients = new Map<string, Set<WebSocket>>();
const PING_MS = 25_000;
const WS_USER_EVENT_CHANNEL = 'ws:user-event';
const instanceId = randomUUID();

type UserWsEvent = {
  type: string;
  payload: unknown;
  eventId: string;
};

type UserEventMessage = {
  userId: string;
  event: UserWsEvent;
  origin: string;
};

function deliverToLocalClients(userId: string, event: UserWsEvent): number {
  const set = clients.get(userId);
  if (!set) return 0;
  const msg = JSON.stringify(event);
  let delivered = 0;
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
      delivered += 1;
    }
  }
  return delivered;
}

function initCrossInstanceBroadcast(): void {
  const sub = redis.duplicate();
  void sub.subscribe(WS_USER_EVENT_CHANNEL).catch((err: Error) => {
    console.warn('[ws] redis subscribe failed', err.message);
  });
  sub.on('message', (_channel, raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as UserEventMessage;
      if (msg.origin === instanceId) return;
      deliverToLocalClients(msg.userId, msg.event);
    } catch {
      /* ignore malformed */
    }
  });
}

export function initWebSocket(server: Server): WebSocketServer {
  initCrossInstanceBroadcast();

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

    console.log('[ws-connected]', { userId, sockets: clients.get(userId)!.size });

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
): { delivered: number; published: boolean } {
  const fullEvent: UserWsEvent = {
    type: event.type,
    payload: event.payload,
    eventId: event.eventId ?? randomUUID(),
  };

  const delivered = deliverToLocalClients(userId, fullEvent);

  if (event.type === 'ban:incoming') {
    const payload = fullEvent.payload as {
      id?: string;
      receiver?: { id?: string };
    };
    console.log('BACKEND EMIT INCOMING', {
      banId: payload?.id ?? null,
      receiverId: payload?.receiver?.id ?? userId,
      toUserId: userId,
      delivered,
      published: true,
    });
  }

  const message: UserEventMessage = {
    userId,
    event: fullEvent,
    origin: instanceId,
  };
  void redis.publish(WS_USER_EVENT_CHANNEL, JSON.stringify(message)).catch((e) => {
    console.warn('[ws] redis publish failed', (e as Error).message);
  });

  return { delivered, published: true };
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

export function isUserConnectedLocally(userId: string): boolean {
  const set = clients.get(userId);
  if (!set) return false;
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) return true;
  }
  return false;
}
