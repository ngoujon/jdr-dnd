/**
 * Point d'accès unique au serveur Socket.IO : permet aux routes REST de diffuser
 * des événements sans dépendre du module de configuration des sockets.
 */
let io = null;

export const setIo = (instance) => {
  io = instance;
};

export const getIo = () => io;

export const roomCampaign = (campaignId) => `campaign:${campaignId}`;
export const roomGM = (campaignId) => `campaign:${campaignId}:gm`;
export const roomUser = (userId) => `user:${userId}`;

export const emitToCampaign = (campaignId, event, payload) => {
  io?.to(roomCampaign(campaignId)).emit(event, payload);
};

/** Diffuse uniquement aux MJ (pions caches, notes de scene, PNJ secrets). */
export const emitToGMs = (campaignId, event, payload) => {
  io?.to(roomGM(campaignId)).emit(event, payload);
};

export const emitToUser = (userId, event, payload) => {
  io?.to(roomUser(userId)).emit(event, payload);
};
