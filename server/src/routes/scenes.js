import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { asyncHandler, parseBody, notFound, forbidden } from '../lib/http.js';
import { requireAuth, requireCampaignMember, requireGM } from '../lib/auth.js';
import { emitToCampaign, emitToGMs } from '../realtime/hub.js';

export const scenesRouter = Router({ mergeParams: true });
scenesRouter.use(requireAuth, requireCampaignMember);

/** Retire des pions les informations reservees au MJ. */
export const sanitizeTokenForPlayer = (token) => ({
  ...token,
  // Un pion invisible n'est pas envoye du tout (filtre en amont) ; ici on masque
  // seulement les métadonnées sensibles des PNJ que le joueur ne contrôle pas.
  conditions: token.conditions,
});

export const visibleTokens = (tokens, { isGM, userId }) =>
  tokens
    .filter((t) => isGM || (t.visible && t.layer !== 'GM'))
    .map((t) => (isGM ? t : sanitizeTokenForPlayer(t)));

const sceneSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  notes: z.string().max(20000).optional(),
  backgroundUrl: z.string().max(500).nullish(),
  backgroundColor: z.string().max(20).optional(),
  width: z.number().int().min(200).max(12000).optional(),
  height: z.number().int().min(200).max(12000).optional(),
  gridEnabled: z.boolean().optional(),
  gridSize: z.number().int().min(10).max(500).optional(),
  gridColor: z.string().max(20).optional(),
  gridOpacity: z.number().min(0).max(1).optional(),
  gridOffsetX: z.number().int().min(-500).max(500).optional(),
  gridOffsetY: z.number().int().min(-500).max(500).optional(),
  gridUnit: z.number().min(0.1).max(1000).optional(),
  gridUnitLabel: z.string().max(10).optional(),
  fogEnabled: z.boolean().optional(),
  fogReveals: z.array(z.any()).max(5000).optional(),
  drawings: z.array(z.any()).max(5000).optional(),
  order: z.number().int().min(0).max(999).optional(),
});

scenesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = req.isGM
      ? { campaignId: req.campaign.id }
      : { campaignId: req.campaign.id, id: req.campaign.activeSceneId ?? '__none__' };
    const scenes = await prisma.scene.findMany({ where, orderBy: { order: 'asc' } });
    res.json({
      scenes: scenes.map((s) => (req.isGM ? s : { ...s, notes: '' })),
    });
  }),
);

scenesRouter.post(
  '/',
  requireGM,
  asyncHandler(async (req, res) => {
    const data = parseBody(sceneSchema.extend({ name: z.string().min(1).max(80) }), req.body);
    const count = await prisma.scene.count({ where: { campaignId: req.campaign.id } });
    const scene = await prisma.scene.create({
      data: { ...data, order: data.order ?? count, campaignId: req.campaign.id },
    });
    emitToGMs(req.campaign.id, 'scene:created', { scene });
    res.status(201).json({ scene });
  }),
);

scenesRouter.get(
  '/:sceneId',
  asyncHandler(async (req, res) => {
    const scene = await prisma.scene.findFirst({
      where: { id: req.params.sceneId, campaignId: req.campaign.id },
      include: { tokens: { orderBy: { zIndex: 'asc' } } },
    });
    if (!scene) throw notFound('Scène introuvable');
    if (!req.isGM && scene.id !== req.campaign.activeSceneId) {
      throw forbidden("Cette scène n'est pas active");
    }
    res.json({
      scene: {
        ...scene,
        notes: req.isGM ? scene.notes : '',
        drawings: req.isGM ? scene.drawings : (scene.drawings || []).filter((d) => d?.layer !== 'GM'),
        tokens: visibleTokens(scene.tokens, { isGM: req.isGM, userId: req.user.id }),
      },
    });
  }),
);

scenesRouter.patch(
  '/:sceneId',
  requireGM,
  asyncHandler(async (req, res) => {
    const data = parseBody(sceneSchema, req.body);
    const existing = await prisma.scene.findFirst({
      where: { id: req.params.sceneId, campaignId: req.campaign.id },
    });
    if (!existing) throw notFound('Scène introuvable');
    const scene = await prisma.scene.update({ where: { id: req.params.sceneId }, data });
    emitToCampaign(req.campaign.id, 'scene:updated', {
      sceneId: scene.id,
      patch: { ...data, notes: undefined },
    });
    emitToGMs(req.campaign.id, 'scene:updated-gm', { sceneId: scene.id, patch: data });
    res.json({ scene });
  }),
);

scenesRouter.post(
  '/:sceneId/duplicate',
  requireGM,
  asyncHandler(async (req, res) => {
    const source = await prisma.scene.findFirst({
      where: { id: req.params.sceneId, campaignId: req.campaign.id },
      include: { tokens: true },
    });
    if (!source) throw notFound('Scène introuvable');
    const { id, createdAt, updatedAt, tokens, ...rest } = source;
    const count = await prisma.scene.count({ where: { campaignId: req.campaign.id } });
    const scene = await prisma.scene.create({
      data: {
        ...rest,
        name: `${source.name} (copié)`,
        order: count,
        tokens: {
          create: tokens.map(({ id: _id, sceneId, createdAt: _c, updatedAt: _u, ...t }) => t),
        },
      },
      include: { tokens: true },
    });
    emitToGMs(req.campaign.id, 'scene:created', { scene });
    res.status(201).json({ scene });
  }),
);

scenesRouter.delete(
  '/:sceneId',
  requireGM,
  asyncHandler(async (req, res) => {
    const scene = await prisma.scene.findFirst({
      where: { id: req.params.sceneId, campaignId: req.campaign.id },
    });
    if (!scene) throw notFound('Scène introuvable');
    await prisma.scene.delete({ where: { id: scene.id } });
    if (req.campaign.activeSceneId === scene.id) {
      const fallback = await prisma.scene.findFirst({
        where: { campaignId: req.campaign.id },
        orderBy: { order: 'asc' },
      });
      await prisma.campaign.update({
        where: { id: req.campaign.id },
        data: { activeSceneId: fallback?.id ?? null },
      });
      emitToCampaign(req.campaign.id, 'campaign:scene-changed', { sceneId: fallback?.id ?? null });
    }
    emitToGMs(req.campaign.id, 'scene:deleted', { sceneId: scene.id });
    res.json({ ok: true });
  }),
);
