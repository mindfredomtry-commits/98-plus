import { sanitizeFriendCard } from '@98plus/shared';
import { broadcastToUser } from '../websocket/hub';
import { listSocialGraph } from './social-graph.service';

/** Push refreshed friend cards over WebSocket (avoids invite ↔ friends import cycle). */
export async function pushFriendsGraphRefresh(userId: string) {
  const graph = await listSocialGraph(userId);
  const friends = graph
    .map((c) => sanitizeFriendCard(c))
    .filter((c): c is NonNullable<typeof c> => c !== null);
  broadcastToUser(userId, { type: 'friends:updated', payload: { friends } });
}
