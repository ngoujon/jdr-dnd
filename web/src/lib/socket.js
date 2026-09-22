import { io } from 'socket.io-client';
import { getToken } from './api.js';

let socket = null;

/** Connexion unique partagée par toute l'application. */
export const getSocket = () => {
  if (socket) return socket;
  socket = io({
    path: `${import.meta.env.BASE_URL}socket.io`,
    auth: { token: getToken() },
    transports: ['websocket', 'polling'],
    reconnectionDelay: 700,
    reconnectionDelayMax: 6000,
  });
  return socket;
};

export const resetSocket = () => {
  socket?.disconnect();
  socket = null;
};

/** Emission avec accuse de reception, sous forme de promesse. */
export const emitAck = (event, payload) =>
  new Promise((resolve) => {
    getSocket().emit(event, payload, (response) => resolve(response || {}));
  });
