import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { asyncHandler, parseBody, notFound, forbidden } from '../lib/http.js';
import { requireAuth, requireCampaignMember } from '../lib/auth.js';
import { emitToCampaign, emitToGMs } from '../realtime/hub.js';

export const tokensRouter = Router({ mergeParams: true });
tokensRouter.use(requireAuth, requireCampaignMember);

const tokenSchema = z.object({
  name: z.string().max(60).optional(),
  imageUrl: z.string().max(500).nullish(),
  style: z.record(z.any()).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().min(4).max(4000).optional(),
  height: z.number().min(4).max(4000).optional(),
  rotation: z.number().min(-360).max(360).optional(),
  layer: z.enum(['BACKGROUND', 'OBJECT', 'TOKEN', 'GM']).optional(),
  zIndex: z.number().int().optional(),
  characterId: z.string().nullish(),
  ownerId: z.string().nullish(),
  hp: z.number().int().nullish(),
  maxHp: z.number().int().nullish(),
  ac: z.number().int().nullish(),
  conditions: z.array(z.string().max(40)).max(30).optional(),
  showNameplate: z.boolean().optional(),
  showHealthBar: z.boolean().optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  auraRadius: z.number().min(0).max(500).optional(),
  auraColor: z.string().max(20).optional(),
  lightRadius: z.number().min(0).max(500).optional(),
});

/** Un joueur ne peut manipuler que les pions qu'il possede (ou lies a son perso). */
const assertCanEdit = async (req, token) => {
  if (req.isGM) return;
  if (token.locked) throw forbidden('Ce pion est verrouillé par le MJ');
  if (token.ownerId === req.user.id) return;
  if (token.characterId) {
    const character = await prisma.character.findUnique({ where: { id: token.characterId } });
    if (character?.ownerId === req.user.id) return;
  }
  throw forbidden("Ce pion ne vous appartient pas");
};

const loadToken = async (req) => {
  const token = await prisma.token.findFirst({
    where: { id: req.params.tokenId, scene: { campaignId: req.campaign.id } },
  });
  if (!token) throw notFound('Pion introuvable');
  return token;
};

const broadcastToken = (campaignId, event, token) => {
  if (token.visible && token.layer !== 'GM') {
    emitToCampaign(campaignId, event, { token });
  } else {
    emitToGMs(campaignId, event, { token });
  }
};

tokensRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(tokenSchema.extend({ sceneId: z.string() }), req.body);
    const scene = await prisma.scene.findFirst({
      where: { id: data.sceneId, campaignId: req.campaign.id },
    });
    if (!scene) throw notFound('Scène introuvable');
    if (!req.isGM) {
      // Un joueur ne peut deposer qu'un pion de son propre personnage.
      if (!data.characterId) throw forbidden('Seul le MJ peut créer des pions libres');
      const character = await prisma.character.findFirst({
        where: { id: data.characterId, ownerId: req.user.id },
      });
      if (!character) throw forbidden("Ce personnage n'est pas le votre");
      data.ownerId = req.user.id;
      data.layer = 'TOKEN';
      data.visible = true;
    }
    const maxZ = await prisma.token.aggregate({
      where: { sceneId: scene.id },
      _max: { zIndex: true },
    });
    const token = await prisma.token.create({
      data: { ...data, zIndex: data.zIndex ?? (maxZ._max.zIndex ?? 0) + 1 },
    });
    broadcastToken(req.campaign.id, 'token:created', token);
    res.status(201).json({ token });
  }),
);

tokensRouter.patch(
  '/:tokenId',
  asyncHandler(async (req, res) => {
    const existing = await loadToken(req);
    await assertCanEdit(req, existing);
    let data = parseBody(tokenSchema, req.body);
    if (!req.isGM) {
      // Les joueurs ne changent ni la visibilite, ni le verrou, ni le calque.
      const { visible, locked, layer, ownerId, ...allowed } = data;
      data = allowed;
    }
    const token = await prisma.token.update({ where: { id: existing.id }, data });
    const becameHidden = existing.visible && !token.visible;
    if (becameHidden) emitToCampaign(req.campaign.id, 'token:removed', { tokenId: token.id });
    broadcastToken(req.campaign.id, 'token:updated', token);
    res.json({ token });
  }),
);

/** Deplacement en masse (drag multi-selection). */
tokensRouter.post(
  '/move',
  asyncHandler(async (req, res) => {
    const { moves } = parseBody(
      z.object({
        moves: z
          .array(z.object({ id: z.string(), x: z.number(), y: z.number(), rotation: z.number().optional() }))
          .min(1)
          .max(100),
      }),
      req.body,
    );
    const ids = moves.map((m) => m.id);
    const tokens = await prisma.token.findMany({
      where: { id: { in: ids }, scene: { campaignId: req.campaign.id } },
    });
    const updated = [];
    for (const move of moves) {
      const token = tokens.find((t) => t.id === move.id);
      if (!token) continue;
      await assertCanEdit(req, token);
      updated.push(
        await prisma.token.update({
          where: { id: token.id },
          data: { x: move.x, y: move.y, ...(move.rotation != null ? { rotation: move.rotation } : {}) },
        }),
      );
    }
    for (const token of updated) broadcastToken(req.campaign.id, 'token:updated', token);
    res.json({ tokens: updated });
  }),
);

tokensRouter.delete(
  '/:tokenId',
  asyncHandler(async (req, res) => {
    const token = await loadToken(req);
    await assertCanEdit(req, token);
    await prisma.token.delete({ where: { id: token.id } });
    emitToCampaign(req.campaign.id, 'token:removed', { tokenId: token.id });
    res.json({ ok: true });
  }),
);
