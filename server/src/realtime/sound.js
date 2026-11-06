/**
 * Ambiance sonore pilotee par le MJ : une musique de fond en boucle, des
 * effets ponctuels, et un son sur les jets critiques.
 *
 * Les fichiers sont lus par chaque navigateur ; le serveur ne fait que dire
 * quoi jouer et depuis quand (un joueur qui arrive en cours de morceau le
 * reprend au bon endroit). La musique en cours vit en memoire ; les sons de
 * critique sont enregistres sur la campagne.
 */
import { prisma } from '../lib/db.js';
import { roomCampaign, roomUser } from './hub.js';

/** campaignId -> { url, name, volume, startedAt } */
const music = new Map();

/** Seuls des fichiers du site sont acceptes (pas d'adresse externe imposee aux joueurs). */
const cleanUrl = (url) => (typeof url === 'string' && /^\/[^/]/.test(url) && url.length <= 500 ? url : null);
/** Volume « table » par defaut (100 %) : il se multiplie par le reglage de
 *  chaque auditeur, lui-meme a 50 % par defaut (web/src/lib/sound.js). */
const DEFAULT_VOLUME = 1;
const cleanVolume = (volume) =>
  Math.max(0, Math.min(1, volume != null && Number.isFinite(Number(volume)) ? Number(volume) : DEFAULT_VOLUME));
const cleanName = (name) => String(name || '').slice(0, 80);

export const attachSound = (io, socket) => {
  const isGMOf = (campaignId) =>
    typeof campaignId === 'string' && socket.data.campaigns.has(campaignId) && socket.data.isGM;

  socket.on('sound:state', async (campaignId, ack) => {
    if (typeof campaignId !== 'string') return ack?.({ error: 'Accès refusé' });
    // Demande envoyee juste apres l'entree dans la campagne : celle-ci peut
    // ne pas etre encore enregistree sur le socket, on verifie en base.
    if (!socket.data.campaigns.has(campaignId)) {
      const member = await prisma.membership
        .findUnique({ where: { campaignId_userId: { campaignId, userId: socket.data.user.id } } })
        .catch(() => null);
      if (!member) return ack?.({ error: 'Accès refusé' });
    }
    const campaign = await prisma.campaign
      .findUnique({ where: { id: campaignId }, select: { critSuccessSoundUrl: true, critFailSoundUrl: true } })
      .catch(() => null);
    ack?.({
      music: music.get(campaignId) || null,
      serverNow: Date.now(),
      critSuccessUrl: campaign?.critSuccessSoundUrl || null,
      critFailUrl: campaign?.critFailSoundUrl || null,
    });
  });

  /** Lance (ou arrete, url vide) la musique d'ambiance pour toute la table. */
  socket.on('sound:music', ({ campaignId, url, name, volume } = {}) => {
    if (!isGMOf(campaignId)) return;
    const clean = cleanUrl(url);
    if (clean) music.set(campaignId, { url: clean, name: cleanName(name), volume: cleanVolume(volume), startedAt: Date.now() });
    else music.delete(campaignId);
    io.to(roomCampaign(campaignId)).emit('sound:music', { music: music.get(campaignId) || null, serverNow: Date.now() });
  });

  socket.on('sound:music-volume', ({ campaignId, volume } = {}) => {
    if (!isGMOf(campaignId)) return;
    const current = music.get(campaignId);
    if (!current) return;
    current.volume = cleanVolume(volume);
    io.to(roomCampaign(campaignId)).emit('sound:music-volume', { volume: current.volume });
  });

  /** Effet sonore joue une fois chez tout le monde. */
  socket.on('sound:sfx', ({ campaignId, url, name, volume } = {}) => {
    if (!isGMOf(campaignId)) return;
    const clean = cleanUrl(url);
    if (!clean) return;
    io.to(roomCampaign(campaignId)).emit('sound:sfx', { url: clean, name: cleanName(name), volume: cleanVolume(volume) });
  });

  socket.on('sound:crit-config', async ({ campaignId, critSuccessUrl, critFailUrl } = {}, ack) => {
    if (!isGMOf(campaignId)) return ack?.({ error: 'Action réservée au MJ' });
    try {
      const data = {};
      if (critSuccessUrl !== undefined) data.critSuccessSoundUrl = cleanUrl(critSuccessUrl);
      if (critFailUrl !== undefined) data.critFailSoundUrl = cleanUrl(critFailUrl);
      const campaign = await prisma.campaign.update({ where: { id: campaignId }, data });
      ack?.({ ok: true, critSuccessUrl: campaign.critSuccessSoundUrl, critFailUrl: campaign.critFailSoundUrl });
    } catch (err) {
      ack?.({ error: err.message });
    }
  });
};

/* --- Declencheurs automatiques ------------------------------------------- */

/** Mode par defaut : une scene lance une musique, les autres evenements un effet. */
const defaultMode = (trigger) => (trigger === 'SCENE' ? 'music' : 'sfx');

/**
 * Joue un son d'un dossier du MJ dont le declencheur correspond a l'evenement
 * (tire au hasard dans le dossier, pour varier). `userIds` limite l'audience
 * (jet secret) ; sinon toute la table entend. Renvoie vrai si un son est parti.
 */
export const fireSoundTrigger = async (io, campaignId, trigger, { sceneId = null, userIds = null } = {}) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmId: true } }).catch(() => null);
  if (!campaign) return false;
  const folders = await prisma.folder
    .findMany({
      where: { ownerId: campaign.gmId, scope: 'AUDIO', trigger, ...(trigger === 'SCENE' ? { triggerSceneId: sceneId } : {}) },
      include: { assets: { include: { asset: { select: { url: true, name: true, kind: true } } } } },
    })
    .catch(() => []);
  const candidates = folders.flatMap((folder) =>
    folder.assets
      .filter((entry) => entry.asset?.kind === 'AUDIO')
      .map((entry) => ({ ...entry.asset, mode: folder.triggerMode || defaultMode(trigger) })),
  );
  if (!candidates.length) return false;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  if (pick.mode === 'music' && !userIds) {
    music.set(campaignId, { url: pick.url, name: cleanName(pick.name), volume: DEFAULT_VOLUME, startedAt: Date.now() });
    io.to(roomCampaign(campaignId)).emit('sound:music', { music: music.get(campaignId), serverNow: Date.now() });
  } else {
    const payload = { url: pick.url, name: cleanName(pick.name), volume: DEFAULT_VOLUME };
    if (userIds) for (const id of new Set(userIds)) io.to(roomUser(id)).emit('sound:sfx', payload);
    else io.to(roomCampaign(campaignId)).emit('sound:sfx', payload);
  }
  return true;
};

/**
 * Son des jets critiques. Un jet secret ne s'entend que chez ceux qui le
 * voient : le son ne doit pas trahir un 20 cache par le MJ.
 */
export const playCritSound = async (io, campaignId, message) => {
  const roll = message?.rollData;
  if (!roll || (!roll.crit && !roll.fumble)) return;
  // Avantage et desavantage peuvent donner les deux : la reussite l'emporte.
  const success = roll.crit;
  const userIds = message.whisperTo ? [message.whisperTo, message.userId].filter(Boolean) : null;
  if (await fireSoundTrigger(io, campaignId, success ? 'CRIT_SUCCESS' : 'CRIT_FAIL', { userIds })) return;

  // Ancien reglage (un son choisi par campagne), garde tant qu'il est rempli.
  const campaign = await prisma.campaign
    .findUnique({ where: { id: campaignId }, select: { critSuccessSoundUrl: true, critFailSoundUrl: true } })
    .catch(() => null);
  const url = success ? campaign?.critSuccessSoundUrl : campaign?.critFailSoundUrl;
  if (!url) return;
  const payload = { url, name: success ? 'Réussite critique' : 'Échec critique', volume: DEFAULT_VOLUME };
  if (userIds) for (const id of new Set(userIds)) io.to(roomUser(id)).emit('sound:sfx', payload);
  else io.to(roomCampaign(campaignId)).emit('sound:sfx', payload);
};
