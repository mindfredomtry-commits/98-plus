import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import {
  listFriends,
  searchFriend,
  touchFriendAfterShare,
} from '../services/friends.service';
import { touchPresence } from '../services/presence.service';
import { broadcastToUser } from '../websocket/hub';

export const friendsRouter = Router();
friendsRouter.use(requireAuth);

friendsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    await touchPresence(req.userId!);
    const friends = await listFriends(req.userId!);
    res.json({ friends: friends ?? [] });
  } catch (err) {
    console.error('[friends] GET / failed', err);
    res.json({ friends: [] });
  }
});

friendsRouter.get('/search', async (req: AuthRequest, res) => {
  const q = (req.query.q as string) ?? '';
  const result = await searchFriend(req.userId!, q);
  res.json(result);
});

friendsRouter.post('/touch-share', async (req: AuthRequest, res) => {
  const { targetUsername, recentChallenge } = req.body as {
    targetUsername?: string;
    recentChallenge?: string;
  };
  if (!targetUsername?.trim()) {
    res.status(400).json({ error: 'targetUsername required' });
    return;
  }
  await touchFriendAfterShare(
    req.userId!,
    targetUsername,
    recentChallenge,
  );
  const friends = await listFriends(req.userId!);
  broadcastToUser(req.userId!, { type: 'friends:updated', payload: { friends } });
  res.json({ friends });
});

friendsRouter.post('/presence', async (req: AuthRequest, res) => {
  await touchPresence(req.userId!);
  const friends = await listFriends(req.userId!);
  broadcastToUser(req.userId!, { type: 'friends:updated', payload: { friends } });
  res.json({ ok: true });
});
