// Reprises de donnees a executer APRES `prisma db push`, quand elles ont besoin
// de tables ou de colonnes que la synchronisation vient de creer.
//
// Comme pre-push.js, chaque reprise doit etre rejouable sans effet : le script
// tourne a chaque demarrage du conteneur.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * `details.notes` devient `details.extraFeatures`.
 *
 * Ce champ n'a jamais contenu des notes personnelles mais les « capacites et
 * traits supplementaires », qui font partie de la fiche et sont imprimes avec
 * elle. Le nom pretait a confusion maintenant qu'un onglet Notes existe, avec
 * des notes reellement privees rangees dans CharacterNote.
 */
async function renameDetailsNotes() {
  const characters = await prisma.character.findMany({ select: { id: true, details: true } });

  let renamed = 0;
  for (const character of characters) {
    const details = character.details;
    if (!details || typeof details !== 'object' || !('notes' in details)) continue;

    const { notes, ...rest } = details;
    // Ne pas ecraser une valeur deja saisie sous le nouveau nom.
    const next = rest.extraFeatures ? rest : { ...rest, extraFeatures: notes };
    await prisma.character.update({ where: { id: character.id }, data: { details: next } });
    renamed += 1;
  }

  if (renamed) console.log(`[post-push] champ « notes » renomme sur ${renamed} fiche(s)`);
}

try {
  await renameDetailsNotes();
} catch (error) {
  console.error('[post-push] avertissement :', error.message);
} finally {
  await prisma.$disconnect();
}
