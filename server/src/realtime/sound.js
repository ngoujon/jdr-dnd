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
const cleanVolume = (volume) => Math.max(0, Math.min(1, Number.isFinite(Number(volume)) ? Number(volume) : 0.6));
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

/**
 * Joue le son de critique apres un jet. Un jet secret ne s'entend que chez
 * ceux qui le voient : le son ne doit pas trahir un 20 cache par le MJ.
 */
export const playCritSound = async (io, campaignId, message) => {
  const roll = message?.rollData;
  if (!roll || (!roll.crit && !roll.fumble)) return;
  // Avantage et desavantage peuvent donner les deux : le de garde decide.
  const success = roll.crit;
  const campaign = await prisma.campaign
    .findUnique({ where: { id: campaignId }, select: { critSuccessSoundUrl: true, critFailSoundUrl: true } })
    .catch(() => null);
  const url = success ? campaign?.critSuccessSoundUrl : campaign?.critFailSoundUrl;
  if (!url) return;
  const payload = { url, name: success ? 'Réussite critique' : 'Échec critique', volume: 0.9 };
  if (message.whisperTo) {
    io.to(roomUser(message.whisperTo)).emit('sound:sfx', payload);
    if (message.userId && message.userId !== message.whisperTo) io.to(roomUser(message.userId)).emit('sound:sfx', payload);
  } else {
    io.to(roomCampaign(campaignId)).emit('sound:sfx', payload);
  }
};
