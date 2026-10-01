import { useState } from 'react';
import { useTable } from '../lib/store.js';
import { CONDITIONS } from '../lib/dnd.js';
import { Modal, LazyInput } from './Ui.jsx';
import { AssetLibrary } from './AssetLibrary.jsx';

/// Multiples de la longueur de reference de la scene, nommes d'apres les
/// categories de taille D&D 5e.
const SIZES = [
  { label: 'TP', factor: 0.5, title: 'Très petite' },
  { label: 'M', factor: 1, title: 'Moyenne' },
  { label: 'G', factor: 2, title: 'Grande' },
  { label: 'TG', factor: 3, title: 'Très grande' },
  { label: 'Gig', factor: 4, title: 'Gigantesque' },
];

/** Panneau d'édition du pion selectionne. */
export function TokenInspector({ tokenId, onClose }) {
  const token = useTable((s) => s.tokens.find((t) => t.id === tokenId));
  const scene = useTable((s) => s.scene);
  const isGM = useTable((s) => s.isGM);
  const characters = useTable((s) => s.characters);
  const patchToken = useTable((s) => s.patchToken);
  const deleteToken = useTable((s) => s.deleteToken);
  const [picking, setPicking] = useState(false);

  if (!token) return null;
  const scalePx = scene?.scalePx || 70;
  const character = characters.find((c) => c.id === token.characterId);
  const set = (patch) => patchToken(token.id, patch).catch(() => {});

  return (
    <aside className="token-inspector card">
      <header className="row">
        <h4 className="panel-title">Pion</h4>
        <span className="spacer" />
        <button type="button" className="btn ghost icon" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
      </header>

      <div className="field">
        <label>Nom</label>
        <LazyInput className="input sm" value={token.name} onCommit={(name) => set({ name })} />
      </div>

      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn sm block" onClick={() => setPicking(true)}>
          Changer l'image
        </button>
      </div>

      <div className="field">
        <label>Taille</label>
        <div className="seg small">
          {SIZES.map((size) => (
            <button
              key={size.label}
              type="button"
              title={size.title}
              className={Math.abs(token.width / scalePx - size.factor) < 0.05 ? 'active' : ''}
              onClick={() => set({ width: scalePx * size.factor, height: scalePx * size.factor })}
            >
              {size.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label>PV</label>
          <LazyInput
            className="input sm"
            type="number"
            value={token.hp ?? ''}
            onCommit={(v) => set({ hp: v === '' ? null : Number(v) })}
          />
        </div>
        <div className="field">
          <label>PV max</label>
          <LazyInput
            className="input sm"
            type="number"
            value={token.maxHp ?? ''}
            onCommit={(v) => set({ maxHp: v === '' ? null : Number(v) })}
          />
        </div>
        <div className="field">
          <label>CA</label>
          <LazyInput
            className="input sm"
            type="number"
            value={token.ac ?? ''}
            onCommit={(v) => set({ ac: v === '' ? null : Number(v) })}
          />
        </div>
        <div className="field">
          <label title="Distance parcourue en un tour, en pieds. Sert au cercle de portée affiché sur la carte. Vide : vitesse du personnage lié.">
            Vitesse (pieds)
          </label>
          <LazyInput
            className="input sm"
            type="number"
            min="0"
            step="5"
            value={token.speed ?? ''}
            placeholder={character?.speed != null ? String(character.speed) : '30'}
            onCommit={(v) => set({ speed: v === '' ? null : Math.max(0, Math.round(Number(v)) || 0) })}
          />
        </div>
        <div className="field">
          <label>Rotation</label>
          <LazyInput
            className="input sm"
            type="number"
            value={Math.round(token.rotation || 0)}
            onCommit={(v) => set({ rotation: Number(v) || 0 })}
          />
        </div>
      </div>

      <div className="field">
        <label>États</label>
        <div className="condition-grid">
          {CONDITIONS.map((condition) => {
            const active = (token.conditions || []).includes(condition.key);
            return (
              <button
                key={condition.key}
                type="button"
                className={`condition-chip ${active ? 'active' : ''}`}
                style={active ? { background: condition.color, borderColor: condition.color } : undefined}
                title={condition.label}
                onClick={() =>
                  set({
                    conditions: active
                      ? token.conditions.filter((c) => c !== condition.key)
                      : [...(token.conditions || []), condition.key],
                  })
                }
              >
                <span>{condition.icon}</span>
                <em>{condition.label}</em>
              </button>
            );
          })}
        </div>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={token.showNameplate}
          onChange={(e) => set({ showNameplate: e.target.checked })}
        />
        Afficher le nom
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={token.showHealthBar}
          onChange={(e) => set({ showHealthBar: e.target.checked })}
        />
        Afficher la barre de vie
      </label>

      {isGM ? (
        <>
          <hr className="divider" />
          <label className="check">
            <input type="checkbox" checked={token.visible} onChange={(e) => set({ visible: e.target.checked })} />
            Visible par les joueurs
          </label>
          <label className="check">
            <input type="checkbox" checked={token.locked} onChange={(e) => set({ locked: e.target.checked })} />
            Verrouillé
          </label>

          <div className="field">
            <label>Calque</label>
            <select className="select sm" value={token.layer} onChange={(e) => set({ layer: e.target.value })}>
              <option value="BACKGROUND">Decor (fond)</option>
              <option value="OBJECT">Objets</option>
              <option value="TOKEN">Pions</option>
              <option value="GM">Calque MJ</option>
            </select>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>Aura (px)</label>
              <LazyInput
                className="input sm"
                type="number"
                value={token.auraRadius}
                onCommit={(v) => set({ auraRadius: Number(v) || 0 })}
              />
            </div>
            <div className="field">
              <label>Couleur</label>
              <input
                className="input sm color"
                type="color"
                value={token.auraColor}
                onChange={(e) => set({ auraColor: e.target.value })}
              />
            </div>
          </div>

          <div className="field">
            <label>Lié au personnage</label>
            <select
              className="select sm"
              value={token.characterId || ''}
              onChange={(e) => set({ characterId: e.target.value || null })}
            >
              <option value="">Aucun</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.isNpc ? ' (PNJ)' : ''}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}

      {character ? (
        <p className="faint" style={{ fontSize: 12 }}>
          Lié a <strong>{character.name}</strong> — niv. {character.level} {character.class}
        </p>
      ) : null}

      <hr className="divider" />
      <button
        type="button"
        className="btn danger block"
        onClick={() => {
          deleteToken(token.id);
          onClose();
        }}
      >
        Retirer de la carte
      </button>

      <Modal open={picking} title="Image du pion" onClose={() => setPicking(false)} size="lg">
        <AssetLibrary
          filterKind="TOKEN"
          uploadKind="TOKEN"
          onPick={(asset) => {
            set({ imageUrl: asset.url });
            setPicking(false);
          }}
        />
      </Modal>
    </aside>
  );
}
