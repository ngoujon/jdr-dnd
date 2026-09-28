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

  /**
   * Dimensions réelles d'une image, lues dans le navigateur.
   *
   * Les fichiers téléversés n'ont pas leurs dimensions en base : seules les
   * cartes fournies avec l'application les portent. Plutôt que de décoder les
   * images côté serveur, on interroge l'image au moment où elle devient un fond
   * de carte — ce qui rattrape aussi les fonds téléversés avant ce changement.
   */
  const imageSize = (url) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    });

  const applyBackground = async (asset) => {
    setPicking(false);
    const size =
      asset.width && asset.height
        ? { width: asset.width, height: asset.height }
        : await imageSize(asset.url);
    await patchScene({
      backgroundUrl: asset.url,
      // La scène épouse le fond : sans ça, la carte est rognée ou entourée de vide.
      ...(size?.width && size?.height ? { width: size.width, height: size.height } : {}),
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

          <div className="field">
            <label>Échelle de la carte</label>
            <p className="faint hint">
              Sert à convertir les distances : outil de mesure, portée de déplacement, taille
              de référence d'un pion. Les pions se placent librement, sans alignement.
            </p>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>Longueur de référence (px)</label>
              <LazyInput
                type="number"
                value={scene.scalePx}
                onCommit={(v) => patchScene({ scalePx: Math.max(10, Number(v) || 70) })}
              />
            </div>
            <div className="field">
              <label>Vaut en distance réelle</label>
              <LazyInput
                type="number"
                value={scene.scaleUnits}
                onCommit={(v) => patchScene({ scaleUnits: Math.max(0.1, Number(v) || 1.5) })}
              />
            </div>
            <div className="field">
              <label>Label de l'unité</label>
              <LazyInput
                type="text"
                value={scene.unitLabel}
                onCommit={(v) => patchScene({ unitLabel: String(v || 'm').slice(0, 10) })}
              />
            </div>
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
