import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { asyncHandler, parseBody } from '../lib/http.js';
import { requireAuth, requireCampaignMember } from '../lib/auth.js';

export const chatRouter = Router({ mergeParams: true });
chatRouter.use(requireAuth, requireCampaignMember);

chatRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { before, limit } = parseBody(
      z.object({ before: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).default(80) }),
      req.query,
    );
    const messages = await prisma.chatMessage.findMany({
      where: {
        campaignId: req.campaign.id,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
        ...(req.isGM
          ? {}
          : { OR: [{ whisperTo: null }, { whisperTo: req.user.id }, { userId: req.user.id }] }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });
    res.json({ messages: messages.reverse() });
  }),
);

chatRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.isGM) return res.status(403).json({ error: 'Action réservée au MJ' });
    await prisma.chatMessage.deleteMany({ where: { campaignId: req.campaign.id } });
    res.json({ ok: true });
  }),
);
