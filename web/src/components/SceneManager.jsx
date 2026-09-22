import { useState } from 'react';
import { api } from '../lib/api.js';
import { useTable } from '../lib/store.js';
import { Modal, useToast, useConfirm, LazyInput } from './Ui.jsx';
import { AssetLibrary } from './AssetLibrary.jsx';

/** Gestion des scenes du MJ : creation, activation, reglages de grille et fond. */
export function SceneManager() {
  const scenes = useTable((s) => s.scenes);
  const scene = useTable((s) => s.scene);
  const campaign = useTable((s) => s.campaign);
  const campaignId = useTable((s) => s.campaignId);
  const loadScene = useTable((s) => s.loadScene);
  const setActiveScene = useTable((s) => s.setActiveScene);
  const patchScene = useTable((s) => s.patchScene);
  const refreshCampaign = useTable((s) => s.refreshCampaign);
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const create = async () => {
    const name = newName.trim() || `Scène ${scenes.length + 1}`;
    try {
      const { scene: created } = await api.post(`/campaigns/${campaignId}/scenes`, { name });
      await refreshCampaign();
      await loadScene(created.id);
      setCreating(false);
      setNewName('');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const duplicate = async (target) => {
    try {
      await api.post(`/campaigns/${campaignId}/scenes/${target.id}/duplicate`);
      await refreshCampaign();
      toast('Scène dupliquée', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const remove = async (target) => {
    if (scenes.length <= 1) return toast('Gardez au moins une scène', 'error');
    const ok = await confirm({
      title: 'Supprimer la scène',
      message: `« ${target.name} » et tous ses pions seront définitivement supprimés.`,
      danger: true,
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    try {
      await api.del(`/campaigns/${campaignId}/scenes/${target.id}`);
      await refreshCampaign();
      if (scene?.id === target.id) {
        const fallback = scenes.find((s) => s.id !== target.id);
        if (fallback) await loadScene(fallback.id);
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const applyBackground = async (asset) => {
    setPicking(false);
    await patchScene({
      backgroundUrl: asset.url,
      ...(asset.width && asset.height ? { width: asset.width, height: asset.height } : {}),
    });
  };

  return (
    <div className="scene-manager scroll">
      {confirmNode}
      <div className="row" style={{ padding: '0 10px 8px' }}>
        <h4 className="panel-title">Scènes</h4>
        <span className="spacer" />
        <button type="button" className="btn xs primary" onClick={() => setCreating(true)}>
          + Nouvelle
        </button>
      </div>

      <ul className="scene-list">
        {scenes.map((item) => (
          <li key={item.id} className={scene?.id === item.id ? 'open' : ''}>
            <button type="button" className="scene-btn" onClick={() => loadScene(item.id)}>
              <span
                className="scene-thumb"
                style={{
                  background: item.backgroundUrl
                    ? `center/cover url(${item.backgroundUrl})`
                    : 'var(--ink-700)',
                }}
              />
              <span className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <strong className="ellipsis">{item.name}</strong>
                <span className="faint" style={{ fontSize: 11 }}>
                  {item.width}×{item.height}
                </span>
              </span>
              {campaign?.activeSceneId === item.id ? <span className="tag on">en jeu</span> : null}
            </button>
            <div className="scene-actions">
              {campaign?.activeSceneId !== item.id ? (
                <button type="button" className="btn xs" onClick={() => setActiveScene(item.id)} title="Montrer aux joueurs">
                  Diffuser
                </button>
              ) : null}
              <button type="button" className="btn xs ghost" onClick={() => duplicate(item)} title="Dupliquer">
                ⧉
              </button>
              <button type="button" className="btn xs ghost" onClick={() => remove(item)} title="Supprimer">
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      {scene ? (
        <div className="scene-settings">
          <h4 className="panel-title">Réglages de la scène</h4>

          <div className="field">
            <label>Nom</label>
            <LazyInput value={scene.name} onCommit={(name) => patchScene({ name })} />
          </div>

          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn sm block" onClick={() => setPicking(true)}>
              Choisir un fond de carte
            </button>
            {scene.backgroundUrl ? (
              <button type="button" className="btn sm ghost" onClick={() => patchScene({ backgroundUrl: null })}>
                Retirer
              </button>
            ) : null}
          </div>

          <div className="grid-2">
            <div className="field">
              <label>Largeur (px)</label>
              <LazyInput
                type="number"
                value={scene.width}
                onCommit={(v) => patchScene({ width: Math.max(200, Number(v) || 200) })}
              />
            </div>
            <div className="field">
              <label>Hauteur (px)</label>
              <LazyInput
                type="number"
                value={scene.height}
                onCommit={(v) => patchScene({ height: Math.max(200, Number(v) || 200) })}
              />
            </div>
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={scene.gridEnabled}
              onChange={(e) => patchScene({ gridEnabled: e.target.checked })}
            />
            Afficher la grille
          </label>

          <div className="grid-2">
            <div className="field">
              <label>Case (px)</label>
              <LazyInput
                type="number"
                value={scene.gridSize}
                onCommit={(v) => patchScene({ gridSize: Math.max(10, Number(v) || 70) })}
              />
            </div>
            <div className="field">
              <label>Unité par case</label>
              <LazyInput
                type="number"
                value={scene.gridUnit}
                onCommit={(v) => patchScene({ gridUnit: Math.max(0.1, Number(v) || 1.5) })}
              />
            </div>
            <div className="field">
              <label>Label de l'unité</label>
              <LazyInput
                type="text"
                value={scene.gridUnitLabel}
                onCommit={(v) => patchScene({ gridUnitLabel: String(v || 'm').slice(0, 10) })}
              />
            </div>
            <div className="field">
              <label>Décalage X</label>
              <LazyInput
                type="number"
                value={scene.gridOffsetX}
                onCommit={(v) => patchScene({ gridOffsetX: Number(v) || 0 })}
              />
            </div>
            <div className="field">
              <label>Décalage Y</label>
              <LazyInput
                type="number"
                value={scene.gridOffsetY}
                onCommit={(v) => patchScene({ gridOffsetY: Number(v) || 0 })}
              />
            </div>
          </div>

          <div className="field">
            <label>Opacite de la grille — {Math.round((scene.gridOpacity ?? 0.12) * 100)}%</label>
            <input
              type="range"
              min="0"
              max="0.8"
              step="0.02"
              value={scene.gridOpacity ?? 0.12}
              onChange={(e) => patchScene({ gridOpacity: Number(e.target.value) })}
            />
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={scene.fogEnabled}
              onChange={(e) => patchScene({ fogEnabled: e.target.checked })}
            />
            Brouillard de guerre
          </label>
          {scene.fogEnabled ? (
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn xs" onClick={() => patchScene({ fogReveals: [] })}>
                Tout masquer
              </button>
              <button
                type="button"
                className="btn xs"
                onClick={() =>
                  patchScene({
                    fogReveals: [{ id: 'all', mode: 'reveal', x: 0, y: 0, w: scene.width, h: scene.height }],
                  })
                }
              >
                Tout révéler
              </button>
            </div>
          ) : null}

          <div className="field">
            <label>Notes du MJ (privées)</label>
            <LazyInput
              as="textarea"
              className="textarea"
              rows={5}
              value={scene.notes}
              onCommit={(notes) => patchScene({ notes })}
              placeholder="Ambiance, PNJ présents, pièges, secrets…"
            />
          </div>
        </div>
      ) : null}

      <Modal open={picking} title="Choisir un fond de carte" onClose={() => setPicking(false)} size="lg">
        <AssetLibrary filterKind="MAP" uploadKind="MAP" onPick={applyBackground} />
      </Modal>

      <Modal
        open={creating}
        title="Nouvelle scène"
        onClose={() => setCreating(false)}
        size="sm"
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => setCreating(false)}>
              Annuler
            </button>
            <button type="button" className="btn primary" onClick={create}>
              Créer
            </button>
          </>
        }
      >
        <div className="field">
          <label>Nom de la scène</label>
          <input
            className="input"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="Crypte du Roi Sorcier"
          />
        </div>
      </Modal>
    </div>
  );
}
