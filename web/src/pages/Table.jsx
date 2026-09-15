import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTable, useAuth } from '../lib/store.js';
import { TopBar } from '../components/TopBar.jsx';
import { MapCanvas } from '../components/MapCanvas.jsx';
import { ChatPanel } from '../components/ChatPanel.jsx';
import { PartyPanel } from '../components/PartyPanel.jsx';
import { CombatTracker } from '../components/CombatTracker.jsx';
import { HandoutPanel } from '../components/HandoutPanel.jsx';
import { SceneManager } from '../components/SceneManager.jsx';
import { AssetLibrary } from '../components/AssetLibrary.jsx';
import { TokenInspector } from '../components/TokenInspector.jsx';
import { CharacterSheet } from '../components/CharacterSheet.jsx';
import { Tabs, Spinner, useToast, Avatar } from '../components/Ui.jsx';

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

const BRUSH_COLORS = ['#e0a75c', '#d0574c', '#57a866', '#4a6fbd', '#b4a3f0', '#ede0c8'];

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
  const updateDrawings = useTable((s) => s.updateDrawings);
  const me = useAuth((s) => s.user);
  const toast = useToast();

  const [tool, setTool] = useState('select');
  const [brush, setBrush] = useState({ color: '#e0a75c', width: 4, shape: 'pen', gmOnly: false });
  const [selection, setSelection] = useState([]);
  const [rightTab, setRightTab] = useState('chat');
  const [leftOpen, setLeftOpen] = useState(false);
  const [leftTab, setLeftTab] = useState('scenes');
  const [openCharacter, setOpenCharacter] = useState(null);
  const [speakingAs, setSpeakingAs] = useState(null);
  const viewRef = useRef({});

  useEffect(() => {
    open(campaignId);
    return () => reset();
  }, [campaignId, open, reset]);

  // Le MJ garde ses outils de preparation sous la main.
  useEffect(() => {
    if (isGM) setLeftOpen(true);
  }, [isGM]);

  /** Raccourcis clavier façon logiciels de dessin. */
  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;
      if (typing) return;
      const map = { v: 'select', h: 'pan', m: 'measure', p: 'ping', d: 'draw', r: 'fog-reveal', f: 'fog-hide' };
      const next = map[e.key.toLowerCase()];
      if (next && (isGM || !next.startsWith('fog'))) {
        setTool(next);
        e.preventDefault();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length) {
        e.preventDefault();
        for (const id of selection) deleteToken(id).catch(() => {});
        setSelection([]);
      }
      if (e.key === 'Escape') setSelection([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, deleteToken, isGM]);

  const myCharacters = useMemo(
    () => characters.filter((c) => c.ownerId === me?.id && !c.isNpc),
    [characters, me],
  );

  /** Depot d'une ressource depuis la bibliotheque directement sur la carte. */
  const onDropAsset = async (event) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/x-asset');
    if (!raw || !scene) return;
    const asset = JSON.parse(raw);
    const host = event.currentTarget.getBoundingClientRect();
    const gridSize = scene.gridSize || 70;
    // On ne connait pas la transformation exacte ici : on depose au centre visible.
    try {
      if (asset.kind === 'MAP') {
        toast('Utilisez le panneau Scènes pour changer le fond de carte', 'info');
        return;
      }
      await createToken({
        name: asset.name,
        imageUrl: asset.url,
        x: Math.round(scene.width / 2 / gridSize) * gridSize,
        y: Math.round(scene.height / 2 / gridSize) * gridSize,
        width: gridSize,
        height: gridSize,
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
                        const gridSize = scene.gridSize || 70;
                        await createToken({
                          name: asset.name,
                          imageUrl: asset.url,
                          x: Math.round(scene.width / 2 / gridSize) * gridSize,
                          y: Math.round(scene.height / 2 / gridSize) * gridSize,
                          width: gridSize,
                          height: gridSize,
                        });
                        toast('Pion ajouté au centre de la carte', 'success');
                      }}
                    />
                  ) : null}
                </div>
              </>
            ) : null}
          </aside>
        ) : null}

        <section className="map-area" onDragOver={(e) => e.preventDefault()} onDrop={onDropAsset}>
          <div className="map-toolbar">
            {[...TOOLS, ...(isGM ? GM_TOOLS : [])].map((item) => (
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
            ))}

            <span className="spacer" />

            {myCharacters.length ? (
              <div className="quick-drop">
                <span className="faint">Poser :</span>
                {myCharacters.map((character) => (
                  <button
                    key={character.id}
                    type="button"
                    className="btn xs"
                    onClick={async () => {
                      if (!scene) return toast('Aucune scène active', 'error');
                      const gridSize = scene.gridSize || 70;
                      try {
                        await createToken({
                          name: character.name,
                          imageUrl: character.tokenUrl || character.portraitUrl || null,
                          style: character.style || {},
                          characterId: character.id,
                          x: Math.round(scene.width / 2 / gridSize) * gridSize,
                          y: Math.round(scene.height / 2 / gridSize) * gridSize,
                          width: gridSize,
                          height: gridSize,
                          hp: character.hp,
                          maxHp: character.maxHp,
                          ac: character.ac,
                        });
                      } catch (err) {
                        toast(err.message, 'error');
                      }
                    }}
                  >
                    {character.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {tool === 'draw' ? (
            <div className="brush-bar">
              <div className="seg small">
                {[
                  ['pen', 'Trait libre'],
                  ['line', 'Ligne'],
                  ['rect', 'Rectangle'],
                  ['circle', 'Cercle'],
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
              <button
                type="button"
                className="btn xs danger"
                onClick={() => updateDrawings([])}
                disabled={!scene?.drawings?.length}
              >
                Effacer tout
              </button>
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
              if (character) setOpenCharacter(character);
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
            ]}
          />
          <div className="rail-body">
            {rightTab === 'chat' ? (
              <ChatPanel speakingAs={speakingAs} onSpeakingAsChange={setSpeakingAs} />
            ) : null}
            {rightTab === 'party' ? <PartyPanel onOpenCharacter={setOpenCharacter} /> : null}
            {rightTab === 'combat' ? <CombatTracker /> : null}
            {rightTab === 'handouts' ? <HandoutPanel /> : null}
          </div>
        </aside>
      </div>

      {openCharacter ? (
        <CharacterSheet character={openCharacter} onClose={() => setOpenCharacter(null)} />
      ) : null}
    </div>
  );
}
