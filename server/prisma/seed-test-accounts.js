/**
 * Cree (ou met a jour le mot de passe de) des comptes de test pour le
 * developpement local : un compte admin et deux comptes joueurs. Idempotent.
 * A lancer manuellement : node prisma/seed-test-accounts.js
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const accounts = [
  { email: 'admin@tabletop.local', username: 'Admin', password: '***REDACTED***', isAdmin: true },
  { email: 'joueur1@tabletop.local', username: 'Joueur1', password: '***REDACTED***', isAdmin: false },
  { email: 'joueur2@tabletop.local', username: 'Joueur2', password: '***REDACTED***', isAdmin: false },
];

const run = async () => {
  for (const account of accounts) {
    const passwordHash = await bcrypt.hash(account.password, 11);
    await prisma.user.upsert({
      where: { email: account.email },
      update: { passwordHash, isAdmin: account.isAdmin },
      create: {
        email: account.email,
        username: account.username,
        passwordHash,
        isAdmin: account.isAdmin,
      },
    });
    console.log(`[seed-test-accounts] ${account.email} (${account.username}) pret`);
  }
};

run()
  .catch((err) => {
    console.error('[seed-test-accounts] échec', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
