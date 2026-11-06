import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { asyncHandler, parseBody, notFound } from '../lib/http.js';
import { requireAuth, requireCampaignMember, requireGM } from '../lib/auth.js';
import { emitToGMs } from '../realtime/hub.js';

/** Dossiers de rangement des documents : outil d'organisation reserve au MJ.
 *  Les joueurs ne voient jamais les dossiers (leurs noms peuvent trahir la suite). */
export const handoutFoldersRouter = Router({ mergeParams: true });
handoutFoldersRouter.use(requireAuth, requireCampaignMember, requireGM);

const folderSchema = z.object({
  name: z.string().trim().min(1).max(60),
  order: z.number().int().min(0).max(999).optional(),
});

const scopeOf = (campaignId) => ({ campaignId, scope: 'HANDOUT' });

const listFolders = (campaignId) =>
  prisma.folder.findMany({ where: scopeOf(campaignId), orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });

/** Les autres onglets du MJ recoivent la liste complete : plus simple qu'un diff. */
const broadcast = async (campaignId) => {
  const folders = await listFolders(campaignId);
  emitToGMs(campaignId, 'handout-folders:updated', { folders });
  return folders;
};

const findFolder = async (req) => {
  const folder = await prisma.folder.findFirst({ where: { id: req.params.folderId, ...scopeOf(req.campaign.id) } });
  if (!folder) throw notFound('Dossier introuvable');
  return folder;
};

handoutFoldersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ folders: await listFolders(req.campaign.id) });
  }),
);

handoutFoldersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(folderSchema, req.body);
    const count = await prisma.folder.count({ where: scopeOf(req.campaign.id) });
    const folder = await prisma.folder.create({
      data: { name: data.name, order: data.order ?? count, ownerId: req.user.id, ...scopeOf(req.campaign.id) },
    });
    const folders = await broadcast(req.campaign.id);
    res.status(201).json({ folder, folders });
  }),
);

handoutFoldersRouter.patch(
  '/:folderId',
  asyncHandler(async (req, res) => {
    const data = parseBody(folderSchema.partial(), req.body);
    await findFolder(req);
    const folder = await prisma.folder.update({ where: { id: req.params.folderId }, data });
    const folders = await broadcast(req.campaign.id);
    res.json({ folder, folders });
  }),
);

handoutFoldersRouter.delete(
  '/:folderId',
  asyncHandler(async (req, res) => {
    const folder = await findFolder(req);
    // Les documents ne sont pas supprimes : ils reviennent hors dossier.
    await prisma.$transaction([
      prisma.handout.updateMany({ where: { folderId: folder.id }, data: { folderId: null } }),
      prisma.folder.delete({ where: { id: folder.id } }),
    ]);
    emitToGMs(req.campaign.id, 'handouts:folder-cleared', { folderId: folder.id });
    const folders = await broadcast(req.campaign.id);
    res.json({ ok: true, folders });
  }),
);
