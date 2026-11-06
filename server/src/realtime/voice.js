/**
 * Chat vocal : deux salons par campagne, en pair-a-pair (WebRTC).
 *
 * Le serveur ne transporte aucun son : il tient la liste des participants de
 * chaque salon et relaie les messages de negociation (offres, reponses,
 * candidats ICE) entre navigateurs. Le volume selon la distance entre les
 * pions est calcule par chaque navigateur.
 */
import { roomCampaign } from './hub.js';

export const VOICE_ROOMS = ['1', '2'];

/** campaignId -> { rooms: { '1': Map(socketId -> participant), '2': ... }, gmBroadcast } */
const voice = new Map();

const stateOf = (campaignId) => {
  if (!voice.has(campaignId)) {
    voice.set(campaignId, {
      rooms: Object.fromEntries(VOICE_ROOMS.map((r) => [r, new Map()])),
      gmBroadcast: true,
    });
  }
  return voice.get(campaignId);
};

/** Vue publique : qui est dans quel salon, et si le MJ parle a toute la carte. */
const snapshot = (campaignId) => {
  const state = stateOf(campaignId);
  return {
    rooms: Object.fromEntries(Object.entries(state.rooms).map(([room, members]) => [room, [...members.values()]])),
    gmBroadcast: state.gmBroadcast,
  };
};

export const attachVoice = (io, socket) => {
  const user = socket.data.user;
  // Salon occupe par ce socket : { campaignId, room } ou null.
  let current = null;

  const publish = (campaignId) => io.to(roomCampaign(campaignId)).emit('voice:state', snapshot(campaignId));

  const leave = () => {
    if (!current) return;
    const { campaignId, room } = current;
    current = null;
    const members = stateOf(campaignId).rooms[room];
    members.delete(socket.id);
    for (const peerId of members.keys()) io.to(peerId).emit('voice:peer-left', { peerId: socket.id });
    publish(campaignId);
  };

  socket.on('voice:state', (campaignId, ack) => {
    if (typeof campaignId !== 'string' || !socket.data.campaigns.has(campaignId)) return ack?.({ error: 'Accès refusé' });
    ack?.(snapshot(campaignId));
  });

  /** Entree dans un salon : on recoit la liste des pairs a qui envoyer une offre. */
  socket.on('voice:join', ({ campaignId, room } = {}, ack) => {
    if (typeof campaignId !== 'string' || !socket.data.campaigns.has(campaignId)) return ack?.({ error: 'Accès refusé' });
    if (!VOICE_ROOMS.includes(String(room))) return ack?.({ error: 'Salon inconnu' });
    leave();
    const members = stateOf(campaignId).rooms[String(room)];
    const peers = [...members.values()];
    current = { campaignId, room: String(room) };
    members.set(socket.id, {
      peerId: socket.id,
      userId: user.id,
      username: user.username,
      isGM: Boolean(socket.data.isGM),
    });
    publish(campaignId);
    ack?.({ ok: true, peers });
  });

  socket.on('voice:leave', () => leave());

  /** Relais de negociation WebRTC, uniquement entre membres du meme salon. */
  socket.on('voice:signal', ({ to, data } = {}) => {
    if (!current || typeof to !== 'string') return;
    const members = stateOf(current.campaignId).rooms[current.room];
    if (!members.has(to)) return;
    io.to(to).emit('voice:signal', { from: socket.id, data });
  });

  /** Le MJ choisit : parler a toute la carte, ou seulement autour de son pion. */
  socket.on('voice:gm-broadcast', ({ campaignId, on } = {}) => {
    if (typeof campaignId !== 'string' || !socket.data.campaigns.has(campaignId) || !socket.data.isGM) return;
    stateOf(campaignId).gmBroadcast = Boolean(on);
    publish(campaignId);
  });

  socket.on('disconnect', leave);
};
