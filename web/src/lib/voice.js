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

/* --- Reglages du micro, propres a chaque personne (gardes dans le navigateur) --- */

const MIC_SETTINGS_KEY = 'jdr.voice.mic';
const MIC_DEFAULTS = { threshold: 0, noiseSuppression: false };

/*
 * Le seuil se regle directement sur l'indicateur de niveau, comme dans Discord :
 * 0..100 = position sur la barre (de -70 dB a 0 dB). Tout son a gauche du
 * curseur est coupe, tout son a droite passe. 0 = aucun seuil, tout passe.
 */
const METER_MIN_DB = -70;

const loadMicSettings = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(MIC_SETTINGS_KEY) || '{}');
    return {
      threshold: Number.isFinite(saved.threshold) ? Math.max(0, Math.min(100, saved.threshold)) : MIC_DEFAULTS.threshold,
      noiseSuppression: typeof saved.noiseSuppression === 'boolean' ? saved.noiseSuppression : MIC_DEFAULTS.noiseSuppression,
    };
  } catch {
    return { ...MIC_DEFAULTS };
  }
};

const saveMicSettings = () => {
  const { threshold, noiseSuppression } = useVoice.getState();
  try {
    localStorage.setItem(MIC_SETTINGS_KEY, JSON.stringify({ threshold, noiseSuppression }));
  } catch {
    /* stockage indisponible : le reglage vaut pour cette visite */
  }
};

/** Position sur la barre (0..100) -> amplitude du seuil (0 = pas de seuil). */
const thresholdToAmplitude = (threshold) =>
  threshold <= 0 ? 0 : 10 ** ((METER_MIN_DB + (threshold / 100) * -METER_MIN_DB) / 20);

/** Niveau du micro (amplitude 0..1) -> position sur la barre (0..100). */
export const levelToMeter = (level) => {
  if (!(level > 0)) return 0;
  const db = 20 * Math.log10(level);
  return Math.max(0, Math.min(100, ((db - METER_MIN_DB) / -METER_MIN_DB) * 100));
};

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
  /** Reglages du micro (par personne). */
  ...loadMicSettings(),
  /** Niveau du micro (amplitude 0..1) et micro « ouvert » (au-dessus du seuil). */
  micLevel: 0,
  micOpen: true,
  /** Test du micro en cours (niveau visible sans etre dans un salon). */
  testing: false,
}));

/*
 * Porte de bruit : coupe le micro quand le son reste sous le seuil, avec un
 * petit maintien pour ne pas hacher la fin des mots. Tourne dans le fil audio
 * (AudioWorklet), donc continue meme si l'onglet passe en arriere-plan.
 */
const GATE_WORKLET = `
class MicGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'threshold', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }];
  }
  constructor() {
    super();
    this.gain = 1; this.open = 1; this.hold = 0; this.level = 0; this.blocks = 0;
    this.attack = 1 - Math.exp(-1 / (0.005 * sampleRate));
    this.release = 1 - Math.exp(-1 / (0.08 * sampleRate));
  }
  process(inputs, outputs, params) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    const ch = input[0];
    const n = ch ? ch.length : 128;
    let sum = 0;
    if (ch) for (let i = 0; i < n; i++) sum += ch[i] * ch[i];
    const rms = ch ? Math.sqrt(sum / n) : 0;
    this.level = Math.max(rms, this.level * 0.94);
    const threshold = params.threshold[0];
    if (threshold <= 0 || rms >= threshold) { this.open = 1; this.hold = sampleRate * 0.35; }
    else if (this.hold > 0) this.hold -= n;
    else this.open = 0;
    const coef = this.open > this.gain ? this.attack : this.release;
    for (let c = 0; c < output.length; c++) {
      const out = output[c];
      const src = input[c] || ch;
      let g = this.gain;
      for (let i = 0; i < out.length; i++) {
        g += (this.open - g) * coef;
        out[i] = src ? src[i] * g : 0;
      }
      if (c === output.length - 1) this.gain = g;
    }
    if (++this.blocks >= 16) {
      this.blocks = 0;
      this.port.postMessage({ level: this.level, open: this.open === 1 });
    }
    return true;
  }
}
registerProcessor('mic-gate', MicGate);
`;

let audioCtx = null;
/** Flux envoye aux autres (sortie de la chaine micro). */
let localStream = null;
/** Chaine micro : { raw, source, highpass, gate, dest } ou { raw } sans traitement. */
let mic = null;
let gateModule = null;
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
  // Spatialisation coupee par le MJ pour cette scene : tout le monde s'entend pareil.
  if (table.scene?.voiceProximity === false) return { gain: 1, pan: 0 };
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

/* --- Micro : capture, suppresseur de bruit, sensibilite ------------------------ */

const micConstraints = () => ({
  audio: {
    echoCancellation: true,
    noiseSuppression: useVoice.getState().noiseSuppression,
    autoGainControl: true,
  },
});

const loadGateModule = () => {
  if (!gateModule) {
    const url = URL.createObjectURL(new Blob([GATE_WORKLET], { type: 'application/javascript' }));
    gateModule = audioCtx.audioWorklet
      .addModule(url)
      .catch((err) => {
        gateModule = null;
        throw err;
      })
      .finally(() => URL.revokeObjectURL(url));
  }
  return gateModule;
};

/** Applique sensibilite et filtre anti-bruit a la chaine en place. */
const applyMicSettings = () => {
  if (!mic?.gate || !audioCtx) return;
  const { threshold, noiseSuppression } = useVoice.getState();
  mic.gate.parameters.get('threshold').setValueAtTime(thresholdToAmplitude(threshold), audioCtx.currentTime);
  // Le suppresseur coupe aussi les grondements graves (ventilateur, clavier, souffle).
  mic.highpass.frequency.setTargetAtTime(noiseSuppression ? 110 : 10, audioCtx.currentTime, 0.02);
};

async function openMic() {
  const raw = await navigator.mediaDevices.getUserMedia(micConstraints());
  let gate = null;
  try {
    await loadGateModule();
    gate = new AudioWorkletNode(audioCtx, 'mic-gate', { outputChannelCount: [1] });
  } catch {
    gate = null;
  }
  if (!gate) {
    // Navigateur sans AudioWorklet : on envoie le micro tel quel.
    mic = { raw };
    localStream = raw;
    return;
  }
  const source = audioCtx.createMediaStreamSource(raw);
  const highpass = audioCtx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 10;
  const dest = audioCtx.createMediaStreamDestination();
  source.connect(highpass).connect(gate).connect(dest);
  gate.port.onmessage = (e) => {
    const { room, testing } = useVoice.getState();
    if (room || testing) useVoice.setState({ micLevel: e.data.level, micOpen: e.data.open });
  };
  mic = { raw, source, highpass, gate, dest };
  localStream = dest.stream;
  applyMicSettings();
}

function closeMic() {
  for (const track of mic?.raw.getTracks() || []) track.stop();
  try {
    mic?.source?.disconnect();
    mic?.gate?.disconnect();
    if (mic?.gate) mic.gate.port.onmessage = null;
  } catch {
    /* deja debranche */
  }
  mic = null;
  localStream = null;
  useVoice.setState({ micLevel: 0, micOpen: true, testing: false });
}

/**
 * Test du micro : allume le micro (sans rien envoyer hors d'un salon) pour
 * voir son niveau en parlant et placer le curseur au bon endroit.
 */
export async function startMicTest() {
  useVoice.setState({ error: null });
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Micro indisponible : il faut une connexion sécurisée (https).');
    }
    audioCtx ||= new AudioContext();
    await audioCtx.resume();
    if (!mic) await openMic();
    if (!mic?.gate) throw new Error('Ce navigateur ne permet pas de tester le micro.');
    useVoice.setState({ testing: true });
  } catch (err) {
    const message =
      err?.name === 'NotAllowedError'
        ? 'Accès au micro refusé. Autorisez-le dans le navigateur.'
        : err?.message || 'Impossible de tester le micro';
    useVoice.setState({ error: message, testing: false });
    if (!useVoice.getState().room) closeMic();
  }
}

/** Arrete le test ; hors d'un salon, le micro est eteint. */
export function stopMicTest() {
  if (!useVoice.getState().testing) return;
  if (useVoice.getState().room) useVoice.setState({ testing: false });
  else closeMic();
}

/** Reprend le micro avec les nouveaux reglages du navigateur, sans couper l'appel. */
async function recaptureMic() {
  if (!mic) return;
  const raw = await navigator.mediaDevices.getUserMedia(micConstraints());
  const old = mic.raw;
  if (mic.gate) {
    const source = audioCtx.createMediaStreamSource(raw);
    source.connect(mic.highpass);
    mic.source.disconnect();
    mic.source = source;
    mic.raw = raw;
  } else {
    // Sans chaine de traitement, on remplace la piste envoyee a chaque pair.
    const track = raw.getAudioTracks()[0];
    track.enabled = !useVoice.getState().muted;
    for (const peer of peers.values()) {
      for (const sender of peer.pc.getSenders()) {
        if (sender.track?.kind === 'audio') sender.replaceTrack(track).catch(() => {});
      }
    }
    mic = { raw };
    localStream = raw;
  }
  for (const track of old.getTracks()) track.stop();
}

/** Seuil du micro (0..100, position sur la barre) : en dessous, on n'envoie rien. */
export function setMicThreshold(threshold) {
  useVoice.setState({ threshold: Math.max(0, Math.min(100, Math.round(threshold))) });
  saveMicSettings();
  applyMicSettings();
}

/** Suppresseur de bruit (celui du navigateur + filtre des graves). */
export async function setNoiseSuppression(on) {
  useVoice.setState({ noiseSuppression: !!on });
  saveMicSettings();
  applyMicSettings();
  try {
    await recaptureMic();
  } catch {
    useVoice.setState({ error: 'Impossible de relancer le micro avec ce réglage.' });
  }
}

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
    if (!mic) await openMic();
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
  closeMic();
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
