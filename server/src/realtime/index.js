import { Server } from 'socket.io';
import { prisma } from '../lib/db.js';
import { env } from '../lib/env.js';
import { verifyToken } from '../lib/auth.js';
import { rollDice, parseRollCommand } from '../lib/dice.js';
import { setIo, roomCampaign, roomGM, roomUser, emitToCampaign, emitToGMs, emitToUser } from './hub.js';

/** Presence en memoire : campaignId -> Map(userId -> { user, sockets:Set }) */
const presence = new Map();

const addPresence = (campaignId, user, socketId) => {
  if (!presence.has(campaignId)) presence.set(campaignId, new Map());
  const room = presence.get(campaignId);
  const entry = room.get(user.id) ?? { user, sockets: new Set() };
  entry.sockets.add(socketId);
  entry.user = user;
  room.set(user.id, entry);
  return [...room.values()].map((e) => e.user);
};

const removePresence = (campaignId, userId, socketId) => {
  const room = presence.get(campaignId);
  if (!room) return [];
  const entry = room.get(userId);
  if (entry) {
    entry.sockets.delete(socketId);
    if (!entry.sockets.size) room.delete(userId);
  }
  if (!room.size) presence.delete(campaignId);
  return [...(presence.get(campaignId)?.values() ?? [])].map((e) => e.user);
};

export const listOnline = (campaignId) =>
  [...(presence.get(campaignId)?.values() ?? [])].map((e) => e.user);

const membershipOf = async (campaignId, userId) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, gmId: true, members: { where: { userId }, select: { role: true, color: true } } },
  });
  if (!campaign || !campaign.members.length) return null;
  return {
    campaign,
    isGM: campaign.gmId === userId || campaign.members[0].role === 'GM',
    color: campaign.members[0].color,
  };
};

const persistMessage = (data) =>
  prisma.chatMessage.create({
    data,
    include: { user: { select: { id: true, username: true, avatarUrl: true } } },
  });

/** Route un message de chat vers la bonne audience (table, MJ, ou cible d'un /w). */
const dispatchMessage = (campaignId, message, { isGM }) => {
  if (message.whisperTo) {
    emitToUser(message.whisperTo, 'chat:message', { message });
    if (message.userId) emitToUser(message.userId, 'chat:message', { message });
    if (!isGM) emitToGMs(campaignId, 'chat:message', { message });
  } else {
    emitToCampaign(campaignId, 'chat:message', { message });
  }
};

export const attachRealtime = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    maxHttpBufferSize: 1e6,
    pingTimeout: 25000,
  });
  setIo(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Token manquant'));
      const payload = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, username: true, avatarUrl: true },
      });
      if (!user) return next(new Error('Compte introuvable'));
      socket.data.user = user;
      socket.join(roomUser(user.id));
      next();
    } catch {
      next(new Error('Authentification invalide'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.data.campaigns = new Set();

    socket.on('campaign:join', async (campaignId, ack) => {
      try {
        if (typeof campaignId !== 'string') return ack?.({ error: 'Accès refusé à cette campagne' });
        const access = await membershipOf(campaignId, user.id);
        if (!access) return ack?.({ error: "Accès refusé à cette campagne" });
        socket.join(roomCampaign(campaignId));
        if (access.isGM) socket.join(roomGM(campaignId));
        socket.data.campaigns.add(campaignId);
        socket.data.isGM = access.isGM;

        const online = addPresence(campaignId, { ...user, isGM: access.isGM, color: access.color }, socket.id);
        emitToCampaign(campaignId, 'presence:updated', { online });
        ack?.({ ok: true, isGM: access.isGM, online });
      } catch (err) {
        ack?.({ error: err.message || 'Erreur interne' });
      }
    });

    socket.on('campaign:leave', (campaignId) => {
      socket.leave(roomCampaign(campaignId));
      socket.leave(roomGM(campaignId));
      socket.data.campaigns.delete(campaignId);
      emitToCampaign(campaignId, 'presence:updated', { online: removePresence(campaignId, user.id, socket.id) });
    });

    /** Deplacement fluide : diffuse sans ecrire en base (la position finale
     *  est persistee par l'appel REST PATCH /tokens à la fin du drag). */
    socket.on('token:drag', ({ campaignId, tokenId, x, y }) => {
      if (!socket.data.campaigns.has(campaignId)) return;
      socket.to(roomCampaign(campaignId)).emit('token:drag', { tokenId, x, y, byUserId: user.id });
    });

    /** Curseurs partages façon Roll20. */
    socket.on('cursor:move', ({ campaignId, x, y }) => {
      if (!socket.data.campaigns.has(campaignId)) return;
      socket.to(roomCampaign(campaignId)).emit('cursor:move', { userId: user.id, username: user.username, x, y });
    });

    /** Marqueur "regardez ici" (ping). */
    socket.on('map:ping', ({ campaignId, x, y, sceneId, focus }) => {
      if (!socket.data.campaigns.has(campaignId)) return;
      const payload = { x, y, sceneId, userId: user.id, username: user.username, focus: Boolean(focus) && socket.data.isGM };
      io.to(roomCampaign(campaignId)).emit('map:ping', payload);
    });

    socket.on('chat:send', async (payload, ack) => {
      try {
        const { campaignId, text, characterName } = payload || {};
        const access = await membershipOf(campaignId, user.id);
        if (!access) return ack?.({ error: 'Accès refusé' });
        const raw = String(text || '').trim().slice(0, 4000);
        if (!raw) return ack?.({ error: 'Message vide' });

        const authorName = characterName?.slice(0, 60) || user.username;

        // Chuchotement : /w pseudo message
        const whisper = /^\/(w|whisper)\s+(\S+)\s+([\s\S]+)$/i.exec(raw);
        if (whisper) {
          const target = await prisma.user.findFirst({ where: { username: whisper[2] } });
          if (!target) return ack?.({ error: `Aucun joueur nomme « ${whisper[2]} »` });
          const message = await persistMessage({
            campaignId,
            userId: user.id,
            authorName,
            type: 'WHISPER',
            content: whisper[3],
            whisperTo: target.id,
          });
          dispatchMessage(campaignId, message, access);
          return ack?.({ ok: true });
        }

        const roll = parseRollCommand(raw);
        if (roll) {
          const result = rollDice(roll.formula, { label: roll.label });
          if (result.error) return ack?.({ error: result.error });
          const message = await persistMessage({
            campaignId,
            userId: user.id,
            authorName,
            type: 'ROLL',
            content: roll.label || roll.formula,
            rollData: result,
            whisperTo: roll.secret ? (access.isGM ? user.id : access.campaign.gmId) : null,
          });
          dispatchMessage(campaignId, message, access);
          return ack?.({ ok: true, roll: result });
        }

        const emote = /^\/(me|em)\s+([\s\S]+)$/i.exec(raw);
        const ooc = /^\/(ooc|o)\s+([\s\S]+)$/i.exec(raw);
        const message = await persistMessage({
          campaignId,
          userId: user.id,
          authorName,
          type: emote ? 'EMOTE' : ooc ? 'OOC' : 'TEXT',
          content: emote?.[2] ?? ooc?.[2] ?? raw,
        });
        dispatchMessage(campaignId, message, access);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ error: err.message || 'Erreur interne' });
      }
    });

    /** Jet lance depuis la fiche de perso ou le pave de des. */
    socket.on('dice:roll', async (payload, ack) => {
      try {
        const { campaignId, formula, label, advantage, secret, characterName } = payload || {};
        const access = await membershipOf(campaignId, user.id);
        if (!access) return ack?.({ error: 'Accès refusé' });
        const result = rollDice(formula, { label: label || '', advantage: advantage || 'none' });
        if (result.error) return ack?.({ error: result.error });
        const message = await persistMessage({
          campaignId,
          userId: user.id,
          authorName: characterName?.slice(0, 60) || user.username,
          type: 'ROLL',
          content: label || formula,
          rollData: result,
          whisperTo: secret ? (access.isGM ? user.id : access.campaign.gmId) : null,
        });
        dispatchMessage(campaignId, message, access);
        ack?.({ ok: true, roll: result });
      } catch (err) {
        ack?.({ error: err.message || 'Erreur interne' });
      }
    });

    /** Le MJ tire une zone de brouillard : applique et persiste. */
    socket.on('fog:update', async ({ campaignId, sceneId, reveals }, ack) => {
      try {
        const access = await membershipOf(campaignId, user.id);
        if (!access?.isGM) return ack?.({ error: 'Action réservée au MJ' });
        if (!Array.isArray(reveals) || reveals.length > 5000) return ack?.({ error: 'Données invalides' });
        const scene = await prisma.scene.update({
          where: { id: sceneId },
          data: { fogReveals: reveals },
        });
        emitToCampaign(campaignId, 'fog:updated', { sceneId: scene.id, reveals: scene.fogReveals });
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ error: err.message });
      }
    });

    /** Calque de dessin partage (traits du MJ et des joueurs). */
    socket.on('draw:update', async ({ campaignId, sceneId, drawings }, ack) => {
      try {
        const access = await membershipOf(campaignId, user.id);
        if (!access) return ack?.({ error: 'Accès refusé' });
        if (!Array.isArray(drawings) || drawings.length > 5000) return ack?.({ error: 'Données invalides' });
        const scene = await prisma.scene.update({ where: { id: sceneId }, data: { drawings } });
        emitToCampaign(campaignId, 'draw:updated', {
          sceneId: scene.id,
          drawings: (scene.drawings || []).filter((d) => d?.layer !== 'GM'),
        });
        emitToGMs(campaignId, 'draw:updated-gm', { sceneId: scene.id, drawings: scene.drawings });
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ error: err.message });
      }
    });

    socket.on('disconnect', () => {
      for (const campaignId of socket.data.campaigns) {
        emitToCampaign(campaignId, 'presence:updated', {
          online: removePresence(campaignId, user.id, socket.id),
        });
      }
    });
  });

  return io;
};
