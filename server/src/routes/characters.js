import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { asyncHandler, parseBody, notFound, forbidden } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { withDerived } from '../lib/dnd.js';
import { emitToCampaign, emitToGMs } from '../realtime/hub.js';

export const charactersRouter = Router();
charactersRouter.use(requireAuth);

const characterSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  campaignId: z.string().nullish(),
  isNpc: z.boolean().optional(),
  shared: z.boolean().optional(),
  class: z.string().max(60).optional(),
  subclass: z.string().max(60).optional(),
  race: z.string().max(60).optional(),
  background: z.string().max(60).optional(),
  alignment: z.string().max(40).optional(),
  level: z.number().int().min(1).max(20).optional(),
  xp: z.number().int().min(0).max(1000000).optional(),
  portraitUrl: z.string().max(500).nullish(),
  tokenUrl: z.string().max(500).nullish(),
  style: z.record(z.any()).optional(),
  abilities: z.record(z.number().int().min(1).max(30)).optional(),
  proficiencies: z.record(z.any()).optional(),
  hp: z.number().int().min(-99).max(9999).optional(),
  maxHp: z.number().int().min(1).max(9999).optional(),
  tempHp: z.number().int().min(0).max(9999).optional(),
  ac: z.number().int().min(0).max(60).optional(),
  speed: z.number().int().min(0).max(999).optional(),
  initiative: z.number().int().min(-20).max(20).optional(),
  hitDice: z.string().max(20).optional(),
  hitDiceLeft: z.number().int().min(0).max(40).optional(),
  inspiration: z.boolean().optional(),
  deathSaves: z.record(z.any()).optional(),
  attacks: z.array(z.any()).max(60).optional(),
  spellcasting: z.record(z.any()).optional(),
  inventory: z.array(z.any()).max(300).optional(),
  currency: z.record(z.any()).optional(),
  features: z.array(z.any()).max(200).optional(),
  details: z.record(z.any()).optional(),
});

/** Vérifie l'accès : propriétaire, MJ de la campagne, ou fiche partagée. */
const loadCharacter = async (req, { forWrite }) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.characterId },
    include: { campaign: { select: { id: true, gmId: true } } },
  });
  if (!character) throw notFound('Personnage introuvable');
  const isOwner = character.ownerId === req.user.id;
  const isGM = character.campaign?.gmId === req.user.id;
  if (isOwner || isGM) return { character, isOwner, isGM };
  if (forWrite) throw forbidden('Vous ne pouvez pas modifier ce personnage');
  if (!character.shared || !character.campaignId) throw forbidden('Fiche privée');
  const member = await prisma.membership.findUnique({
    where: { campaignId_userId: { campaignId: character.campaignId, userId: req.user.id } },
  });
  if (!member) throw forbidden('Fiche privée');
  return { character, isOwner: false, isGM: false };
};

charactersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { campaignId } = req.query;
    if (campaignId) {
      const membership = await prisma.membership.findUnique({
        where: { campaignId_userId: { campaignId, userId: req.user.id } },
      });
      if (!membership) throw forbidden("Vous ne faites pas partie de cette campagne");
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
      const isGM = campaign.gmId === req.user.id;
      const characters = await prisma.character.findMany({
        where: isGM
          ? { campaignId }
          : { campaignId, OR: [{ ownerId: req.user.id }, { shared: true, isNpc: false }] },
        include: { owner: { select: { id: true, username: true, avatarUrl: true } } },
        orderBy: [{ isNpc: 'asc' }, { name: 'asc' }],
      });
      return res.json({ characters: characters.map(withDerived) });
    }
    const characters = await prisma.character.findMany({
      where: { ownerId: req.user.id },
      include: { campaign: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ characters: characters.map(withDerived) });
  }),
);

charactersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(characterSchema.extend({ name: z.string().min(1).max(60) }), req.body);
    if (data.campaignId) {
      const membership = await prisma.membership.findUnique({
        where: { campaignId_userId: { campaignId: data.campaignId, userId: req.user.id } },
      });
      if (!membership) throw forbidden("Vous ne faites pas partie de cette campagne");
      const campaign = await prisma.campaign.findUnique({ where: { id: data.campaignId } });
      if (data.isNpc && campaign.gmId !== req.user.id) {
        throw forbidden('Seul le MJ peut créer des PNJ');
      }
    }
    const character = await prisma.character.create({ data: { ...data, ownerId: req.user.id } });
    if (character.campaignId) {
      const payload = { character: withDerived(character) };
      if (character.isNpc) emitToGMs(character.campaignId, 'character:created', payload);
      else emitToCampaign(character.campaignId, 'character:created', payload);
    }
    res.status(201).json({ character: withDerived(character) });
  }),
);

charactersRouter.get(
  '/:characterId',
  asyncHandler(async (req, res) => {
    const { character } = await loadCharacter(req, { forWrite: false });
    res.json({ character: withDerived(character) });
  }),
);

charactersRouter.patch(
  '/:characterId',
  asyncHandler(async (req, res) => {
    const { character: existing } = await loadCharacter(req, { forWrite: true });
    const data = parseBody(characterSchema, req.body);
    const character = await prisma.character.update({ where: { id: existing.id }, data });
    if (character.campaignId) {
      const payload = { character: withDerived(character) };
      if (character.isNpc) emitToGMs(character.campaignId, 'character:updated', payload);
      else emitToCampaign(character.campaignId, 'character:updated', payload);
    }
    res.json({ character: withDerived(character) });
  }),
);

/** Raccourci degats/soins utilise par la barre de vie et le tracker de combat. */
charactersRouter.post(
  '/:characterId/hp',
  asyncHandler(async (req, res) => {
    const { character: existing } = await loadCharacter(req, { forWrite: true });
    const { delta, temp } = parseBody(
      z.object({ delta: z.number().int().min(-999).max(999), temp: z.boolean().default(false) }),
      req.body,
    );
    let { hp, tempHp } = existing;
    if (temp) {
      tempHp = Math.max(0, tempHp + delta);
    } else if (delta < 0) {
      const absorbed = Math.min(tempHp, -delta);
      tempHp -= absorbed;
      hp = Math.max(-existing.maxHp, hp + delta + absorbed);
    } else {
      hp = Math.min(existing.maxHp, hp + delta);
    }
    const character = await prisma.character.update({
      where: { id: existing.id },
      data: { hp, tempHp },
    });
    if (character.campaignId) {
      emitToCampaign(character.campaignId, 'character:hp', {
        characterId: character.id,
        hp: character.hp,
        tempHp: character.tempHp,
        maxHp: character.maxHp,
      });
    }
    res.json({ character: withDerived(character) });
  }),
);

charactersRouter.post(
  '/:characterId/duplicate',
  asyncHandler(async (req, res) => {
    const { character: source } = await loadCharacter(req, { forWrite: true });
    const { id, createdAt, updatedAt, ownerId, ...rest } = source;
    const character = await prisma.character.create({
      data: { ...rest, name: `${source.name} (copié)`, ownerId: req.user.id },
    });
    res.status(201).json({ character: withDerived(character) });
  }),
);

charactersRouter.delete(
  '/:characterId',
  asyncHandler(async (req, res) => {
    const { character } = await loadCharacter(req, { forWrite: true });
    await prisma.character.delete({ where: { id: character.id } });
    if (character.campaignId) {
      emitToCampaign(character.campaignId, 'character:deleted', { characterId: character.id });
    }
    res.json({ ok: true });
  }),
);
