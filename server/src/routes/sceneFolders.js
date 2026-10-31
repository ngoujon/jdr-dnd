import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { asyncHandler, parseBody, notFound } from '../lib/http.js';
import { requireAuth, requireCampaignMember, requireGM } from '../lib/auth.js';
import { emitToGMs } from '../realtime/hub.js';

/** Dossiers de rangement des scenes : outil d'organisation reserve au MJ. */
export const sceneFoldersRouter = Router({ mergeParams: true });
sceneFoldersRouter.use(requireAuth, requireCampaignMember, requireGM);

const folderSchema = z.object({
  name: z.string().trim().min(1).max(60),
  order: z.number().int().min(0).max(999).optional(),
});

const listFolders = (campaignId) =>
  prisma.sceneFolder.findMany({ where: { campaignId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });

/** Les autres onglets du MJ recoivent la liste complete : plus simple qu'un diff. */
const broadcast = async (campaignId) => {
  const folders = await listFolders(campaignId);
  emitToGMs(campaignId, 'scene-folders:updated', { folders });
  return folders;
};

const findFolder = async (req) => {
  const folder = await prisma.sceneFolder.findFirst({
    where: { id: req.params.folderId, campaignId: req.campaign.id },
  });
  if (!folder) throw notFound('Dossier introuvable');
  return folder;
};

sceneFoldersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ folders: await listFolders(req.campaign.id) });
  }),
);

sceneFoldersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(folderSchema, req.body);
    const count = await prisma.sceneFolder.count({ where: { campaignId: req.campaign.id } });
    const folder = await prisma.sceneFolder.create({
      data: { name: data.name, order: data.order ?? count, campaignId: req.campaign.id },
    });
    const folders = await broadcast(req.campaign.id);
    res.status(201).json({ folder, folders });
  }),
);

sceneFoldersRouter.patch(
  '/:folderId',
  asyncHandler(async (req, res) => {
    const data = parseBody(folderSchema.partial(), req.body);
    await findFolder(req);
    const folder = await prisma.sceneFolder.update({ where: { id: req.params.folderId }, data });
    const folders = await broadcast(req.campaign.id);
    res.json({ folder, folders });
  }),
);

sceneFoldersRouter.delete(
  '/:folderId',
  asyncHandler(async (req, res) => {
    const folder = await findFolder(req);
    // Les scenes ne sont pas supprimees : elles reviennent a la racine.
    const moved = await prisma.scene.findMany({ where: { folderId: folder.id }, select: { id: true } });
    await prisma.$transaction([
      prisma.scene.updateMany({ where: { folderId: folder.id }, data: { folderId: null } }),
      prisma.sceneFolder.delete({ where: { id: folder.id } }),
    ]);
    for (const { id } of moved) {
      emitToGMs(req.campaign.id, 'scene:updated-gm', { sceneId: id, patch: { folderId: null } });
    }
    const folders = await broadcast(req.campaign.id);
    res.json({ ok: true, folders });
  }),
);
