/**
 * Lecture de l'ambiance sonore decidee par le MJ : musique de fond en boucle
 * et effets ponctuels, joues dans chaque navigateur.
 *
 * Les navigateurs bloquent le son tant que la personne n'a pas interagi avec
 * la page : dans ce cas `blocked` passe a vrai et un bouton propose de
 * l'activer d'un clic.
 */
import { create } from 'zustand';
import { getSocket } from './socket.js';
import { useTable } from './store.js';

const readVolume = (key, fallback) => {
  try {
    const value = Number(localStorage.getItem(key));
    return localStorage.getItem(key) != null && Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
};
const saveVolume = (key, value) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* stockage indisponible : le reglage vaut pour cette visite */
  }
};

export const useSound = create(() => ({
  /** Musique en cours pour la table : { url, name, volume, startedAt } ou null. */
  music: null,
  /** Le navigateur attend un clic avant de jouer du son. */
  blocked: false,
  /** Reglages personnels de chaque auditeur (0..1). */
  // 50 % par defaut pour tout le monde : les premiers essais du MJ ne doivent
  // pas casser les oreilles. Chacun remonte ensuite son volume s'il veut.
  musicVolume: readVolume('sound:music-volume', 0.5),
  sfxVolume: readVolume('sound:sfx-volume', 0.5),
  critSuccessUrl: null,
  critFailUrl: null,
}));

let musicEl = null;
let listening = false;
let campaignOfMusic = null;

const blockedIfRefused = (promise) =>
  promise?.catch?.((err) => {
    if (err?.name === 'NotAllowedError') useSound.setState({ blocked: true });
  });

const musicLevel = () => {
  const { music, musicVolume } = useSound.getState();
  return Math.max(0, Math.min(1, (music?.volume ?? 1) * musicVolume));
};

const stopMusic = () => {
  if (musicEl) {
    musicEl.pause();
    musicEl.src = '';
  }
  musicEl = null;
};

/** Demarre le morceau a l'endroit ou en est la table (arrivee en cours de route). */
const startMusic = (music, serverNow) => {
  stopMusic();
  useSound.setState({ music });
  if (!music) return;
  const el = new Audio(music.url);
  el.loop = true;
  el.volume = musicLevel();
  const elapsed = Math.max(0, ((serverNow || Date.now()) - music.startedAt) / 1000);
  el.addEventListener(
    'loadedmetadata',
    () => {
      if (elapsed > 1 && Number.isFinite(el.duration) && el.duration > 0) el.currentTime = elapsed % el.duration;
    },
    { once: true },
  );
  musicEl = el;
  blockedIfRefused(el.play());
};

const playSfx = ({ url, volume }) => {
  const el = new Audio(url);
  el.volume = Math.max(0, Math.min(1, (volume ?? 1) * useSound.getState().sfxVolume));
  blockedIfRefused(el.play());
};

/** Branche les evenements sonores (une fois) et reprend l'etat de la table. */
export const listenSound = (campaignId) => {
  const socket = getSocket();
  if (!listening) {
    listening = true;
    socket.on('sound:music', ({ music, serverNow }) => startMusic(music, serverNow));
    socket.on('sound:music-volume', ({ volume }) => {
      useSound.setState((s) => ({ music: s.music ? { ...s.music, volume } : s.music }));
      if (musicEl) musicEl.volume = musicLevel();
    });
    socket.on('sound:sfx', playSfx);
    // Quitter la campagne coupe la musique.
    useTable.subscribe((state) => {
      if (campaignOfMusic && state.campaignId !== campaignOfMusic) {
        campaignOfMusic = null;
        stopMusic();
        useSound.setState({ music: null });
      }
    });
  }
  if (!campaignId) return;
  campaignOfMusic = campaignId;
  socket.emit('sound:state', campaignId, (state) => {
    if (!state || state.error) return;
    useSound.setState({ critSuccessUrl: state.critSuccessUrl, critFailUrl: state.critFailUrl });
    if (state.music?.url !== useSound.getState().music?.url) startMusic(state.music, state.serverNow);
  });
};

/** Clic de l'auditeur : le navigateur accepte ensuite de jouer du son. */
export const unlockSound = () => {
  useSound.setState({ blocked: false });
  if (musicEl) blockedIfRefused(musicEl.play());
};

export const setMusicVolume = (value) => {
  saveVolume('sound:music-volume', value);
  useSound.setState({ musicVolume: value });
  if (musicEl) musicEl.volume = musicLevel();
};

export const setSfxVolume = (value) => {
  saveVolume('sound:sfx-volume', value);
  useSound.setState({ sfxVolume: value });
};

/* --- Commandes du MJ ------------------------------------------------------- */

export const gmPlayMusic = (campaignId, asset, volume = 1) =>
  getSocket().emit('sound:music', { campaignId, url: asset.url, name: asset.name, volume });

export const gmStopMusic = (campaignId) => getSocket().emit('sound:music', { campaignId, url: null });

export const gmMusicVolume = (campaignId, volume) => getSocket().emit('sound:music-volume', { campaignId, volume });

export const gmPlaySfx = (campaignId, asset, volume = 1) =>
  getSocket().emit('sound:sfx', { campaignId, url: asset.url, name: asset.name, volume });

export const gmSetCritSounds = (campaignId, patch) =>
  new Promise((resolve, reject) => {
    getSocket().emit('sound:crit-config', { campaignId, ...patch }, (res) => {
      if (res?.error) return reject(new Error(res.error));
      useSound.setState({ critSuccessUrl: res.critSuccessUrl, critFailUrl: res.critFailUrl });
      resolve(res);
    });
  });

/** Ecoute locale, pour le MJ qui choisit un son (personne d'autre ne l'entend). */
export const previewSound = (url) => playSfx({ url, volume: 1 });
