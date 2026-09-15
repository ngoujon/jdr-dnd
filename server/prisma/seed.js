/**
 * Enregistre en base les ressources livrées avec l'application. Idempotent :
 * peut etre rejoue à chaque demarrage du conteneur sans creer de doublons.
 */
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generateBuiltins } from './builtin.js';

const prisma = new PrismaClient();

const SYSTEM_EMAIL = 'systeme@tabletop.local';

const run = async () => {
  const files = await generateBuiltins();

  // Compte technique propriétaire des ressources intégrées. Le mot de passe est
  // aléatoire et jete : ce compte ne sert jamais a se connecter.
  const system = await prisma.user.upsert({
    where: { email: SYSTEM_EMAIL },
    update: {},
    create: {
      email: SYSTEM_EMAIL,
      username: 'Système',
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
    },
  });

  let created = 0;
  for (const file of files) {
    const existing = await prisma.asset.findFirst({ where: { url: file.url, builtin: true } });
    if (existing) {
      await prisma.asset.update({
        where: { id: existing.id },
        data: { name: file.name, kind: file.kind, tags: file.tags },
      });
      continue;
    }
    await prisma.asset.create({
      data: {
        ...file,
        mime: 'image/svg+xml',
        builtin: true,
        ownerId: system.id,
      },
    });
    created += 1;
  }
  console.log(`[seed] ${files.length} ressources intégrées (${created} nouvelles)`);
};

run()
  .catch((err) => {
    console.error('[seed] échec', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
