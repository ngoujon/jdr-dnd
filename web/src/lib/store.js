import { create } from 'zustand';
import { api, setToken, getToken } from './api.js';
import { getSocket, resetSocket, emitAck } from './socket.js';

/* ---------------------------------------------------------------- Auth --- */

export const useAuth = create((set) => ({
  user: null,
  status: getToken() ? 'loading' : 'anonymous',

  async bootstrap() {
    if (!getToken()) return set({ status: 'anonymous', user: null });
    try {
      const { user } = await api.get('/auth/me');
      set({ user, status: 'authenticated' });
    } catch {
      setToken(null);
      set({ status: 'anonymous', user: null });
    }
  },

  async login(identifier, password) {
    const { token, user } = await api.post('/auth/login', { identifier, password });
    setToken(token);
    resetSocket();
    set({ user, status: 'authenticated' });
    return user;
  },

  async register(payload) {
    const { token, user } = await api.post('/auth/register', payload);
    setToken(token);
    resetSocket();
    set({ user, status: 'authenticated' });
    return user;
  },

  async updateProfile(patch) {
    const { user } = await api.patch('/auth/me', patch);
    set({ user });
    return user;
  },

  logout() {
    setToken(null);
    resetSocket();
    set({ user: null, status: 'anonymous' });
  },
}));

/* --------------------------------------------------------------- Table --- */

const byId = (list, id) => list.find((item) => item.id === id);
const replace = (list, item) => {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [...list, item];
  const copy = [...list];
  copy[index] = item;
  return copy;
};

const initialTable = {
  campaignId: null,
  campaign: null,
  isGM: false,
  scene: null,
  scenes: [],
  tokens: [],
  characters: [],
  handouts: [],
  assets: [],
  messages: [],
  combat: null,
  online: [],
  pings: [],
  loading: true,
  error: null,
  /** Positions transitoires pendant qu'un autre joueur deplace un pion. */
  ghosts: {},
};

export const useTable = create((set, get) => ({
  ...initialTable,

  reset() {
    const { campaignId } = get();
    if (campaignId) getSocket().emit('campaign:leave', campaignId);
    set({ ...initialTable });
  },

  /** Charge une campagne et branche les événements temps réel. */
  async open(campaignId) {
    set({ ...initialTable, campaignId, loading: true });
    try {
      const { campaign } = await api.get(`/campaigns/${campaignId}`);
      const isGM = campaign.isGM;
      set({ campaign, isGM, scenes: campaign.scenes || [], combat: campaign.combat || null });

      const [chars, handouts, messages, assets] = await Promise.all([
        api.get(`/characters?campaignId=${campaignId}`),
        api.get(`/campaigns/${campaignId}/handouts`),
        api.get(`/campaigns/${campaignId}/chat?limit=80`),
        api.get(`/assets?campaignId=${campaignId}`),
      ]);
      set({
        characters: chars.characters,
        handouts: handouts.handouts,
        messages: messages.messages,
        assets: assets.assets,
      });

      const sceneId = campaign.activeSceneId || campaign.scenes?.[0]?.id;
      if (sceneId) await get().loadScene(sceneId);

      get().connectSocket(campaignId);
      set({ loading: false });
    } catch (err) {
      set({ loading: false, error: err.message });
    }
  },

  async loadScene(sceneId) {
    if (!sceneId) return set({ scene: null, tokens: [] });
    try {
      const { campaignId } = get();
      const { scene } = await api.get(`/campaigns/${campaignId}/scenes/${sceneId}`);
      set({ scene, tokens: scene.tokens || [] });
    } catch (err) {
      set({ error: err.message });
    }
  },

  connectSocket(campaignId) {
    const socket = getSocket();
    const on = (event, handler) => {
      socket.off(event);
      socket.on(event, handler);
    };

    socket.emit('campaign:join', campaignId, (res) => {
      if (res?.online) set({ online: res.online });
    });
    socket.off('connect');
    socket.on('connect', () => socket.emit('campaign:join', campaignId));

    on('presence:updated', ({ online }) => set({ online }));

    on('chat:message', ({ message }) =>
      set((state) => ({ messages: [...state.messages, message].slice(-300) })),
    );

    on('token:created', ({ token }) => {
      if (token.sceneId !== get().scene?.id) return;
      set((state) => ({ tokens: replace(state.tokens, token) }));
    });
    on('token:updated', ({ token }) => {
      if (token.sceneId !== get().scene?.id) return;
      set((state) => {
        const ghosts = { ...state.ghosts };
        delete ghosts[token.id];
        return { tokens: replace(state.tokens, token), ghosts };
      });
    });
    on('token:removed', ({ tokenId }) =>
      set((state) => ({ tokens: state.tokens.filter((t) => t.id !== tokenId) })),
    );
    on('token:drag', ({ tokenId, x, y }) =>
      set((state) => ({ ghosts: { ...state.ghosts, [tokenId]: { x, y } } })),
    );

    on('scene:updated', ({ sceneId, patch }) => {
      if (sceneId !== get().scene?.id) return;
      set((state) => ({ scene: { ...state.scene, ...patch } }));
    });
    on('scene:created', ({ scene }) =>
      set((state) => ({ scenes: replace(state.scenes, scene) })),
    );
    on('scene:deleted', ({ sceneId }) =>
      set((state) => ({ scenes: state.scenes.filter((s) => s.id !== sceneId) })),
    );
    on('campaign:scene-changed', async ({ sceneId }) => {
      set((state) => ({ campaign: { ...state.campaign, activeSceneId: sceneId } }));
      if (!get().isGM) await get().loadScene(sceneId);
    });
    on('campaign:updated', ({ campaign }) =>
      set((state) => ({ campaign: { ...state.campaign, ...campaign } })),
    );

    on('fog:updated', ({ sceneId, reveals }) => {
      if (sceneId !== get().scene?.id) return;
      set((state) => ({ scene: { ...state.scene, fogReveals: reveals } }));
    });
    on('draw:updated', ({ sceneId, drawings }) => {
      if (sceneId !== get().scene?.id || get().isGM) return;
      set((state) => ({ scene: { ...state.scene, drawings } }));
    });
    on('draw:updated-gm', ({ sceneId, drawings }) => {
      if (sceneId !== get().scene?.id || !get().isGM) return;
      set((state) => ({ scene: { ...state.scene, drawings } }));
    });

    on('character:created', ({ character }) =>
      set((state) => ({ characters: replace(state.characters, character) })),
    );
    on('character:updated', ({ character }) =>
      set((state) => ({ characters: replace(state.characters, character) })),
    );
    on('character:hp', ({ characterId, hp, tempHp }) =>
      set((state) => ({
        characters: state.characters.map((c) => (c.id === characterId ? { ...c, hp, tempHp } : c)),
      })),
    );
    on('character:deleted', ({ characterId }) =>
      set((state) => ({ characters: state.characters.filter((c) => c.id !== characterId) })),
    );

    on('handout:shared', ({ handout }) =>
      set((state) => ({ handouts: replace(state.handouts, handout) })),
    );
    on('handout:revoked', ({ handoutId }) =>
      set((state) => ({ handouts: state.handouts.filter((h) => h.id !== handoutId) })),
    );

    on('combat:updated', ({ combat }) => set({ combat }));
    on('asset:created', ({ assets }) =>
      set((state) => ({ assets: [...assets, ...state.assets] })),
    );

    on('map:ping', (ping) => {
      const id = `${ping.userId}-${Date.now()}-${Math.random()}`;
      set((state) => ({ pings: [...state.pings, { ...ping, id }] }));
      setTimeout(() => set((state) => ({ pings: state.pings.filter((p) => p.id !== id) })), 2600);
    });

    on('campaign:member-joined', () => get().refreshCampaign());
    on('campaign:member-left', () => get().refreshCampaign());
    on('campaign:member-updated', () => get().refreshCampaign());
  },

  async refreshCampaign() {
    const { campaignId } = get();
    if (!campaignId) return;
    const { campaign } = await api.get(`/campaigns/${campaignId}`);
    set({ campaign, isGM: campaign.isGM, scenes: campaign.scenes || [] });
  },

  /* --- Actions pions ---------------------------------------------------- */

  async createToken(payload) {
    const { campaignId, scene } = get();
    const { token } = await api.post(`/campaigns/${campaignId}/tokens`, {
      ...payload,
      sceneId: payload.sceneId || scene.id,
    });
    set((state) => ({ tokens: replace(state.tokens, token) }));
    return token;
  },

  /** Mise à jour optimiste : l'écran repond avant la confirmation serveur. */
  async patchToken(tokenId, patch) {
    const { campaignId, tokens } = get();
    const previous = byId(tokens, tokenId);
    set((state) => ({
      tokens: state.tokens.map((t) => (t.id === tokenId ? { ...t, ...patch } : t)),
    }));
    try {
      const { token } = await api.patch(`/campaigns/${campaignId}/tokens/${tokenId}`, patch);
      set((state) => ({ tokens: replace(state.tokens, token) }));
      return token;
    } catch (err) {
      if (previous) set((state) => ({ tokens: replace(state.tokens, previous) }));
      throw err;
    }
  },

  async moveTokens(moves) {
    const { campaignId } = get();
    set((state) => ({
      tokens: state.tokens.map((t) => {
        const move = moves.find((m) => m.id === t.id);
        return move ? { ...t, x: move.x, y: move.y } : t;
      }),
    }));
    await api.post(`/campaigns/${campaignId}/tokens/move`, { moves });
  },

  async deleteToken(tokenId) {
    const { campaignId } = get();
    set((state) => ({ tokens: state.tokens.filter((t) => t.id !== tokenId) }));
    await api.del(`/campaigns/${campaignId}/tokens/${tokenId}`);
  },

  /* --- Actions scene ---------------------------------------------------- */

  async patchScene(patch) {
    const { campaignId, scene } = get();
    set((state) => ({ scene: { ...state.scene, ...patch } }));
    const { scene: updated } = await api.patch(`/campaigns/${campaignId}/scenes/${scene.id}`, patch);
    set((state) => ({
      scene: { ...updated, tokens: undefined },
      scenes: replace(state.scenes, updated),
    }));
  },

  async setActiveScene(sceneId) {
    const { campaignId } = get();
    await api.patch(`/campaigns/${campaignId}`, { activeSceneId: sceneId });
    set((state) => ({ campaign: { ...state.campaign, activeSceneId: sceneId } }));
  },

  updateFog(reveals) {
    const { campaignId, scene } = get();
    set((state) => ({ scene: { ...state.scene, fogReveals: reveals } }));
    return emitAck('fog:update', { campaignId, sceneId: scene.id, reveals });
  },

  updateDrawings(drawings) {
    const { campaignId, scene } = get();
    set((state) => ({ scene: { ...state.scene, drawings } }));
    return emitAck('draw:update', { campaignId, sceneId: scene.id, drawings });
  },

  /* --- Chat & des -------------------------------------------------------- */

  sendChat(text, characterName) {
    return emitAck('chat:send', { campaignId: get().campaignId, text, characterName });
  },

  roll(options) {
    // La fiche s'ouvre aussi hors campagne, depuis « Mes personnages » : il n'y
    // a alors aucun salon ou annoncer le resultat.
    const { campaignId } = get();
    if (!campaignId) {
      return Promise.reject(new Error('Rejoignez une table de jeu pour lancer les dés'));
    }
    return emitAck('dice:roll', { campaignId, ...options });
  },

  ping(x, y, focus = false) {
    const { campaignId, scene } = get();
    getSocket().emit('map:ping', { campaignId, x, y, sceneId: scene?.id, focus });
  },

  dragToken(tokenId, x, y) {
    getSocket().emit('token:drag', { campaignId: get().campaignId, tokenId, x, y });
  },

  /* --- Personnages, documents, combat ------------------------------------ */

  async saveCharacter(characterId, patch) {
    // Applique le patch localement tout de suite : sans ca, des modifications
    // rapprochees sur des champs imbriques (abilities, proficiencies, ...) se
    // basent chacune sur un etat local pas encore a jour et s'ecrasent entre elles.
    set((state) => ({
      characters: state.characters.map((c) => (c.id === characterId ? { ...c, ...patch } : c)),
    }));
    const { character } = await api.patch(`/characters/${characterId}`, patch);
    set((state) => ({ characters: replace(state.characters, character) }));
    return character;
  },

  async createCharacter(payload) {
    const { character } = await api.post('/characters', { ...payload, campaignId: get().campaignId });
    set((state) => ({ characters: replace(state.characters, character) }));
    return character;
  },

  async deleteCharacter(characterId) {
    await api.del(`/characters/${characterId}`);
    set((state) => ({ characters: state.characters.filter((c) => c.id !== characterId) }));
  },

  async saveCombat(patch) {
    const { campaignId } = get();
    const { combat } = await api.put(`/campaigns/${campaignId}/combat`, patch);
    set({ combat });
    return combat;
  },

  async nextTurn(direction = 'next') {
    const { campaignId } = get();
    const { combat } = await api.post(`/campaigns/${campaignId}/combat/${direction}`);
    set({ combat });
  },

  async refreshAssets() {
    const { campaignId } = get();
    const { assets } = await api.get(`/assets?campaignId=${campaignId}`);
    set({ assets });
  },

  async refreshHandouts() {
    const { campaignId } = get();
    const { handouts } = await api.get(`/campaigns/${campaignId}/handouts`);
    set({ handouts });
  },
}));
