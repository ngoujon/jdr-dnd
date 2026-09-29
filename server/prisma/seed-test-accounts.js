/**
 * Cree (ou met a jour le mot de passe de) des comptes de test pour le
 * developpement local : un compte admin et trois comptes joueurs. Idempotent.
 *
 * Les mots de passe ne sont PAS ecrits ici. Ce fichier est versionne, et ces
 * comptes finissent par exister sur des instances reellement accessibles :
 * un mot de passe en clair dans le depot est alors un identifiant valide
 * publie. Ils viennent donc de l'environnement, ou sont tires au hasard et
 * affiches une seule fois au moment de la creation.
 *
 *   TEST_ADMIN_PASSWORD=… TEST_PLAYER_PASSWORD=… node prisma/seed-test-accounts.js
 *
 * A n'utiliser qu'en developpement : ces comptes n'ont pas leur place sur une
 * instance ouverte sur Internet.
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** Mot de passe aleatoire lisible, quand l'environnement n'en fournit pas. */
const generate = () => randomBytes(12).toString('base64url');

const accounts = [
  {
    email: 'admin@tabletop.local',
    username: 'Admin',
    isAdmin: true,
    password: process.env.TEST_ADMIN_PASSWORD || generate(),
  },
  ...['Joueur1', 'Joueur2', 'Joueur3'].map((username, index) => ({
    email: `joueur${index + 1}@tabletop.local`,
    username,
    isAdmin: false,
    password: process.env[`TEST_PLAYER${index + 1}_PASSWORD`] || generate(),
  })),
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
    console.log(`[seed-test-accounts] ${account.email} — mot de passe : ${account.password}`);
  }
  console.log('[seed-test-accounts] notez ces mots de passe, ils ne seront pas reaffiches.');
};

run()
  .catch((err) => {
    console.error('[seed-test-accounts] échec', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
