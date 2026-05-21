import { Router } from 'express';
import { SELF_BAN_DAILY_LIMIT } from '@98plus/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { mapUser } from '../services/user-mapper';
import { applySelfBanReward } from '../services/energy.service';
import { broadcastEnergyPopup } from '../websocket/hub';
import { getDailyCount, incrDaily } from '../lib/redis';

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get('/me', async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
  });
  if (!user) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ user: mapUser(user) });
});

usersRouter.post('/onboard', async (req: AuthRequest, res) => {
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { isOnboarded: true },
  });
  res.json({ user: mapUser(user) });
});

usersRouter.get('/profile/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      selfBans: {
        where: { isPublic: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });
  if (!user) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const recentBans = await prisma.ban.findMany({
    where: {
      OR: [{ senderId: user.id }, { receiverId: user.id }],
      status: 'COMPLETED',
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { sender: true, receiver: true },
  });

  const strongest = await prisma.ban.findMany({
    where: {
      OR: [{ senderId: user.id }, { receiverId: user.id }],
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });

  res.json({
    user: mapUser(user),
    publicSelfBans: user.selfBans.map((s) => ({
      id: s.id,
      text: s.text,
      isPublic: s.isPublic,
      createdAt: s.createdAt.toISOString(),
    })),
    recentBans: recentBans.map((b) => ({
      id: b.id,
      text: b.text,
      createdAt: b.createdAt.toISOString(),
    })),
    strongestInteractions: strongest.map((b) => ({
      id: b.id,
      text: b.text,
    })),
  });
});

usersRouter.get('/self-bans', async (req: AuthRequest, res) => {
  const items = await prisma.selfBan.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  res.json({
    items: items.map((s) => ({
      id: s.id,
      text: s.text,
      isPublic: s.isPublic,
      createdAt: s.createdAt.toISOString(),
    })),
  });
});

usersRouter.post('/self-bans', async (req: AuthRequest, res) => {
  const { text, isPublic } = req.body as {
    text?: string;
    isPublic?: boolean;
  };

  if (!text?.trim()) {
    res.status(400).json({ error: 'Text required' });
    return;
  }

  const count = await getDailyCount(`daily:selfban:${req.userId}`);
  if (count >= SELF_BAN_DAILY_LIMIT) {
    res.status(429).json({ error: 'Лимит self-ban на сегодня.' });
    return;
  }

  const item = await prisma.selfBan.create({
    data: {
      userId: req.userId!,
      text: text.trim(),
      isPublic: !!isPublic,
    },
  });

  await incrDaily(`daily:selfban:${req.userId}`);
  const delta = await applySelfBanReward(req.userId!, !!isPublic);
  broadcastEnergyPopup(req.userId!, delta, '🚫 Self-ban принят.');

  res.json({
    item: {
      id: item.id,
      text: item.text,
      isPublic: item.isPublic,
      createdAt: item.createdAt.toISOString(),
    },
    energyDelta: delta,
  });
});
