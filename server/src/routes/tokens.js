import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { asyncHandler, parseBody, notFound, forbidden } from '../lib/http.js';
import { requireAuth, requireCampaignMember } from '../lib/auth.js';
import { emitToCampaign } from '../realtime/hub.js';
import { playerControlledIds, sanitizeTokenForPlayer } from '../lib/tokens.js';
import {
  applyHpDelta,
  broadcastToken,
  emitCharacterHp,
  syncCharacterFromToken,
  syncTokensFromCharacter,
} from '../lib/hpSync.js';

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
  isGmPawn: z.boolean().optional(),
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
    if (data.isGmPawn) {
      if (!req.isGM) throw forbidden('Seul le MJ a un pion de MJ');
      // Un seul pion de MJ par scene : un nouveau clic le ramene au point demande.
      const existing = await prisma.token.findFirst({ where: { sceneId: scene.id, isGmPawn: true } });
      if (existing) {
        // Ramene sous les autres pions, pour ne pas recouvrir celui d'un joueur.
        const minZ = await prisma.token.aggregate({
          where: { sceneId: scene.id, id: { not: existing.id } },
          _min: { zIndex: true },
        });
        const moved = await prisma.token.update({
          where: { id: existing.id },
          data: {
            x: data.x ?? existing.x,
            y: data.y ?? existing.y,
            zIndex: Math.min(existing.zIndex, (minZ._min.zIndex ?? 0) - 1),
          },
        });
        await broadcastToken(req.campaign, 'token:updated', moved);
        return res.json({ token: moved, repositioned: true });
      }
      data.ownerId = req.user.id;
      data.characterId = null;
      data.layer = 'TOKEN';
      // Sous tous les autres pions : il ne doit jamais cacher celui d'un joueur.
      const minZ = await prisma.token.aggregate({ where: { sceneId: scene.id }, _min: { zIndex: true } });
      data.zIndex = (minZ._min.zIndex ?? 0) - 1;
    }
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
      // Un seul pion par personnage et par scene : s'il est deja pose, on le
      // ramene a l'endroit demande (« Repositionner ») au lieu d'en creer un autre.
      const existing = await prisma.token.findFirst({
        where: { sceneId: scene.id, characterId: data.characterId },
        orderBy: { createdAt: 'asc' },
      });
      if (existing) {
        const moved = await prisma.token.update({
          where: { id: existing.id },
          data: { x: data.x ?? existing.x, y: data.y ?? existing.y },
        });
        await broadcastToken(req.campaign, 'token:updated', moved);
        return res.json({ token: await tokenFor(req, moved), repositioned: true });
      }
    }
    // Un pion de personnage part avec les PV de sa fiche : sa barre est juste d'emblee.
    if (data.characterId) {
      const character = await prisma.character.findUnique({
        where: { id: data.characterId },
        select: { hp: true, maxHp: true },
      });
      if (character) {
        data.hp = character.hp;
        data.maxHp = character.maxHp;
      }
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
    // Le role « pion du MJ » se donne a la creation, jamais apres coup.
    let { isGmPawn: _pawn, ...data } = parseBody(tokenSchema, req.body);
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
    // Pion lie a une fiche (ou fraichement lie) : la fiche et ses autres pions suivent.
    if (token.characterId) {
      if (data.characterId && data.characterId !== existing.characterId && data.hp === undefined) {
        const character = await prisma.character.findUnique({ where: { id: token.characterId } });
        if (character) await syncTokensFromCharacter(character, { by: req.user.username });
      } else if (data.hp !== undefined || data.maxHp !== undefined) {
        await syncCharacterFromToken(token, { by: req.user.username });
      }
    }
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

    // Pion de personnage : les degats passent par la fiche (PV temporaires
    // compris), qui reporte ensuite le resultat sur tous ses pions.
    const character = existing.characterId
      ? await prisma.character.findUnique({ where: { id: existing.characterId } })
      : null;
    if (character) {
      const updated = await prisma.character.update({
        where: { id: character.id },
        data: applyHpDelta(character, delta),
      });
      emitCharacterHp(updated);
      await syncTokensFromCharacter(updated, { by: req.user.username });
      const token = await prisma.token.findUnique({ where: { id: existing.id } });
      return res.json({ token: await tokenFor(req, token) });
    }

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
    // Tous les droits sont verifies avant d'ecrire : un groupe refuse ne doit
    // pas laisser une partie des pions deplaces.
    for (const token of tokens) await assertCanEdit(req, token);
    const updated = [];
    for (const move of moves) {
      const token = tokens.find((t) => t.id === move.id);
      if (!token) continue;
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
