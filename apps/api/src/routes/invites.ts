import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { claimInviteByToken } from '../services/invite.service';
import { materializeRegisteredUser } from '../services/social-graph.service';
import { pushFriendsGraphRefresh } from '../services/friends-sync';
import { getSessionState } from '../services/session.service';
import { mapUser } from '../services/user-mapper';

export const invitesRouter = Router();
invitesRouter.use(requireAuth);

const claimSchema = z.object({
  token: z.string().min(4).max(64),
});

invitesRouter.post('/claim', async (req: AuthRequest, res) => {
  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'token required' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
  });
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  try {
    const incoming = await claimInviteByToken(
      parsed.data.token,
      user.id,
      user.username,
    );

    if (!incoming) {
      res.status(404).json({
        error: 'Invite not found, expired, or already claimed',
      });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { isOnboarded: true },
    });

    await materializeRegisteredUser({
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      photoUrl: user.photoUrl,
    });

    if (incoming.sender?.id) {
      await pushFriendsGraphRefresh(incoming.sender.id);
    }
    await pushFriendsGraphRefresh(user.id);

    const session = await getSessionState(user.id, user.username);

    res.json({
      incoming,
      user: mapUser(user),
      viralOnboarding: true,
      needsOnboardingRecovery: true,
      session,
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
