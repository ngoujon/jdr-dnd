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

/**
 * Vitesses saisies en mètres converties en pieds.
 *
 * La vitesse est stockée en pieds (30 = 9 m), mais la fiche ne le disait pas :
 * un joueur qui tapait « 9 » obtenait un cercle de 2,7 m. Une vitesse D&D en
 * pieds est toujours un multiple de 5 ; une valeur qui ne l'est pas (6, 9, 12,
 * 18…) a donc été tapée en mètres. Rejouable : après conversion, la valeur est
 * un multiple de 5 et n'est plus touchée.
 */
async function convertMeterSpeeds() {
  const toFeet = (meters) => Math.round(meters / 1.5) * 5;
  let converted = 0;
  for (const model of ['character', 'token']) {
    // Character.speed est obligatoire, Token.speed facultatif : on filtre ici.
    const rows = await prisma[model].findMany({ select: { id: true, speed: true } });
    for (const row of rows) {
      if (row.speed == null || row.speed % 5 === 0 || row.speed > 60) continue;
      await prisma[model].update({ where: { id: row.id }, data: { speed: toFeet(row.speed) } });
      converted += 1;
    }
  }
  if (converted) console.log(`[post-push] ${converted} vitesse(s) saisie(s) en metres converties en pieds`);
}

/**
 * Les pions de MJ poses avant l'option « visible / cache » n'etaient jamais
 * montres aux joueurs : ils deviennent caches, comme les nouveaux. Le repere
 * `style.visibilityManaged` (pose aussi a la creation) evite de rejouer la
 * reprise sur un pion que le MJ a ensuite choisi de montrer.
 */
async function hideLegacyGmPawns() {
  const pawns = await prisma.token.findMany({ where: { isGmPawn: true }, select: { id: true, style: true } });
  let hidden = 0;
  for (const pawn of pawns) {
    const style = pawn.style && typeof pawn.style === 'object' ? pawn.style : {};
    if (style.visibilityManaged) continue;
    await prisma.token.update({
      where: { id: pawn.id },
      data: { visible: false, style: { ...style, visibilityManaged: true } },
    });
    hidden += 1;
  }
  if (hidden) console.log(`[post-push] ${hidden} pion(s) de MJ passe(s) en cache`);
}

try {
  await renameDetailsNotes();
  await hideLegacyGmPawns();
  await alignTokenHpWithCharacters();
  await convertMeterSpeeds();
} catch (error) {
  console.error('[post-push] avertissement :', error.message);
} finally {
  await prisma.$disconnect();
}
