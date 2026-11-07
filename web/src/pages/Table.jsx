import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTable, useAuth } from '../lib/store.js';
import { TopBar } from '../components/TopBar.jsx';
import { MapCanvas } from '../components/MapCanvas.jsx';
import { ChatPanel } from '../components/ChatPanel.jsx';
import { PartyPanel } from '../components/PartyPanel.jsx';
import { CombatTracker } from '../components/CombatTracker.jsx';
import { HandoutPanel } from '../components/HandoutPanel.jsx';
import { SceneManager, SceneSettings } from '../components/SceneManager.jsx';
import { AssetLibrary } from '../components/AssetLibrary.jsx';
import { TokenInspector } from '../components/TokenInspector.jsx';
import { CharacterSheet } from '../components/CharacterSheet.jsx';
import { WhisperDock } from '../components/WhisperDock.jsx';
import { VoicePanel } from '../components/VoicePanel.jsx';
import { SoundPanel, SoundUnlock } from '../components/SoundPanel.jsx';
import { listenSound } from '../lib/sound.js';
import { listenVoice, useVoice, setGmBroadcast } from '../lib/voice.js';

/**
 * Interrupteur du MJ, dans la barre d'outils : sa voix porte sur toute la
 * carte, ou seulement autour de son pion. Ne change que la voix du MJ.
 */
function GmVoiceSwitch({ campaignId }) {
  const gmBroadcast = useVoice((s) => s.gmBroadcast);
  return (
    <label
      className={`voice-switch ${gmBroadcast ? 'on' : ''}`}
      title={
        gmBroadcast
          ? 'Votre voix porte sur toute la carte : tout le monde vous entend au même volume. Cliquez pour ne parler qu’autour de votre pion.'
          : 'Votre voix ne porte qu’autour de votre pion MJ : seuls les joueurs proches vous entendent. Cliquez pour parler à toute la carte.'
      }
    >
      <input
        type="checkbox"
        checked={gmBroadcast}
        onChange={(e) => setGmBroadcast(campaignId, e.target.checked)}
      />
      <span className="voice-switch-track" aria-hidden="true">
        <span className="voice-switch-thumb" />
      </span>
      <span>{gmBroadcast ? '📢 Toute la carte' : '📍 Proximité'}</span>
    </label>
  );
}
import { Tabs, Spinner, useToast, Avatar } from '../components/Ui.jsx';
import { IconPanelOpen } from '../components/Icons.jsx';

const TOOLS = [
  { key: 'select', icon: '⬚', label: 'Sélection', hint: 'Déplacer et sélectionner les pions' },
  { key: 'pan', icon: '✥', label: 'Déplacer la vue', hint: 'Glisser la carte (ou Alt + glisser)' },
  { key: 'measure', icon: '⇔', label: 'Mesurer', hint: 'Mesurer une distance sur la grille' },
  { key: 'ping', icon: '◎', label: 'Ping', hint: 'Attirer l’attention sur un point' },
  { key: 'draw', icon: '✎', label: 'Dessiner', hint: 'Tracer sur le calque partage' },
];

const GM_TOOLS = [
  { key: 'fog-reveal', icon: '☀', label: 'Révéler', hint: 'Effacer le brouillard sur une zone' },
  { key: 'fog-hide', icon: '☁', label: 'Masquer', hint: 'Remettre du brouillard sur une zone' },
];

/** Même liste que REACTION_EMOJIS dans server/src/realtime/index.js. */
/** Meme liste que REACTION_EMOJIS dans server/src/realtime/index.js. */
const REACTIONS = [
  // Les classiques
  '👍', '👎', '😂', '😮', '😱', '😡', '❤️', '🎉', '💀', '🤔', '🙏', '💪', '🔥', '❓', '❗', '💤',
  // Humeurs
  '😀', '😅', '🤣', '😊', '😍', '😎', '🤩', '😏', '😬', '😳', '🥺', '😢', '😭', '😤', '🤯', '🥶',
  '🥵', '🤢', '🤮', '😵', '🫣', '🤫', '🤐', '😴', '🙄', '😇', '😈', '🤡',
  // Gestes
  '👏', '🙌', '👋', '🤝', '✌️', '🤞', '👀', '🫡', '🤷', '🙈',
  // Aventure
  '⚔️', '🗡️', '🛡️', '🏹', '🪄', '🔮', '📜', '🗝️', '💰', '💎', '🍺', '🍖', '🧪', '🎲', '🐉', '👑',
  '☠️', '👻', '🧟', '🕷️', '🐺', '⚡', '❄️', '💥', '✨', '🌙', '⭐', '💯', '✅', '❌', '⚠️', '🏃',
];

/** Apparence du pion du MJ : couronne doree, reconnaissable d'un coup d'oeil. */
const GM_PAWN_STYLE = {
  shape: 'circle',
  fill: 'linear-gradient(160deg, #6b4a1f, #2a1d0c)',
  ring: '#e0a75c',
  glyph: '♛',
  glyphColor: '#f3d9a4',
};

const BRUSH_COLORS =['#e0a75c', '#d0574c', '#57a866', '#4a6fbd', '#b4a3f0', '#ede0c8'];

export function TablePage() {
  const { campaignId } = useParams();
  const open = useTable((s) => s.open);
  const reset = useTable((s) => s.reset);
  const loading = useTable((s) => s.loading);
  const error = useTable((s) => s.error);
  const campaign = useTable((s) => s.campaign);
  const scene = useTable((s) => s.scene);
  const isGM = useTable((s) => s.isGM);
  const online = useTable((s) => s.online);
  const characters = useTable((s) => s.characters);
  const tokens = useTable((s) => s.tokens);
  const createToken = useTable((s) => s.createToken);
  const deleteToken = useTable((s) => s.deleteToken);
  const patchToken = useTable((s) => s.patchToken);
  const updateDrawings = useTable((s) => s.updateDrawings);
  const duplicateTokens = useTable((s) => s.duplicateTokens);
  const react = useTable((s) => s.react);
  const me = useAuth((s) => s.user);
  const toast = useToast();

  const [tool, setTool] = useState('select');
  const [brush, setBrush] = useState({ color: '#e0a75c', width: 4, shape: 'pen', gmOnly: false });
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [selection, setSelection] = useState([]);
  const [rightTab, setRightTab] = useState('chat');
  // Ouverte d'emblee : outils de preparation pour le MJ, fiche pour le joueur.
  const [leftOpen, setLeftOpen] = useState(true);
  const [leftTab, setLeftTab] = useState('scenes');
  // Colonne des réglages de scène, à côté de la liste (MJ).
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [openCharacter, setOpenCharacter] = useState(null);
  const [sheetId, setSheetId] = useState(null);
  const [speakingAs, setSpeakingAs] = useState(null);
  const [whisperTarget, setWhisperTarget] = useState(null);
  const viewRef = useRef({});

  useEffect(() => {
    open(campaignId);
    return () => reset();
  }, [campaignId, open, reset]);

  // Musique et effets du MJ : chacun les entend, MJ compris. L'etat des salons
  // vocaux est suivi des l'ouverture (interrupteur de voix du MJ dans la barre).
  useEffect(() => {
    if (!loading && campaign) {
      listenSound(campaignId);
      listenVoice(campaignId);
    }
  }, [campaignId, loading, Boolean(campaign)]);

  /** Raccourcis clavier façon logiciels de dessin. */
  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;
      if (typing) return;
      if (e.metaKey || e.ctrlKey) {
        // Ctrl/Cmd + D : le MJ duplique la selection (et selectionne les copies).
        if (e.key.toLowerCase() === 'd' && isGM && selection.length) {
          e.preventDefault();
          duplicateTokens(selection)
            .then((copies) => setSelection(copies.map((t) => t.id)))
            .catch(() => {});
        }
        // Les autres combinaisons (copier, coller…) ne changent pas d'outil.
        return;
      }
      const map = { v: 'select', h: 'pan', m: 'measure', p: 'ping', d: 'draw', r: 'fog-reveal', f: 'fog-hide' };
      const next = map[e.key.toLowerCase()];
      if (next && (isGM || !next.startsWith('fog'))) {
        setTool(next);
        e.preventDefault();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length) {
        e.preventDefault();
        // Un joueur ne retire que ses propres pions, jamais ceux des autres.
        for (const id of selection) {
          const token = tokens.find((t) => t.id === id);
          if (token && canEditToken(token)) deleteToken(id).catch((err) => toast(err.message, 'error'));
        }
        setSelection([]);
      }
      if (e.key === 'Escape') setSelection([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const myCharacters = useMemo(
    () => characters.filter((c) => c.ownerId === me?.id && !c.isNpc),
    [characters, me],
  );

  /** Miroir de assertCanEdit (serveur) : le MJ tout, un joueur ses propres pions. */
  function canEditToken(token) {
    if (isGM) return true;
    if (token.locked) return false;
    if (token.ownerId === me?.id) return true;
    return characters.some((c) => c.id === token.characterId && c.ownerId === me?.id);
  }

  /** Pions qui affichent la réaction : la sélection du MJ, sinon mes personnages. */
  const sendReaction = (emoji) => {
    const mine = tokens.filter(
      (t) => t.ownerId === me?.id || characters.some((c) => c.id === t.characterId && c.ownerId === me?.id),
    );
    const selected = tokens.filter((t) => selection.includes(t.id) && (isGM || mine.includes(t)));
    const targets = selected.length ? selected : mine;
    if (!targets.length) {
      toast(isGM ? 'Sélectionnez un pion sur la carte' : "Posez d'abord votre pion sur la carte", 'info');
      return;
    }
    react(emoji, targets.map((t) => t.id));
  };
  const sheetCharacter = myCharacters.find((c) => c.id === sheetId) || myCharacters[0] || null;

  /** Le MJ ouvre la fiche complete ; le joueur affiche la sienne dans sa barre. */
  const openSheet = (character) => {
    if (isGM) return setOpenCharacter(character);
    if (character.ownerId !== me?.id) return;
    setSheetId(character.id);
    setLeftOpen(true);
  };

  /** Depot d'une ressource depuis la bibliotheque directement sur la carte. */
  const onDropAsset = async (event) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/x-asset');
    if (!raw || !scene) return;
    const asset = JSON.parse(raw);
    const scalePx = scene.scalePx || 70;
    try {
      if (asset.kind === 'MAP') {
        toast('Utilisez le panneau Scènes pour changer le fond de carte', 'info');
        return;
      }
      const dropPoint = viewRef.current?.toScene
        ? viewRef.current.toScene(event.clientX, event.clientY)
        : { x: scene.width / 2, y: scene.height / 2 };
      await createToken({
        name: asset.name,
        imageUrl: asset.url,
        x: Math.round(dropPoint.x - scalePx / 2),
        y: Math.round(dropPoint.y - scalePx / 2),
        width: scalePx,
        height: scalePx,
      });
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (loading) return <Spinner label="Ouverture de la table…" />;
  if (error) {
    return (
      <div className="page">
        <TopBar />
        <div className="card empty-state" style={{ margin: 40 }}>
          <h3>Impossible d'ouvrir cette campagne</h3>
          <p className="muted">{error}</p>
          <Link className="btn primary" to="/">
            Retour aux campagnes
          </Link>
        </div>
      </div>
    );
  }

  const selectedToken = selection.length === 1 ? tokens.find((t) => t.id === selection[0]) : null;
  const canEditSelected =
    selectedToken &&
    (isGM ||
      selectedToken.ownerId === me?.id ||
      characters.some((c) => c.id === selectedToken.characterId && c.ownerId === me?.id));

  return (
    <div className="table-page">
      <TopBar title={campaign?.name} subtitle={scene?.name}>
        <div className="online-strip">
          {online.slice(0, 8).map((user) => (
            <Avatar
              key={user.id}
              name={user.username}
              url={user.avatarUrl}
              size={26}
              ring={user.isGM ? 'var(--brass)' : 'var(--success)'}
            />
          ))}
        </div>
        {isGM ? (
          <Link className="btn sm" to={`/campagne/${campaignId}/preparation`}>
            Préparation
          </Link>
        ) : null}
      </TopBar>

      <div className="table-layout">
        {isGM ? (
          <aside className={`left-rail ${leftOpen ? 'open' : ''}`}>
            <button
              type="button"
              className="rail-toggle"
              onClick={() => setLeftOpen((v) => !v)}
              title={leftOpen ? 'Replier' : 'Deplier'}
            >
              {leftOpen ? '‹' : '›'}
            </button>
            {leftOpen ? (
              <>
                <Tabs
                  compact
                  value={leftTab}
                  onChange={setLeftTab}
                  tabs={[
                    { key: 'scenes', label: 'Scènes' },
                    { key: 'assets', label: 'Ressources' },
                  ]}
                />
                <div className="rail-body">
                  {leftTab === 'scenes' ? <SceneManager /> : null}
                  {leftTab === 'assets' ? (
                    <AssetLibrary
                      compact
                      onPick={async (asset) => {
                        if (!scene) return;
                        if (asset.kind === 'MAP') {
                          toast('Onglet « Scènes » pour définir le fond de carte', 'info');
                          return;
                        }
                        const scalePx = scene.scalePx || 70;
                        const x = Math.round((scene.width - scalePx) / 2);
                        const y = Math.round((scene.height - scalePx) / 2);
                        await createToken({
                          name: asset.name,
                          imageUrl: asset.url,
                          x,
                          y,
                          width: scalePx,
                          height: scalePx,
                        });
                        viewRef.current?.centerOn?.(x, y);
                        toast('Pion ajouté au centre de la carte', 'success');
                      }}
                    />
                  ) : null}
                </div>
              </>
            ) : null}
          </aside>
        ) : null}

        {isGM && leftOpen && leftTab === 'scenes' ? (
          settingsOpen ? (
            <aside className="settings-rail">
              <button
                type="button"
                className="btn xs ghost rail-close"
                onClick={() => setSettingsOpen(false)}
                title="Masquer les réglages de la scène"
              >
                ‹
              </button>
              <SceneSettings />
            </aside>
          ) : (
            <button
              type="button"
              className="settings-rail-open"
              onClick={() => setSettingsOpen(true)}
              title="Afficher les réglages de la scène"
            >
              Réglages
            </button>
          )
        ) : null}

        {isGM ? null : sheetCharacter ? (
          <aside className={`left-rail player-sheet-rail ${leftOpen ? 'open' : ''}`}>
            {leftOpen ? (
              <>
                {myCharacters.length > 1 ? (
                  <div className="seg small player-sheet-switch">
                    {myCharacters.map((character) => (
                      <button
                        key={character.id}
                        type="button"
                        className={character.id === sheetCharacter.id ? 'active' : ''}
                        onClick={() => setSheetId(character.id)}
                      >
                        {character.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                <CharacterSheet docked character={sheetCharacter} onClose={() => setLeftOpen(false)} />
              </>
            ) : (
              <button
                type="button"
                className="player-sheet-open"
                onClick={() => setLeftOpen(true)}
                title="Afficher ma fiche"
              >
                <IconPanelOpen />
                <span>Ma fiche</span>
              </button>
            )}
          </aside>
        ) : null}

        <section className="map-area" onDragOver={(e) => e.preventDefault()} onDrop={onDropAsset}>
          <div className="map-toolbar">
            {[...TOOLS, 'reactions', ...(isGM ? GM_TOOLS : [])].map((item) =>
              item === 'reactions' ? (
                <button
                  key="reactions"
                  type="button"
                  className={`tool-btn ${reactionsOpen ? 'active' : ''}`}
                  onClick={() => setReactionsOpen((v) => !v)}
                  title="Réaction — Afficher un emoji au-dessus de vos pions"
                  aria-expanded={reactionsOpen}
                >
                  <span aria-hidden="true">😀</span>
                  <em>Réaction</em>
                </button>
              ) : (
                <button
                  key={item.key}
                  type="button"
                  className={`tool-btn ${tool === item.key ? 'active' : ''}`}
                  onClick={() => setTool(item.key)}
                  title={`${item.label} — ${item.hint}`}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  <em>{item.label}</em>
                </button>
              ),
            )}

            <span className="spacer" />

            {isGM ? (
              <div className="quick-drop">
                <button
                  type="button"
                  className="btn xs"
                  title="Votre pion de MJ : votre position pour le chat vocal de proximité"
                  onClick={async () => {
                    if (!scene) return toast('Aucune scène active', 'error');
                    const scalePx = scene.scalePx || 70;
                    const x = Math.round((scene.width - scalePx) / 2);
                    const y = Math.round((scene.height - scalePx) / 2);
                    try {
                      await createToken({
                        name: 'MJ',
                        isGmPawn: true,
                        style: GM_PAWN_STYLE,
                        x,
                        y,
                        width: scalePx,
                        height: scalePx,
                        showHealthBar: false,
                      });
                      viewRef.current?.centerOn?.(x, y);
                    } catch (err) {
                      toast(err.message, 'error');
                    }
                  }}
                >
                  {tokens.some((t) => t.isGmPawn) ? 'Repositionner mon pion MJ' : 'Poser mon pion MJ'}
                </button>
                {(() => {
                  const pawn = tokens.find((t) => t.isGmPawn);
                  if (!pawn) return null;
                  return (
                    <button
                      type="button"
                      className={`btn xs ${pawn.visible ? '' : 'ghost'}`}
                      aria-pressed={pawn.visible}
                      title={
                        pawn.visible
                          ? 'Les joueurs voient votre pion MJ sur la carte. Cliquez pour le cacher.'
                          : 'Votre pion MJ est caché aux joueurs (il place seulement votre voix). Cliquez pour le montrer.'
                      }
                      onClick={async () => {
                        try {
                          await patchToken(pawn.id, { visible: !pawn.visible });
                        } catch (err) {
                          toast(err.message, 'error');
                        }
                      }}
                    >
                      {pawn.visible ? '👁 Visible des joueurs' : '🙈 Caché aux joueurs'}
                    </button>
                  );
                })()}
                <GmVoiceSwitch campaignId={campaignId} />
              </div>
            ) : null}
            {myCharacters.length ? (
              <div className="quick-drop">
                {myCharacters.map((character) => {
                  // Un seul pion par personnage : deja pose, le bouton le ramene au centre.
                  const placed = tokens.some((t) => t.characterId === character.id);
                  return (
                  <button
                    key={character.id}
                    type="button"
                    className="btn xs"
                    title={placed ? 'Ramener mon pion au centre de la carte' : 'Poser mon pion au centre de la carte'}
                    onClick={async () => {
                      if (!scene) return toast('Aucune scène active', 'error');
                      const scalePx = scene.scalePx || 70;
                      const x = Math.round((scene.width - scalePx) / 2);
                      const y = Math.round((scene.height - scalePx) / 2);
                      try {
                        await createToken({
                          name: character.name,
                          imageUrl: character.tokenUrl || character.portraitUrl || null,
                          style: character.style || {},
                          characterId: character.id,
                          x,
                          y,
                          width: scalePx,
                          height: scalePx,
                          hp: character.hp,
                          maxHp: character.maxHp,
                          ac: character.ac,
                        });
                        viewRef.current?.centerOn?.(x, y);
                      } catch (err) {
                        toast(err.message, 'error');
                      }
                    }}
                  >
                    {placed ? 'Repositionner' : 'Poser'} {character.name}
                  </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {reactionsOpen ? (
            <div className="brush-bar reaction-bar" role="toolbar" aria-label="Réactions">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="reaction-emoji"
                  onClick={() => sendReaction(emoji)}
                  title={isGM ? 'Sur les pions sélectionnés' : 'Sur mes pions'}
                >
                  {emoji}
                </button>
              ))}
              <button type="button" className="btn xs ghost" onClick={() => setReactionsOpen(false)} title="Fermer">
                ✕
              </button>
            </div>
          ) : null}

          {tool === 'draw' ? (
            <div className="brush-bar">
              <div className="seg small">
                {[
                  ['pen', 'Trait libre'],
                  ['line', 'Ligne'],
                  ['rect', 'Rectangle'],
                  ['circle', 'Cercle'],
                  ['eraser', 'Gomme'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={brush.shape === key ? 'active' : ''}
                    onClick={() => setBrush({ ...brush, shape: key })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="row" style={{ gap: 4 }}>
                {BRUSH_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`brush-color ${brush.color === color ? 'active' : ''}`}
                    style={{ background: color }}
                    onClick={() => setBrush({ ...brush, color })}
                    aria-label={`Couleur ${color}`}
                  />
                ))}
              </div>
              <input
                type="range"
                min="1"
                max="20"
                value={brush.width}
                onChange={(e) => setBrush({ ...brush, width: Number(e.target.value) })}
                title="Épaisseur"
                style={{ width: 90 }}
              />
              {isGM ? (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={brush.gmOnly}
                    onChange={(e) => setBrush({ ...brush, gmOnly: e.target.checked })}
                  />
                  Calque MJ
                </label>
              ) : null}
              {isGM ? (
                <button
                  type="button"
                  className="btn xs danger"
                  onClick={() => updateDrawings({ clear: true })}
                  disabled={!scene?.drawings?.length}
                >
                  Effacer tout
                </button>
              ) : (
                <button
                  type="button"
                  className="btn xs danger"
                  onClick={() => updateDrawings({ clear: true })}
                  disabled={!scene?.drawings?.some((d) => d.ownerId === me?.id)}
                >
                  Effacer mes dessins
                </button>
              )}
            </div>
          ) : null}

          <MapCanvas
            tool={tool}
            onToolChange={setTool}
            brush={brush}
            selection={selection}
            onSelectionChange={setSelection}
            viewRef={viewRef}
            onOpenToken={(token) => {
              const character = characters.find((c) => c.id === token.characterId);
              if (character) openSheet(character);
            }}
          />

          {selectedToken && canEditSelected ? (
            <TokenInspector tokenId={selectedToken.id} onClose={() => setSelection([])} />
          ) : null}
        </section>

        <aside className="right-rail">
          <Tabs
            compact
            value={rightTab}
            onChange={setRightTab}
            tabs={[
              { key: 'chat', label: 'Chat' },
              { key: 'party', label: 'Groupe' },
              { key: 'combat', label: 'Combat' },
              { key: 'handouts', label: 'Docs' },
              { key: 'voice', label: 'Com.' },
              ...(isGM ? [{ key: 'sound', label: 'Son' }] : []),
            ]}
          />
          <div className="rail-body">
            {rightTab === 'chat' ? (
              <ChatPanel
                speakingAs={speakingAs}
                onSpeakingAsChange={setSpeakingAs}
                whisperTarget={whisperTarget}
                onWhisperConsumed={() => setWhisperTarget(null)}
              />
            ) : null}
            {rightTab === 'party' ? (
              <PartyPanel
                onOpenCharacter={openSheet}
                onWhisper={(member) => {
                  setWhisperTarget(member);
                  setRightTab('chat');
                }}
              />
            ) : null}
            {rightTab === 'combat' ? <CombatTracker /> : null}
            {rightTab === 'handouts' ? <HandoutPanel /> : null}
            {rightTab === 'voice' ? <VoicePanel /> : null}
            {rightTab === 'sound' && isGM ? <SoundPanel /> : null}
          </div>
        </aside>
      </div>

      {openCharacter && isGM ? (
        <CharacterSheet character={openCharacter} onClose={() => setOpenCharacter(null)} />
      ) : null}

      <WhisperDock />
      <SoundUnlock />
    </div>
  );
}
