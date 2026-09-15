import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { env } from '../lib/env.js';
import { asyncHandler, parseBody, badRequest, notFound, forbidden } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { emitToCampaign } from '../realtime/hub.js';

export const assetsRouter = Router();

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'application/pdf',
]);

const EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'application/pdf': '.pdf',
};

await fs.mkdir(env.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    // Un dossier par utilisateur : simplifie le nettoyage et évite les collisions.
    const dir = path.join(env.uploadDir, req.user.id);
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = EXTENSIONS[file.mimetype] || path.extname(file.originalname).slice(0, 8) || '.bin';
    cb(null, `${crypto.randomBytes(12).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.maxUploadBytes, files: 12 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(badRequest(`Type de fichier non autorisé : ${file.mimetype}`));
    }
    cb(null, true);
  },
});

const guessKind = (mime, hinted) => {
  if (hinted) return hinted;
  if (mime.startsWith('audio/')) return 'AUDIO';
  if (mime === 'application/pdf') return 'HANDOUT';
  return 'MISC';
};

assetsRouter.use(requireAuth);

assetsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { campaignId, kind, q } = req.query;
    const where = {
      AND: [
        campaignId
          ? { OR: [{ campaignId }, { ownerId: req.user.id, campaignId: null }, { builtin: true }] }
          : { OR: [{ ownerId: req.user.id }, { builtin: true }] },
        kind ? { kind } : {},
        q ? { OR: [{ name: { contains: String(q), mode: 'insensitive' } }, { tags: { has: String(q).toLowerCase() } }] } : {},
      ],
    };
    if (campaignId) {
      const membership = await prisma.membership.findUnique({
        where: { campaignId_userId: { campaignId, userId: req.user.id } },
      });
      if (!membership) throw forbidden("Vous ne faites pas partie de cette campagne");
    }
    const assets = await prisma.asset.findMany({
      where,
      orderBy: [{ builtin: 'asc' }, { createdAt: 'desc' }],
      take: 500,
    });
    res.json({ assets });
  }),
);

assetsRouter.post(
  '/',
  upload.array('files', 12),
  asyncHandler(async (req, res) => {
    if (!req.files?.length) throw badRequest('Aucun fichier reçu');
    const kind = req.body.kind && ['MAP', 'TOKEN', 'PORTRAIT', 'HANDOUT', 'AUDIO', 'MISC'].includes(req.body.kind)
      ? req.body.kind
      : null;
    const campaignId = req.body.campaignId || null;
    if (campaignId) {
      const membership = await prisma.membership.findUnique({
        where: { campaignId_userId: { campaignId, userId: req.user.id } },
      });
      if (!membership) throw forbidden("Vous ne faites pas partie de cette campagne");
    }
    const tags = String(req.body.tags || '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 12);

    const assets = await Promise.all(
      req.files.map((file) =>
        prisma.asset.create({
          data: {
            ownerId: req.user.id,
            campaignId,
            name: req.body.name || file.originalname.replace(/\.[^.]+$/, '').slice(0, 80),
            url: `/uploads/${req.user.id}/${file.filename}`,
            kind: guessKind(file.mimetype, kind),
            mime: file.mimetype,
            size: file.size,
            tags,
          },
        }),
      ),
    );
    if (campaignId) emitToCampaign(campaignId, 'asset:created', { assets });
    res.status(201).json({ assets });
  }),
);

assetsRouter.patch(
  '/:assetId',
  asyncHandler(async (req, res) => {
    const existing = await prisma.asset.findUnique({ where: { id: req.params.assetId } });
    if (!existing) throw notFound('Ressource introuvable');
    if (existing.builtin || existing.ownerId !== req.user.id) throw forbidden('Ressource non modifiable');
    const data = parseBody(
      z.object({
        name: z.string().min(1).max(80).optional(),
        kind: z.enum(['MAP', 'TOKEN', 'PORTRAIT', 'HANDOUT', 'AUDIO', 'MISC']).optional(),
        tags: z.array(z.string().max(24)).max(12).optional(),
        campaignId: z.string().nullish(),
      }),
      req.body,
    );
    const asset = await prisma.asset.update({ where: { id: existing.id }, data });
    res.json({ asset });
  }),
);

assetsRouter.delete(
  '/:assetId',
  asyncHandler(async (req, res) => {
    const asset = await prisma.asset.findUnique({ where: { id: req.params.assetId } });
    if (!asset) throw notFound('Ressource introuvable');
    if (asset.builtin || asset.ownerId !== req.user.id) throw forbidden('Ressource non supprimable');
    await prisma.asset.delete({ where: { id: asset.id } });
    if (asset.url.startsWith('/uploads/')) {
      // Le fichier peut déjà avoir disparu (volume recree) : on ignore l'erreur.
      await fs.rm(path.join(env.uploadDir, asset.url.replace('/uploads/', '')), { force: true }).catch(() => {});
    }
    res.json({ ok: true });
  }),
);
