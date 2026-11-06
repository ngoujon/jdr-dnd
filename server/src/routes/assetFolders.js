import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { asyncHandler, parseBody, notFound, forbidden } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { emitToUser } from '../realtime/hub.js';

/**
 * Dossiers de la bibliotheque (pions, cartes). Ils appartiennent a
 * l'utilisateur : la bibliotheque le suit d'une campagne a l'autre, et chacun
 * range a sa facon les ressources fournies, communes a tous.
 */
export const assetFoldersRouter = Router();
assetFoldersRouter.use(requireAuth);

const SCOPES = ['TOKEN', 'MAP', 'AUDIO'];

/** Evenements qui peuvent jouer un son d'un dossier (voir realtime/sound.js). */
export const SOUND_TRIGGERS = ['CRIT_SUCCESS', 'CRIT_FAIL', 'ENEMY_APPEARS', 'FOG_REVEAL', 'SCENE'];

const folderSchema = z.object({
  name: z.string().trim().min(1).max(60),
  order: z.number().int().min(0).max(999).optional(),
});

/** Dossiers et placements de l'utilisateur, toutes categories confondues. */
const snapshot = async (userId) => {
  const folders = await prisma.folder.findMany({
    where: { ownerId: userId, scope: { in: SCOPES } },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });
  const entries = await prisma.assetFolderEntry.findMany({
    where: { folderId: { in: folders.map((f) => f.id) } },
    select: { folderId: true, assetId: true },
  });
  return { folders, entries };
};

/** Les autres onglets du meme utilisateur se mettent a jour aussi. */
const broadcast = async (userId) => {
  const data = await snapshot(userId);
  emitToUser(userId, 'asset-folders:updated', data);
  return data;
};

const findFolder = async (req) => {
  const folder = await prisma.folder.findFirst({
    where: { id: req.params.folderId, ownerId: req.user.id, scope: { in: SCOPES } },
  });
  if (!folder) throw notFound('Dossier introuvable');
  return folder;
};

assetFoldersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await snapshot(req.user.id));
  }),
);

assetFoldersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(folderSchema.extend({ scope: z.enum(SCOPES) }), req.body);
    const count = await prisma.folder.count({ where: { ownerId: req.user.id, scope: data.scope } });
    const folder = await prisma.folder.create({
      data: { name: data.name, scope: data.scope, order: data.order ?? count, ownerId: req.user.id },
    });
    res.status(201).json({ folder, ...(await broadcast(req.user.id)) });
  }),
);

/** Range une ressource dans un dossier (folderId null = hors dossier). */
assetFoldersRouter.put(
  '/place',
  asyncHandler(async (req, res) => {
    const { assetId, folderId, scope } = parseBody(
      z.object({ assetId: z.string().max(40), folderId: z.string().max(40).nullable(), scope: z.enum(SCOPES) }),
      req.body,
    );
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw notFound('Ressource introuvable');
    if (!asset.builtin && asset.ownerId !== req.user.id) {
      // Ressource d'une campagne : il faut en faire partie pour la ranger.
      const member = asset.campaignId
        ? await prisma.membership.findUnique({
            where: { campaignId_userId: { campaignId: asset.campaignId, userId: req.user.id } },
          })
        : null;
      if (!member) throw forbidden('Ressource inaccessible');
    }
    if (folderId) {
      const folder = await prisma.folder.findFirst({ where: { id: folderId, ownerId: req.user.id, scope } });
      if (!folder) throw notFound('Dossier introuvable');
    }
    // Une ressource n'est que dans un seul dossier par categorie.
    const mine = await prisma.folder.findMany({ where: { ownerId: req.user.id, scope }, select: { id: true } });
    await prisma.$transaction([
      prisma.assetFolderEntry.deleteMany({ where: { assetId, folderId: { in: mine.map((f) => f.id) } } }),
      ...(folderId ? [prisma.assetFolderEntry.create({ data: { assetId, folderId } })] : []),
    ]);
    res.json(await broadcast(req.user.id));
  }),
);

assetFoldersRouter.patch(
  '/:folderId',
  asyncHandler(async (req, res) => {
    const data = parseBody(
      folderSchema.partial().extend({
        trigger: z.enum(SOUND_TRIGGERS).nullable().optional(),
        triggerSceneId: z.string().max(40).nullable().optional(),
        triggerMode: z.enum(['music', 'sfx']).nullable().optional(),
      }),
      req.body,
    );
    const existing = await findFolder(req);
    // Les declencheurs ne concernent que les dossiers de sons.
    if (existing.scope !== 'AUDIO') {
      delete data.trigger;
      delete data.triggerSceneId;
      delete data.triggerMode;
    }
    if (data.trigger !== undefined && data.trigger !== 'SCENE') data.triggerSceneId = null;
    const folder = await prisma.folder.update({ where: { id: req.params.folderId }, data });
    res.json({ folder, ...(await broadcast(req.user.id)) });
  }),
);

assetFoldersRouter.delete(
  '/:folderId',
  asyncHandler(async (req, res) => {
    const folder = await findFolder(req);
    // Les placements partent avec le dossier ; les ressources, elles, restent.
    await prisma.folder.delete({ where: { id: folder.id } });
    res.json({ ok: true, ...(await broadcast(req.user.id)) });
  }),
);
