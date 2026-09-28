import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { asyncHandler, parseBody, conflict, unauthorized } from '../lib/http.js';
import { hashPassword, verifyPassword, signToken, requireAuth } from '../lib/auth.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email("Adresse e-mail invalide"),
  username: z
    .string()
    .min(3, 'Au moins 3 caractères')
    .max(24, 'Au plus 24 caractères')
    .regex(/^[\w .'-]+$/u, 'Caracteres autorises : lettres, chiffres, espace, . _ - \''),
  password: z.string().min(8, 'Au moins 8 caractères').max(200),
});

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  username: user.username,
  avatarUrl: user.avatarUrl,
  isAdmin: user.isAdmin,
});

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const data = parseBody(registerSchema, req.body);
    const email = data.email.toLowerCase().trim();
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username: data.username }] },
    });
    if (existing) {
      throw conflict(
        existing.email === email ? 'Cette adresse est déjà utilisée' : 'Ce pseudo est déjà pris',
      );
    }
    const user = await prisma.user.create({
      data: { email, username: data.username.trim(), passwordHash: await hashPassword(data.password) },
    });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const data = parseBody(
      z.object({ identifier: z.string().min(1), password: z.string().min(1) }),
      req.body,
    );
    const identifier = data.identifier.trim();
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier.toLowerCase() }, { username: identifier }] },
    });
    if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
      throw unauthorized('Identifiants incorrects');
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
    res.json({ token: signToken(user), user: publicUser(user) });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);

authRouter.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = parseBody(
      z.object({
        username: z
          .string()
          .min(3, 'Au moins 3 caractères')
          .max(24, 'Au plus 24 caractères')
          .regex(/^[\w .'-]+$/u, 'Caracteres autorises : lettres, chiffres, espace, . _ - \'')
          .optional(),
        email: z.string().email('Adresse e-mail invalide').optional(),
        avatarUrl: z.string().max(500).nullish(),
      }),
      req.body,
    );
    if (data.email) data.email = data.email.toLowerCase().trim();
    if (data.username || data.email) {
      const clash = await prisma.user.findFirst({
        where: {
          NOT: { id: req.user.id },
          OR: [data.username ? { username: data.username } : undefined, data.email ? { email: data.email } : undefined].filter(
            Boolean,
          ),
        },
      });
      if (clash) {
        throw conflict(clash.email === data.email ? 'Cette adresse est déjà utilisée' : 'Ce pseudo est déjà pris');
      }
    }
    const user = await prisma.user.update({ where: { id: req.user.id }, data });
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post(
  '/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = parseBody(
      z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) }),
      req.body,
    );
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await verifyPassword(data.currentPassword, user.passwordHash))) {
      throw unauthorized('Mot de passe actuel incorrect');
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(data.newPassword) },
    });
    res.json({ ok: true });
  }),
);
