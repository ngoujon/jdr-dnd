import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { asyncHandler, parseBody, notFound } from '../lib/http.js';
import { requireAuth, requireCampaignMember, requireGM } from '../lib/auth.js';
import { emitToCampaign, emitToUser } from '../realtime/hub.js';

export const handoutsRouter = Router({ mergeParams: true });
handoutsRouter.use(requireAuth, requireCampaignMember);

const handoutSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  content: z.string().max(60000).optional(),
  imageUrl: z.string().max(500).nullish(),
  isPublic: z.boolean().optional(),
  sharedWith: z.array(z.string()).max(50).optional(),
  order: z.number().int().min(0).max(9999).optional(),
});

const isVisibleTo = (handout, userId) => handout.isPublic || handout.sharedWith.includes(userId);

handoutsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const handouts = await prisma.handout.findMany({
      where: { campaignId: req.campaign.id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ handouts: req.isGM ? handouts : handouts.filter((h) => isVisibleTo(h, req.user.id)) });
  }),
);

handoutsRouter.post(
  '/',
  requireGM,
  asyncHandler(async (req, res) => {
    const data = parseBody(handoutSchema.extend({ title: z.string().min(1).max(120) }), req.body);
    const count = await prisma.handout.count({ where: { campaignId: req.campaign.id } });
    const handout = await prisma.handout.create({
      data: { ...data, order: data.order ?? count, campaignId: req.campaign.id },
    });
    if (handout.isPublic) emitToCampaign(req.campaign.id, 'handout:shared', { handout });
    res.status(201).json({ handout });
  }),
);

handoutsRouter.patch(
  '/:handoutId',
  requireGM,
  asyncHandler(async (req, res) => {
    const existing = await prisma.handout.findFirst({
      where: { id: req.params.handoutId, campaignId: req.campaign.id },
    });
    if (!existing) throw notFound('Document introuvable');
    const data = parseBody(handoutSchema, req.body);
    const handout = await prisma.handout.update({ where: { id: existing.id }, data });

    if (handout.isPublic) {
      emitToCampaign(req.campaign.id, 'handout:shared', { handout });
    } else {
      for (const userId of handout.sharedWith) emitToUser(userId, 'handout:shared', { handout });
      const revoked = existing.sharedWith.filter((id) => !handout.sharedWith.includes(id));
      for (const userId of revoked) emitToUser(userId, 'handout:revoked', { handoutId: handout.id });
      if (existing.isPublic) emitToCampaign(req.campaign.id, 'handout:revoked', { handoutId: handout.id });
    }
    res.json({ handout });
  }),
);

handoutsRouter.delete(
  '/:handoutId',
  requireGM,
  asyncHandler(async (req, res) => {
    const existing = await prisma.handout.findFirst({
      where: { id: req.params.handoutId, campaignId: req.campaign.id },
    });
    if (!existing) throw notFound('Document introuvable');
    await prisma.handout.delete({ where: { id: existing.id } });
    emitToCampaign(req.campaign.id, 'handout:revoked', { handoutId: existing.id });
    res.json({ ok: true });
  }),
);
