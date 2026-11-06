/**
 * Chat vocal de proximite.
 *
 * Deux salons par campagne. Le son passe directement d'un navigateur a
 * l'autre (WebRTC, maillage complet) ; le serveur ne fait que mettre les
 * navigateurs en relation. Chaque voix recue passe par un reglage de volume
 * et de balance gauche/droite calcule d'apres la distance entre les pions :
 * plus un joueur est loin sur la carte, moins on l'entend.
 *
 * Regles :
 * - le MJ entend toujours tout le monde a plein volume ;
 * - « Parler a toute la carte » active : tout le monde entend le MJ a plein
 *   volume ; desactive, on l'entend selon la distance a son pion de MJ ;
 * - sans pion sur la carte (le sien ou celui de l'autre), pas d'attenuation.
 *
 * Le moteur vit hors des composants : changer d'onglet ne coupe pas l'appel.
 */
import { create } from 'zustand';
import { getSocket } from './socket.js';
import { useAuth, useTable } from './store.js';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

/** Distances en metres : plein volume jusqu'a FULL, silence a partir de SILENT. */
export const VOICE_FULL_METERS = 4.5;
export const VOICE_SILENT_METERS = 18;

export const useVoice = create(() => ({
  /** Salon rejoint ('1', '2') ou null. */
  room: null,
  joining: false,
  muted: false,
  error: null,
  /** Etat serveur : membres de chaque salon, mode de diffusion du MJ. */
  rooms: { 1: [], 2: [] },
  gmBroadcast: true,
  /** peerId -> { gain (0..1), connected } pour l'affichage. */
  levels: {},
}));

let audioCtx = null;
let localStream = null;
let campaignOfRoom = null;
let unsubscribeTable = null;
let gainFrame = 0;
let listening = false;
/** peerId -> { pc, pending: candidats en attente, nodes } */
const peers = new Map();

const socket = () => getSocket();
const signal = (to, data) => socket().emit('voice:signal', { to, data });

/* --- Positions et volumes -------------------------------------------------- */

const centerOf = (token, ghosts) => {
  const ghost = ghosts[token.id];
  const x = ghost?.x ?? token.x;
  const y = ghost?.y ?? token.y;
  return { x: x + (token.width || 0) / 2, y: y + (token.height || 0) / 2 };
};

/** Pion qui represente une personne : le pion de MJ pour le MJ, sinon celui de son personnage. */
const positionOf = (userId, isGM, table) => {
  const { tokens, characters, ghosts } = table;
  let token;
  if (isGM) {
    token = tokens.find((t) => t.isGmPawn);
  } else {
    const owned = new Set(characters.filter((c) => c.ownerId === userId && !c.isNpc).map((c) => c.id));
    token =
      tokens.find((t) => t.characterId && owned.has(t.characterId)) ||
      tokens.find((t) => t.ownerId === userId && !t.isGmPawn);
  }
  return token ? centerOf(token, ghosts || {}) : null;
};

/** Metres par pixel de la scene ouverte (l'echelle se regle par scene). */
const metersPerPixel = (scene) => {
  const units = (scene?.scaleUnits || 1.5) / (scene?.scalePx || 70);
  const label = String(scene?.unitLabel || 'm').toLowerCase();
  return label.startsWith('ft') || label.startsWith('pi') ? units * 0.3048 : units;
};

const falloff = (meters) => {
  if (meters <= VOICE_FULL_METERS) return 1;
  if (meters >= VOICE_SILENT_METERS) return 0;
  const t = (meters - VOICE_FULL_METERS) / (VOICE_SILENT_METERS - VOICE_FULL_METERS);
  // Courbe douce : la voix baisse vite au debut, puis s'eteint progressivement.
  return (1 - t) ** 2;
};

const memberOf = (peerId) => {
  const { rooms, room } = useVoice.getState();
  return (rooms[room] || []).find((m) => m.peerId === peerId) || null;
};

/** Volume et balance d'une voix recue, d'apres les regles ci-dessus. */
const mixFor = (peerId) => {
  const table = useTable.getState();
  const me = useAuth.getState().user;
  const speaker = memberOf(peerId);
  if (!speaker || !me) return { gain: 1, pan: 0 };
  if (table.isGM) return { gain: 1, pan: 0 };
  if (speaker.isGM && useVoice.getState().gmBroadcast) return { gain: 1, pan: 0 };
  const mine = positionOf(me.id, false, table);
  const theirs = positionOf(speaker.userId, speaker.isGM, table);
  if (!mine || !theirs) return { gain: 1, pan: 0 };
  const scale = metersPerPixel(table.scene);
  const dx = (theirs.x - mine.x) * scale;
  const dy = (theirs.y - mine.y) * scale;
  const meters = Math.hypot(dx, dy);
  const pan = Math.max(-1, Math.min(1, dx / VOICE_SILENT_METERS)) * 0.7;
  return { gain: falloff(meters), pan };
};

const applyGains = () => {
  gainFrame = 0;
  const levels = {};
  for (const [peerId, peer] of peers) {
    const { gain, pan } = mixFor(peerId);
    levels[peerId] = { gain, connected: peer.connected };
    if (peer.nodes && audioCtx) {
      peer.nodes.gain.gain.setTargetAtTime(gain, audioCtx.currentTime, 0.12);
      peer.nodes.panner.pan.setTargetAtTime(pan, audioCtx.currentTime, 0.12);
    }
  }
  useVoice.setState({ levels });
};

/** Les pions bougent souvent (glisser) : un seul calcul par image. */
const scheduleGains = () => {
  if (!gainFrame) gainFrame = requestAnimationFrame(applyGains);
};

/* --- Connexions pair-a-pair ------------------------------------------------ */

const attachAudio = (peerId, stream) => {
  const peer = peers.get(peerId);
  if (!peer || peer.nodes || !audioCtx) return;
  // Chrome ne fait sortir le son d'un flux distant dans Web Audio que si ce
  // flux est aussi lu par un element audio (ici muet).
  const element = new Audio();
  element.muted = true;
  element.srcObject = stream;
  element.play().catch(() => {});
  const source = audioCtx.createMediaStreamSource(stream);
  const gain = audioCtx.createGain();
  const panner = audioCtx.createStereoPanner();
  source.connect(gain).connect(panner).connect(audioCtx.destination);
  peer.nodes = { element, source, gain, panner };
  scheduleGains();
};

const closePeer = (peerId) => {
  const peer = peers.get(peerId);
  if (!peer) return;
  peers.delete(peerId);
  try {
    peer.nodes?.source.disconnect();
    peer.nodes?.panner.disconnect();
    if (peer.nodes) peer.nodes.element.srcObject = null;
    peer.pc.close();
  } catch {
    /* connexion deja fermee */
  }
  scheduleGains();
};

const createPeer = (peerId, initiator) => {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const peer = { pc, pending: [], nodes: null, connected: false };
  peers.set(peerId, peer);
  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
  pc.onicecandidate = (e) => {
    if (e.candidate) signal(peerId, { candidate: e.candidate });
  };
  pc.ontrack = (e) => attachAudio(peerId, e.streams[0] || new MediaStream([e.track]));
  pc.onconnectionstatechange = () => {
    peer.connected = pc.connectionState === 'connected';
    if (pc.connectionState === 'failed') closePeer(peerId);
    scheduleGains();
  };
  if (initiator) {
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => signal(peerId, { sdp: pc.localDescription }))
      .catch(() => closePeer(peerId));
  }
  return peer;
};

const onSignal = async ({ from, data }) => {
  if (!useVoice.getState().room || !localStream || !data) return;
  const peer = peers.get(from) || createPeer(from, false);
  const { pc } = peer;
  try {
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        signal(from, { sdp: pc.localDescription });
      }
      for (const candidate of peer.pending.splice(0)) await pc.addIceCandidate(candidate).catch(() => {});
    } else if (data.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
      else peer.pending.push(data.candidate);
    }
  } catch {
    closePeer(from);
  }
};

/* --- API --------------------------------------------------------------------- */

/** Branche les evenements du salon vocal (une fois) et recupere l'etat des salons. */
export const listenVoice = (campaignId) => {
  const s = socket();
  if (!listening) {
    listening = true;
    s.on('voice:state', (state) => {
      useVoice.setState({ rooms: state.rooms, gmBroadcast: state.gmBroadcast });
      scheduleGains();
    });
    s.on('voice:signal', onSignal);
    s.on('voice:peer-left', ({ peerId }) => closePeer(peerId));
    // Apres une coupure reseau, le serveur a oublie notre place : on la reprend.
    s.io.on('reconnect', () => {
      const { room } = useVoice.getState();
      if (room && campaignOfRoom) setTimeout(() => joinVoice(campaignOfRoom, room).catch(() => {}), 800);
    });
  }
  if (campaignId) {
    s.emit('voice:state', campaignId, (state) => {
      if (state?.rooms) useVoice.setState({ rooms: state.rooms, gmBroadcast: state.gmBroadcast });
    });
  }
};

const closeAllPeers = () => {
  for (const peerId of [...peers.keys()]) closePeer(peerId);
};

export async function joinVoice(campaignId, room) {
  useVoice.setState({ joining: true, error: null });
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Micro indisponible : le chat vocal demande une connexion sécurisée (https).');
    }
    audioCtx ||= new AudioContext();
    await audioCtx.resume();
    if (!localStream) {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    }
    const { muted } = useVoice.getState();
    for (const track of localStream.getAudioTracks()) track.enabled = !muted;
    closeAllPeers();
    listenVoice();
    const res = await new Promise((resolve) => socket().emit('voice:join', { campaignId, room }, resolve));
    if (res?.error) throw new Error(res.error);
    campaignOfRoom = campaignId;
    useVoice.setState({ room: String(room), joining: false });
    // Le nouveau venu appelle ceux deja presents.
    for (const member of res.peers || []) createPeer(member.peerId, true);
    unsubscribeTable ||= useTable.subscribe((state, prev) => {
      // Quitter la campagne raccroche.
      if (state.campaignId !== campaignOfRoom) return leaveVoice();
      if (state.tokens !== prev.tokens || state.ghosts !== prev.ghosts || state.scene !== prev.scene) scheduleGains();
    });
  } catch (err) {
    const message =
      err?.name === 'NotAllowedError'
        ? 'Accès au micro refusé. Autorisez-le dans le navigateur pour parler.'
        : err?.message || 'Impossible de rejoindre le salon';
    useVoice.setState({ joining: false, error: message });
    throw err;
  }
}

export function leaveVoice() {
  socket().emit('voice:leave');
  closeAllPeers();
  for (const track of localStream?.getTracks() || []) track.stop();
  localStream = null;
  campaignOfRoom = null;
  unsubscribeTable?.();
  unsubscribeTable = null;
  useVoice.setState({ room: null, levels: {}, joining: false });
}

export function setVoiceMuted(muted) {
  for (const track of localStream?.getAudioTracks() || []) track.enabled = !muted;
  useVoice.setState({ muted });
}

export function setGmBroadcast(campaignId, on) {
  socket().emit('voice:gm-broadcast', { campaignId, on });
}
