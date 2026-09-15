import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from './env.js';
import { prisma } from './db.js';
import { unauthorized, forbidden, notFound } from './http.js';

export const hashPassword = (plain) => bcrypt.hash(plain, 11);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

export const signToken = (user) =>
  jwt.sign({ sub: user.id, username: user.username }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

export const verifyToken = (token) => jwt.verify(token, env.jwtSecret);

const extractToken = (req) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
};

/** Middleware : exige un JWT valide et charge req.user. */
export const requireAuth = async (req, _res, next) => {
  try {
    const token = extractToken(req);
    if (!token) throw unauthorized();
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, username: true, avatarUrl: true, isAdmin: true },
    });
    if (!user) throw unauthorized('Compte introuvable');
    req.user = user;
    next();
  } catch (err) {
    next(err.status ? err : unauthorized('Session expirée ou invalide'));
  }
};

/**
 * Charge la campagne `req.params.campaignId` et vérifie que l'utilisateur en est
 * membre. Expose req.campaign, req.membership et req.isGM.
 */
export const requireCampaignMember = async (req, _res, next) => {
  try {
    const campaignId = req.params.campaignId || req.body.campaignId;
    if (!campaignId) throw notFound('Campagne non précisée');
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { members: true },
    });
    if (!campaign) throw notFound('Campagne introuvable');
    const membership = campaign.members.find((m) => m.userId === req.user.id);
    if (!membership) throw forbidden("Vous ne faites pas partie de cette campagne");
    req.campaign = campaign;
    req.membership = membership;
    req.isGM = campaign.gmId === req.user.id || membership.role === 'GM';
    next();
  } catch (err) {
    next(err);
  }
};

/** Middleware a chainer après requireCampaignMember. */
export const requireGM = (req, _res, next) => {
  if (!req.isGM) return next(forbidden('Action réservée au Maître du Jeu'));
  next();
};
