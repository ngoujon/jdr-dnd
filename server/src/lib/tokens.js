import { prisma } from './db.js';

/**
 * Pions controles par un joueur : poses par lui, ou lies au personnage (non PNJ)
 * d'un joueur. Leurs PV restent visibles de toute la table ; ceux des autres
 * pions (monstres, PNJ, decor) ne sont connus que du MJ.
 */
export async function playerControlledIds(tokens, gmId) {
  const characterIds = [...new Set(tokens.map((t) => t.characterId).filter(Boolean))];
  const characters = characterIds.length
    ? await prisma.character.findMany({
        where: { id: { in: characterIds } },
        select: { id: true, isNpc: true, ownerId: true },
      })
    : [];
  const pcIds = new Set(characters.filter((c) => !c.isNpc && c.ownerId !== gmId).map((c) => c.id));
  return new Set(
    tokens
      .filter((t) => (t.ownerId && t.ownerId !== gmId) || (t.characterId && pcIds.has(t.characterId)))
      .map((t) => t.id),
  );
}

/** Retire d'un pion les informations reservees au MJ. */
export const sanitizeTokenForPlayer = (token, playerControlled) => {
  const { hpLog: _log, ...rest } = token;
  if (playerControlled) return rest;
  return { ...rest, hp: null, maxHp: null, ac: null };
};
