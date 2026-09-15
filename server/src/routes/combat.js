import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { asyncHandler, parseBody } from '../lib/http.js';
import { requireAuth, requireCampaignMember, requireGM } from '../lib/auth.js';
import { emitToCampaign } from '../realtime/hub.js';

export const combatRouter = Router({ mergeParams: true });
combatRouter.use(requireAuth, requireCampaignMember);

const entrySchema = z.object({
  id: z.string(),
  name: z.string().max(60),
  initiative: z.number(),
  tokenId: z.string().nullish(),
  characterId: z.string().nullish(),
  hp: z.number().int().nullish(),
  maxHp: z.number().int().nullish(),
  ac: z.number().int().nullish(),
  isNpc: z.boolean().default(false),
  visible: z.boolean().default(true),
  conditions: z.array(z.string()).max(20).default([]),
});

const ensureCombat = async (campaignId) => {
  const existing = await prisma.combat.findUnique({ where: { campaignId } });
  return existing ?? prisma.combat.create({ data: { campaignId } });
};

/** Masque aux joueurs les PNJ que le MJ garde caches. */
const forPlayers = (combat) => ({
  ...combat,
  entries: (combat.entries || []).map((e) =>
    e.visible === false ? { id: e.id, name: '???', initiative: e.initiative, isNpc: true, hidden: true } : e,
  ),
});

combatRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const combat = await ensureCombat(req.campaign.id);
    res.json({ combat: req.isGM ? combat : forPlayers(combat) });
  }),
);

combatRouter.put(
  '/',
  requireGM,
  asyncHandler(async (req, res) => {
    const data = parseBody(
      z.object({
        entries: z.array(entrySchema).max(80).optional(),
        round: z.number().int().min(1).max(999).optional(),
        turnIndex: z.number().int().min(0).max(200).optional(),
        isActive: z.boolean().optional(),
      }),
      req.body,
    );
    await ensureCombat(req.campaign.id);
    const combat = await prisma.combat.update({ where: { campaignId: req.campaign.id }, data });
    emitToCampaign(req.campaign.id, 'combat:updated', { combat: forPlayers(combat) });
    res.json({ combat });
  }),
);

/** Passe au combattant suivant, en incrémentant le round si on boucle. */
combatRouter.post(
  '/next',
  requireGM,
  asyncHandler(async (req, res) => {
    const current = await ensureCombat(req.campaign.id);
    const entries = current.entries || [];
    if (!entries.length) return res.json({ combat: current });
    const next = current.turnIndex + 1;
    const wrapped = next >= entries.length;
    const combat = await prisma.combat.update({
      where: { campaignId: req.campaign.id },
      data: { turnIndex: wrapped ? 0 : next, round: wrapped ? current.round + 1 : current.round },
    });
    emitToCampaign(req.campaign.id, 'combat:updated', { combat: forPlayers(combat) });
    res.json({ combat });
  }),
);

combatRouter.post(
  '/previous',
  requireGM,
  asyncHandler(async (req, res) => {
    const current = await ensureCombat(req.campaign.id);
    const entries = current.entries || [];
    if (!entries.length) return res.json({ combat: current });
    const first = current.turnIndex <= 0;
    const combat = await prisma.combat.update({
      where: { campaignId: req.campaign.id },
      data: {
        turnIndex: first ? entries.length - 1 : current.turnIndex - 1,
        round: first ? Math.max(1, current.round - 1) : current.round,
      },
    });
    emitToCampaign(req.campaign.id, 'combat:updated', { combat: forPlayers(combat) });
    res.json({ combat });
  }),
);
