import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { asyncHandler, parseBody, notFound, forbidden } from '../lib/http.js';
import { requireAuth, requireCampaignMember } from '../lib/auth.js';
import { emitToCampaign, emitToGMs, emitToPlayers } from '../realtime/hub.js';
import { playerControlledIds, sanitizeTokenForPlayer } from '../lib/tokens.js';

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
  speed: z.number().int().min(0).max(999).nullish(),
  conditions: z.array(z.string().max(40)).max(30).optional(),
  hpLog: z.array(z.any()).max(100).optional(),
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

/** Le MJ recoit le pion complet ; les joueurs, une version sans ses PV s'il
 *  n'est pas controle par un joueur (et rien du tout s'il est cache). */
const broadcastToken = async (campaign, event, token) => {
  emitToGMs(campaign.id, event, { token });
  if (!token.visible || token.layer === 'GM') return;
  const controlled = await playerControlledIds([token], campaign.gmId);
  emitToPlayers(campaign.id, event, { token: sanitizeTokenForPlayer(token, controlled.has(token.id)) });
};

/** Reponse HTTP : meme filtrage que la diffusion temps reel. */
const tokenFor = async (req, token) => {
  if (req.isGM) return token;
  const controlled = await playerControlledIds([token], req.campaign.gmId);
  return sanitizeTokenForPlayer(token, controlled.has(token.id));
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
    await broadcastToken(req.campaign, 'token:created', token);
    res.status(201).json({ token: await tokenFor(req, token) });
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
      const { visible, locked, layer, ownerId, hpLog, ...allowed } = data;
      data = allowed;
    }
    // Une saisie directe des PV entre aussi dans l'historique du MJ.
    if (data.hp != null && existing.hp != null && data.hp !== existing.hp && !data.hpLog) {
      const log = Array.isArray(existing.hpLog) ? existing.hpLog : [];
      const entry = { at: new Date().toISOString(), delta: data.hp - existing.hp, hp: data.hp, by: req.user.username };
      data.hpLog = [...log, entry].slice(-100);
    }
    const token = await prisma.token.update({ where: { id: existing.id }, data });
    const becameHidden = existing.visible && !token.visible;
    if (becameHidden) emitToCampaign(req.campaign.id, 'token:removed', { tokenId: token.id });
    await broadcastToken(req.campaign, 'token:updated', token);
    res.json({ token: await tokenFor(req, token) });
  }),
);

/**
 * Degats (delta negatif) ou soins (positif) sur un pion, journalises pour le
 * suivi du MJ. Les PV sont bornes entre 0 et le maximum quand il est connu.
 */
tokensRouter.post(
  '/:tokenId/hp',
  asyncHandler(async (req, res) => {
    const existing = await loadToken(req);
    await assertCanEdit(req, existing);
    const { delta } = parseBody(z.object({ delta: z.number().int().min(-9999).max(9999) }), req.body);
    if (!delta) return res.json({ token: await tokenFor(req, existing) });
    const before = existing.hp ?? existing.maxHp ?? 0;
    const max = existing.maxHp ?? Infinity;
    const hp = Math.max(0, Math.min(max, before + delta));
    const log = Array.isArray(existing.hpLog) ? existing.hpLog : [];
    const entry = { at: new Date().toISOString(), delta: hp - before, hp, by: req.user.username };
    const token = await prisma.token.update({
      where: { id: existing.id },
      data: { hp, hpLog: [...log, entry].slice(-100) },
    });
    await broadcastToken(req.campaign, 'token:updated', token);
    res.json({ token: await tokenFor(req, token) });
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
    for (const token of updated) await broadcastToken(req.campaign, 'token:updated', token);
    res.json({ tokens: await Promise.all(updated.map((t) => tokenFor(req, t))) });
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
