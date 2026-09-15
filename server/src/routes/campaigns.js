import { Router } from 'express';
import { z } from 'zod';
import { customAlphabet } from 'nanoid';
import { prisma } from '../lib/db.js';
import { asyncHandler, parseBody, notFound, forbidden, conflict, badRequest } from '../lib/http.js';
import { requireAuth, requireCampaignMember, requireGM } from '../lib/auth.js';
import { emitToCampaign } from '../realtime/hub.js';

export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

// Alphabet sans caracteres ambigus (0/O, 1/I) pour les codes lus à voix haute.
const makeJoinCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

const campaignSummary = (campaign, userId) => ({
  id: campaign.id,
  name: campaign.name,
  description: campaign.description,
  system: campaign.system,
  bannerUrl: campaign.bannerUrl,
  joinCode: campaign.gmId === userId ? campaign.joinCode : undefined,
  gmId: campaign.gmId,
  gm: campaign.gm ? { id: campaign.gm.id, username: campaign.gm.username, avatarUrl: campaign.gm.avatarUrl } : undefined,
  activeSceneId: campaign.activeSceneId,
  isGM: campaign.gmId === userId,
  memberCount: campaign.members?.length ?? campaign._count?.members,
  sceneCount: campaign._count?.scenes,
  createdAt: campaign.createdAt,
  updatedAt: campaign.updatedAt,
});

campaignsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const campaigns = await prisma.campaign.findMany({
      where: { members: { some: { userId: req.user.id } } },
      include: { gm: true, _count: { select: { members: true, scenes: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ campaigns: campaigns.map((c) => campaignSummary(c, req.user.id)) });
  }),
);

campaignsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(
      z.object({
        name: z.string().min(1, 'Nom requis').max(80),
        description: z.string().max(4000).default(''),
        system: z.string().max(40).default('dnd5e'),
      }),
      req.body,
    );

    let joinCode = makeJoinCode();
    for (let i = 0; i < 5; i += 1) {
      const clash = await prisma.campaign.findUnique({ where: { joinCode } });
      if (!clash) break;
      joinCode = makeJoinCode();
    }

    const campaign = await prisma.campaign.create({
      data: {
        ...data,
        joinCode,
        gmId: req.user.id,
        members: { create: { userId: req.user.id, role: 'GM' } },
        combat: { create: {} },
        scenes: {
          create: {
            name: 'Première scène',
            order: 0,
            notes: "Décrivez ici l'ambiance, les PNJ présents, les secrets du lieu.",
          },
        },
      },
      include: { gm: true, scenes: true, members: true },
    });
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { activeSceneId: campaign.scenes[0].id },
    });
    res.status(201).json({ campaign: campaignSummary({ ...campaign, activeSceneId: campaign.scenes[0].id }, req.user.id) });
  }),
);

campaignsRouter.post(
  '/join',
  asyncHandler(async (req, res) => {
    const { joinCode } = parseBody(z.object({ joinCode: z.string().min(4).max(12) }), req.body);
    const campaign = await prisma.campaign.findUnique({
      where: { joinCode: joinCode.trim().toUpperCase() },
      include: { gm: true, members: true },
    });
    if (!campaign) throw notFound('Aucune partie ne correspond à ce code');
    if (campaign.members.some((m) => m.userId === req.user.id)) {
      return res.json({ campaign: campaignSummary(campaign, req.user.id), alreadyMember: true });
    }
    await prisma.membership.create({ data: { campaignId: campaign.id, userId: req.user.id } });
    emitToCampaign(campaign.id, 'campaign:member-joined', {
      user: { id: req.user.id, username: req.user.username, avatarUrl: req.user.avatarUrl },
    });
    res.status(201).json({ campaign: campaignSummary(campaign, req.user.id) });
  }),
);

campaignsRouter.get(
  '/:campaignId',
  requireCampaignMember,
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.campaignId },
      include: {
        gm: true,
        members: { include: { user: { select: { id: true, username: true, avatarUrl: true, lastSeenAt: true } } } },
        scenes: { orderBy: { order: 'asc' }, select: { id: true, name: true, order: true, backgroundUrl: true, width: true, height: true } },
        combat: true,
      },
    });
    const visibleScenes = req.isGM ? campaign.scenes : campaign.scenes.filter((s) => s.id === campaign.activeSceneId);
    res.json({
      campaign: {
        ...campaignSummary(campaign, req.user.id),
        members: campaign.members.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          color: m.color,
          joinedAt: m.joinedAt,
          username: m.user.username,
          avatarUrl: m.user.avatarUrl,
        })),
        scenes: visibleScenes,
        combat: campaign.combat,
      },
    });
  }),
);

campaignsRouter.patch(
  '/:campaignId',
  requireCampaignMember,
  requireGM,
  asyncHandler(async (req, res) => {
    const data = parseBody(
      z.object({
        name: z.string().min(1).max(80).optional(),
        description: z.string().max(4000).optional(),
        bannerUrl: z.string().max(500).nullish(),
        activeSceneId: z.string().nullish(),
      }),
      req.body,
    );
    if (data.activeSceneId) {
      const scene = await prisma.scene.findFirst({
        where: { id: data.activeSceneId, campaignId: req.params.campaignId },
      });
      if (!scene) throw badRequest("Cette scène n'appartient pas à la campagne");
    }
    const campaign = await prisma.campaign.update({ where: { id: req.params.campaignId }, data });
    if (data.activeSceneId !== undefined) {
      emitToCampaign(campaign.id, 'campaign:scene-changed', { sceneId: campaign.activeSceneId });
    }
    emitToCampaign(campaign.id, 'campaign:updated', { campaign: campaignSummary(campaign, req.user.id) });
    res.json({ campaign: campaignSummary(campaign, req.user.id) });
  }),
);

campaignsRouter.post(
  '/:campaignId/regenerate-code',
  requireCampaignMember,
  requireGM,
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.update({
      where: { id: req.params.campaignId },
      data: { joinCode: makeJoinCode() },
    });
    res.json({ joinCode: campaign.joinCode });
  }),
);

campaignsRouter.patch(
  '/:campaignId/members/:userId',
  requireCampaignMember,
  requireGM,
  asyncHandler(async (req, res) => {
    const data = parseBody(
      z.object({ role: z.enum(['GM', 'PLAYER']).optional(), color: z.string().max(20).optional() }),
      req.body,
    );
    if (req.params.userId === req.campaign.gmId && data.role === 'PLAYER') {
      throw conflict('Le createur de la campagne reste Maître du Jeu');
    }
    const membership = await prisma.membership.update({
      where: { campaignId_userId: { campaignId: req.params.campaignId, userId: req.params.userId } },
      data,
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });
    emitToCampaign(req.params.campaignId, 'campaign:member-updated', { membership });
    res.json({ membership });
  }),
);

campaignsRouter.delete(
  '/:campaignId/members/:userId',
  requireCampaignMember,
  asyncHandler(async (req, res) => {
    const targetId = req.params.userId;
    const selfLeaving = targetId === req.user.id;
    if (!selfLeaving && !req.isGM) throw forbidden('Seul le MJ peut exclure un joueur');
    if (targetId === req.campaign.gmId) throw conflict('Le MJ ne peut pas quitter sa propre campagne');
    await prisma.membership.delete({
      where: { campaignId_userId: { campaignId: req.params.campaignId, userId: targetId } },
    });
    emitToCampaign(req.params.campaignId, 'campaign:member-left', { userId: targetId });
    res.json({ ok: true });
  }),
);

campaignsRouter.delete(
  '/:campaignId',
  requireCampaignMember,
  asyncHandler(async (req, res) => {
    if (req.campaign.gmId !== req.user.id) throw forbidden('Seul le createur peut supprimer la campagne');
    await prisma.campaign.delete({ where: { id: req.params.campaignId } });
    emitToCampaign(req.params.campaignId, 'campaign:deleted', { campaignId: req.params.campaignId });
    res.json({ ok: true });
  }),
);
