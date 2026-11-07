import { prisma } from './db.js';
import { emitToCampaign, emitToGMs, emitToPlayers } from '../realtime/hub.js';
import { playerControlledIds, sanitizeTokenForPlayer } from './tokens.js';

/**
 * Points de vie d'un personnage et de ses pions : une seule valeur.
 *
 * La fiche et les pions qui la representent stockent chacun leurs PV. Sans
 * synchronisation, modifier ses PV dans sa fiche laissait la barre du pion
 * figee sur la carte (et inversement). La fiche fait foi : toute modification
 * d'un cote est recopiee de l'autre, puis diffusee a la table.
 */

/** Le MJ recoit le pion complet ; les joueurs, une version sans ses PV s'il
 *  n'est pas controle par un joueur (et rien du tout s'il est cache). */
export const broadcastToken = async (campaign, event, token) => {
  emitToGMs(campaign.id, event, { token });
  // Le pion du MJ part toujours chez les joueurs, meme cache : sa position
  // regle le volume de la voix du MJ. Leur carte ne l'affiche que s'il est visible.
  if ((!token.visible && !token.isGmPawn) || token.layer === 'GM') return;
  const controlled = await playerControlledIds([token], campaign.gmId);
  emitToPlayers(campaign.id, event, { token: sanitizeTokenForPlayer(token, controlled.has(token.id)) });
};

/**
 * Applique des degats (delta negatif) ou des soins a un personnage, comme la
 * barre de vie de la fiche : les PV temporaires absorbent d'abord les degats.
 */
export const applyHpDelta = (character, delta, { temp = false } = {}) => {
  let { hp, tempHp } = character;
  if (temp) {
    tempHp = Math.max(0, tempHp + delta);
  } else if (delta < 0) {
    const absorbed = Math.min(tempHp, -delta);
    tempHp -= absorbed;
    hp = Math.max(-character.maxHp, hp + delta + absorbed);
  } else {
    hp = Math.min(character.maxHp, hp + delta);
  }
  return { hp, tempHp };
};

/** Annonce les nouveaux PV d'une fiche : toute la table pour un PJ, le MJ seul pour un PNJ. */
export const emitCharacterHp = (character) => {
  if (!character.campaignId) return;
  const payload = {
    characterId: character.id,
    hp: character.hp,
    tempHp: character.tempHp,
    maxHp: character.maxHp,
  };
  if (character.isNpc) emitToGMs(character.campaignId, 'character:hp', payload);
  else emitToCampaign(character.campaignId, 'character:hp', payload);
};

/**
 * Recopie les PV d'une fiche sur tous ses pions de la campagne et les diffuse.
 * `by` signe l'entree ajoutee a l'historique des PV de chaque pion modifie.
 */
export const syncTokensFromCharacter = async (character, { by, exceptTokenId } = {}) => {
  if (!character.campaignId) return;
  const campaign = await prisma.campaign.findUnique({
    where: { id: character.campaignId },
    select: { id: true, gmId: true },
  });
  if (!campaign) return;
  const tokens = await prisma.token.findMany({
    where: { characterId: character.id, scene: { campaignId: campaign.id } },
  });
  for (const existing of tokens) {
    if (existing.id === exceptTokenId) continue;
    if (existing.hp === character.hp && existing.maxHp === character.maxHp) continue;
    const data = { hp: character.hp, maxHp: character.maxHp };
    if (existing.hp != null && existing.hp !== character.hp) {
      const log = Array.isArray(existing.hpLog) ? existing.hpLog : [];
      const entry = { at: new Date().toISOString(), delta: character.hp - existing.hp, hp: character.hp, by };
      data.hpLog = [...log, entry].slice(-100);
    }
    const token = await prisma.token.update({ where: { id: existing.id }, data });
    await broadcastToken(campaign, 'token:updated', token);
  }
};

/**
 * Inverse : des PV saisis sur un pion lie a une fiche sont reportes sur la
 * fiche, puis sur les autres pions du meme personnage.
 */
export const syncCharacterFromToken = async (token, { by } = {}) => {
  if (!token.characterId || token.hp == null) return;
  const character = await prisma.character.findUnique({ where: { id: token.characterId } });
  if (!character) return;
  const data = {};
  if (token.hp !== character.hp) data.hp = token.hp;
  if (token.maxHp != null && token.maxHp > 0 && token.maxHp !== character.maxHp) data.maxHp = token.maxHp;
  if (!Object.keys(data).length) return;
  const updated = await prisma.character.update({ where: { id: character.id }, data });
  emitCharacterHp(updated);
  await syncTokensFromCharacter(updated, { by, exceptTokenId: token.id });
};
