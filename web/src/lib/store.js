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
/** Champs d'une scene affiches dans la liste du MJ : le reste (brouillard, dessins…) n'y sert pas. */
const LIST_FIELDS = ['name', 'order', 'backgroundUrl', 'width', 'height', 'folderId'];
const listFields = (patch) =>
  Object.fromEntries(Object.entries(patch).filter(([key]) => LIST_FIELDS.includes(key)));

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
  /** Dossiers de rangement des scenes (MJ seulement). */
  sceneFolders: [],
  tokens: [],
  characters: [],
  handouts: [],
  assets: [],
  messages: [],
  combat: null,
  online: [],
  pings: [],
  reactions: [],
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
      set({
        campaign,
        isGM,
        scenes: campaign.scenes || [],
        sceneFolders: campaign.sceneFolders || [],
        combat: campaign.combat || null,
      });

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
    // Cote MJ : garde la liste a jour (nom, dossier…) quand un autre onglet modifie une scene.
    on('scene:updated-gm', ({ sceneId, patch }) =>
      set((state) => ({
        scenes: state.scenes.map((s) => (s.id === sceneId ? { ...s, ...listFields(patch) } : s)),
        scene: state.scene?.id === sceneId && 'folderId' in patch
          ? { ...state.scene, folderId: patch.folderId }
          : state.scene,
      })),
    );
    on('scene-folders:updated', ({ folders }) => set({ sceneFolders: folders }));
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
    on('character:hp', ({ characterId, hp, tempHp, maxHp }) =>
      set((state) => ({
        characters: state.characters.map((c) =>
          c.id === characterId ? { ...c, hp, tempHp, ...(maxHp != null ? { maxHp } : {}) } : c,
        ),
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
      // Le televerseur recharge deja la liste : on evite les doublons.
      set((state) => ({
        assets: [...assets.filter((a) => !state.assets.some((b) => b.id === a.id)), ...state.assets],
      })),
    );

    on('map:ping', (ping) => {
      const id = `${ping.userId}-${Date.now()}-${Math.random()}`;
      set((state) => ({ pings: [...state.pings, { ...ping, id }] }));
      setTimeout(() => set((state) => ({ pings: state.pings.filter((p) => p.id !== id) })), 2600);
    });

    on('token:reaction', ({ tokenIds, emoji }) => {
      const stamp = `${Date.now()}-${Math.random()}`;
      const added = tokenIds.map((tokenId) => ({ id: `${tokenId}-${stamp}`, tokenId, emoji }));
      const ids = new Set(added.map((r) => r.id));
      // Une nouvelle réaction remplace la précédente sur le même pion.
      set((state) => ({
        reactions: [...state.reactions.filter((r) => !tokenIds.includes(r.tokenId)), ...added],
      }));
      setTimeout(() => set((state) => ({ reactions: state.reactions.filter((r) => !ids.has(r.id)) })), 3000);
    });

    on('campaign:member-joined', () => get().refreshCampaign());
    on('campaign:member-left', () => get().refreshCampaign());
    on('campaign:member-updated', () => get().refreshCampaign());
  },

  async refreshCampaign() {
    const { campaignId } = get();
    if (!campaignId) return;
    const { campaign } = await api.get(`/campaigns/${campaignId}`);
    set({
      campaign,
      isGM: campaign.isGM,
      scenes: campaign.scenes || [],
      sceneFolders: campaign.sceneFolders || [],
    });
  },

  /* --- Dossiers de scenes ----------------------------------------------- */

  async createSceneFolder(name) {
    const { campaignId } = get();
    const { folder, folders } = await api.post(`/campaigns/${campaignId}/scene-folders`, { name });
    set({ sceneFolders: folders });
    return folder;
  },

  async renameSceneFolder(folderId, name) {
    const { campaignId } = get();
    const { folders } = await api.patch(`/campaigns/${campaignId}/scene-folders/${folderId}`, { name });
    set({ sceneFolders: folders });
  },

  async deleteSceneFolder(folderId) {
    const { campaignId } = get();
    const { folders } = await api.del(`/campaigns/${campaignId}/scene-folders/${folderId}`);
    set((state) => ({
      sceneFolders: folders,
      scenes: state.scenes.map((s) => (s.folderId === folderId ? { ...s, folderId: null } : s)),
    }));
  },

  /** Range une scene (pas forcement celle ouverte) dans un dossier, ou a la racine avec null. */
  async moveSceneToFolder(sceneId, folderId) {
    const { campaignId } = get();
    // Mise a jour immediate de la liste, le serveur confirme ensuite.
    const apply = (value) =>
      set((state) => ({
        scenes: state.scenes.map((s) => (s.id === sceneId ? { ...s, folderId: value } : s)),
        scene: state.scene?.id === sceneId ? { ...state.scene, folderId: value } : state.scene,
      }));
    const previous = get().scenes.find((s) => s.id === sceneId)?.folderId ?? null;
    apply(folderId);
    try {
      await api.patch(`/campaigns/${campaignId}/scenes/${sceneId}`, { folderId });
    } catch (err) {
      apply(previous);
      throw err;
    }
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

  /** Degats (delta negatif) ou soins : journalises cote serveur pour le MJ. */
  async adjustTokenHp(tokenId, delta) {
    const { campaignId } = get();
    const { token } = await api.post(`/campaigns/${campaignId}/tokens/${tokenId}/hp`, { delta });
    set((state) => ({ tokens: replace(state.tokens, token) }));
    return token;
  },

  /** Copie de pions (MJ), decalee d'une case et numerotee : « Gobelin 2 »… */
  async duplicateTokens(tokenIds) {
    const step = get().scene?.scalePx || 70;
    const created = [];
    for (const id of tokenIds) {
      const source = byId(get().tokens, id);
      if (!source) continue;
      const base = (source.name || '').replace(/\s+\d+$/, '');
      // Plus grand numero deja porte par un pion de meme nom (« Gobelin » compte pour 1).
      let taken = 1;
      for (const t of get().tokens) {
        const name = t.name || '';
        if (name.startsWith(`${base} `) && /^\d+$/.test(name.slice(base.length + 1))) {
          taken = Math.max(taken, Number(name.slice(base.length + 1)));
        }
      }
      const { id: _id, sceneId: _s, createdAt: _c, updatedAt: _u, zIndex: _z, hpLog: _l, ...copy } = source;
      created.push(
        await get().createToken({
          ...copy,
          name: base ? `${base} ${taken + 1}` : '',
          // Une créature fraîche : PV pleins quand le maximum est connu.
          hp: source.maxHp ?? source.hp,
          x: source.x + step,
          y: source.y + step,
        }),
      );
    }
    return created;
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
    const previous = get().tokens.find((t) => t.id === tokenId);
    set((state) => ({ tokens: state.tokens.filter((t) => t.id !== tokenId) }));
    try {
      await api.del(`/campaigns/${campaignId}/tokens/${tokenId}`);
    } catch (err) {
      // Refusé (pion d'un autre, verrouillé) : il réapparaît.
      if (previous) set((state) => ({ tokens: [...state.tokens.filter((t) => t.id !== tokenId), previous] }));
      throw err;
    }
  },

  /* --- Actions scene ---------------------------------------------------- */

  async patchScene(patch) {
    const { campaignId, scene } = get();
    set((state) => ({ scene: { ...state.scene, ...patch } }));
    const { scene: updated } = await api.patch(`/campaigns/${campaignId}/scenes/${scene.id}`, patch);
    set((state) => ({
      // Les dessins sont synchronises en temps reel : la reponse HTTP peut
      // etre anterieure au dernier coup de gomme, on garde donc l'etat local.
      scene: { ...updated, drawings: state.scene?.drawings ?? updated.drawings, tokens: undefined },
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

  /**
   * Modifie le calque de dessin par differences : `add` (traits), `remove`
   * (identifiants), `clear` (tout ce que l'on a le droit d'effacer). Le serveur
   * les applique a son propre etat puis rediffuse la liste a jour.
   */
  updateDrawings({ add = [], remove = [], clear = false }) {
    const { campaignId, scene, isGM } = get();
    const me = useAuth.getState().user;
    const removed = new Set(remove);
    const removable = (d) => isGM || d.ownerId === me?.id;
    set((state) => {
      const kept = (state.scene?.drawings || []).filter((d) => !(removable(d) && (clear || removed.has(d.id))));
      const ids = new Set(kept.map((d) => d.id));
      return { scene: { ...state.scene, drawings: [...kept, ...add.filter((d) => !ids.has(d.id))] } };
    });
    return emitAck('draw:update', { campaignId, sceneId: scene.id, add, remove, clear });
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

  react(emoji, tokenIds) {
    getSocket().emit('token:react', { campaignId: get().campaignId, tokenIds, emoji });
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
    // Sans campagne ouverte : ressources personnelles et fournies uniquement.
    const { assets } = await api.get(campaignId ? `/assets?campaignId=${campaignId}` : '/assets');
    set({ assets });
  },

  async refreshHandouts() {
    const { campaignId } = get();
    const { handouts } = await api.get(`/campaigns/${campaignId}/handouts`);
    set({ handouts });
  },
}));
