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

/**
 * Historique d'une conversation privée avec un autre membre.
 *
 * Le fil général n'est chargé que sur ses derniers messages : rouvrir une
 * conversation doit en retrouver le contenu même s'il a défilé depuis
 * longtemps. On ne renvoie que les messages échangés entre l'appelant et son
 * correspondant, quel que soit le rôle de l'appelant.
 */
chatRouter.get(
  '/conversations/:userId',
  asyncHandler(async (req, res) => {
    const { limit } = parseBody(
      z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) }),
      req.query,
    );
    const other = req.params.userId;
    const messages = await prisma.chatMessage.findMany({
      where: {
        campaignId: req.campaign.id,
        OR: [
          { userId: req.user.id, whisperTo: other },
          { userId: other, whisperTo: req.user.id },
        ],
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
