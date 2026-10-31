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

/**
 * Les pions lies a une fiche prennent les PV de la fiche.
 *
 * Avant la synchronisation fiche <-> pion, les deux valeurs vivaient
 * separement et la barre de vie de la carte pouvait etre fausse. La fiche fait
 * foi. Rejouable : un pion deja a jour n'est pas modifie.
 */
async function alignTokenHpWithCharacters() {
  const tokens = await prisma.token.findMany({
    where: { characterId: { not: null } },
    select: { id: true, hp: true, maxHp: true, characterId: true },
  });
  if (!tokens.length) return;
  const characters = await prisma.character.findMany({
    where: { id: { in: [...new Set(tokens.map((t) => t.characterId))] } },
    select: { id: true, hp: true, maxHp: true },
  });
  const byId = new Map(characters.map((c) => [c.id, c]));

  let aligned = 0;
  for (const token of tokens) {
    const character = byId.get(token.characterId);
    if (!character || (token.hp === character.hp && token.maxHp === character.maxHp)) continue;
    await prisma.token.update({
      where: { id: token.id },
      data: { hp: character.hp, maxHp: character.maxHp },
    });
    aligned += 1;
  }

  if (aligned) console.log(`[post-push] PV de ${aligned} pion(s) alignes sur leur fiche`);
}

try {
  await renameDetailsNotes();
  await alignTokenHpWithCharacters();
} catch (error) {
  console.error('[post-push] avertissement :', error.message);
} finally {
  await prisma.$disconnect();
}
