import { useState } from 'react';
import { api } from '../lib/api.js';
import { useTable } from '../lib/store.js';
import { Modal, useToast, useConfirm, LazyInput } from './Ui.jsx';
import { AssetLibrary } from './AssetLibrary.jsx';
import { useCollapsedFolders } from './FolderGroups.jsx';

const DRAG_TYPE = 'application/x-scene';

/** Liste des scenes du MJ, rangees en dossiers repliables. */
export function SceneManager() {
  const scenes = useTable((s) => s.scenes);
  const folders = useTable((s) => s.sceneFolders);
  const scene = useTable((s) => s.scene);
  const campaign = useTable((s) => s.campaign);
  const campaignId = useTable((s) => s.campaignId);
  const loadScene = useTable((s) => s.loadScene);
  const setActiveScene = useTable((s) => s.setActiveScene);
  const refreshCampaign = useTable((s) => s.refreshCampaign);
  const createSceneFolder = useTable((s) => s.createSceneFolder);
  const renameSceneFolder = useTable((s) => s.renameSceneFolder);
  const deleteSceneFolder = useTable((s) => s.deleteSceneFolder);
  const moveSceneToFolder = useTable((s) => s.moveSceneToFolder);
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [collapsed, toggleFolder, setCollapsed] = useCollapsedFolders(`scene-folders-collapsed:${campaignId}`);

  // Modale de creation de scene : { name, folderId }.
  const [creating, setCreating] = useState(null);
  // Modale de dossier : { id?, name } (id present = renommage).
  const [folderForm, setFolderForm] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const create = async () => {
    const name = creating.name.trim() || `Scène ${scenes.length + 1}`;
    try {
      const { scene: created } = await api.post(`/campaigns/${campaignId}/scenes`, {
        name,
        folderId: creating.folderId || null,
      });
      await refreshCampaign();
      await loadScene(created.id);
      setCreating(null);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const saveFolder = async () => {
    const name = folderForm.name.trim();
    if (!name) return toast('Donnez un nom au dossier', 'error');
    try {
      if (folderForm.id) await renameSceneFolder(folderForm.id, name);
      else await createSceneFolder(name);
      setFolderForm(null);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const removeFolder = async (folder) => {
    const count = scenes.filter((s) => s.folderId === folder.id).length;
    const ok = await confirm({
      title: 'Supprimer le dossier',
      message: count
        ? `« ${folder.name} » sera supprimé. Ses ${count} scène(s) ne sont pas effacées : elles reviennent hors dossier.`
        : `« ${folder.name} » sera supprimé.`,
      danger: true,
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    try {
      await deleteSceneFolder(folder.id);
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

  /* --- Glisser-deposer d'une scene vers un dossier --------------------- */

  const dropProps = (folderId) => ({
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(folderId ?? 'root');
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null);
    },
    onDrop: async (e) => {
      const sceneId = e.dataTransfer.getData(DRAG_TYPE);
      setDropTarget(null);
      if (!sceneId) return;
      e.preventDefault();
      e.stopPropagation();
      const current = scenes.find((s) => s.id === sceneId);
      if (!current || (current.folderId ?? null) === (folderId ?? null)) return;
      try {
        await moveSceneToFolder(sceneId, folderId ?? null);
        // Un dossier replie s'ouvre pour montrer ou la scene est arrivee.
        if (folderId && collapsed.has(folderId)) toggleFolder(folderId);
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  });

  const renderScene = (item) => (
    <li
      key={item.id}
      className={scene?.id === item.id ? 'open' : ''}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, item.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => setDropTarget(null)}
    >
      <button type="button" className="scene-btn" onClick={() => loadScene(item.id)}>
        <span
          className="scene-thumb"
          style={{
            background: item.backgroundUrl ? `center/cover url(${item.backgroundUrl})` : 'var(--ink-700)',
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
  );

  const folderIds = new Set(folders.map((f) => f.id));
  // Une scene dont le dossier n'existe plus (autre onglet) reste visible a la racine.
  const loose = scenes.filter((s) => !s.folderId || !folderIds.has(s.folderId));
  const allCollapsed = folders.length > 0 && folders.every((f) => collapsed.has(f.id));

  return (
    <div className="scene-manager scroll">
      {confirmNode}
      <div className="row" style={{ padding: '0 10px', gap: 6 }}>
        <h4 className="panel-title">Scènes</h4>
        <span className="spacer" />
        <button
          type="button"
          className="btn xs"
          onClick={() => setFolderForm({ name: '' })}
          title="Créer un dossier pour ranger les scènes"
        >
          + Dossier
        </button>
        <button type="button" className="btn xs primary" onClick={() => setCreating({ name: '', folderId: '' })}>
          + Nouvelle
        </button>
      </div>

      {folders.length ? (
        <div className="row" style={{ padding: '0 10px' }}>
          <button
            type="button"
            className="btn xs ghost"
            onClick={() => setCollapsed(allCollapsed ? [] : folders.map((f) => f.id))}
          >
            {allCollapsed ? 'Tout déplier' : 'Tout replier'}
          </button>
        </div>
      ) : null}

      <div className="scene-tree">
        {folders.map((folder) => {
          const items = scenes.filter((s) => s.folderId === folder.id);
          const isCollapsed = collapsed.has(folder.id);
          const hasCurrent = items.some((s) => s.id === scene?.id);
          return (
            <section
              key={folder.id}
              className={`scene-folder ${dropTarget === folder.id ? 'drop' : ''}`}
              {...dropProps(folder.id)}
            >
              <div className="scene-folder-head">
                <button
                  type="button"
                  className="scene-folder-toggle"
                  onClick={() => toggleFolder(folder.id)}
                  aria-expanded={!isCollapsed}
                  title={isCollapsed ? 'Déplier le dossier' : 'Replier le dossier'}
                >
                  <span className={`chevron ${isCollapsed ? '' : 'down'}`} aria-hidden="true">
                    ›
                  </span>
                  <span aria-hidden="true">{isCollapsed ? '📁' : '📂'}</span>
                  <strong className="ellipsis">{folder.name}</strong>
                  <span className={`faint count ${hasCurrent && isCollapsed ? 'current' : ''}`}>{items.length}</span>
                </button>
                <button
                  type="button"
                  className="btn xs ghost"
                  onClick={() => setCreating({ name: '', folderId: folder.id })}
                  title="Nouvelle scène dans ce dossier"
                >
                  +
                </button>
                <button
                  type="button"
                  className="btn xs ghost"
                  onClick={() => setFolderForm({ id: folder.id, name: folder.name })}
                  title="Renommer le dossier"
                >
                  ✎
                </button>
                <button type="button" className="btn xs ghost" onClick={() => removeFolder(folder)} title="Supprimer le dossier">
                  ✕
                </button>
              </div>
              {!isCollapsed ? (
                items.length ? (
                  <ul className="scene-list">{items.map(renderScene)}</ul>
                ) : (
                  <p className="faint scene-folder-empty">Glissez une scène ici.</p>
                )
              ) : null}
            </section>
          );
        })}

        <div className={`scene-root ${dropTarget === 'root' ? 'drop' : ''}`} {...dropProps(null)}>
          {folders.length ? <span className="faint scene-root-label">Hors dossier</span> : null}
          <ul className="scene-list">{loose.map(renderScene)}</ul>
        </div>
      </div>

      <Modal
        open={Boolean(creating)}
        title="Nouvelle scène"
        onClose={() => setCreating(null)}
        size="sm"
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => setCreating(null)}>
              Annuler
            </button>
            <button type="button" className="btn primary" onClick={create}>
              Créer
            </button>
          </>
        }
      >
        {creating ? (
          <>
            <div className="field">
              <label>Nom de la scène</label>
              <input
                className="input"
                autoFocus
                value={creating.name}
                onChange={(e) => setCreating({ ...creating, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder="Crypte du Roi Sorcier"
              />
            </div>
            {folders.length ? (
              <div className="field">
                <label>Dossier</label>
                <select
                  className="input"
                  value={creating.folderId}
                  onChange={(e) => setCreating({ ...creating, folderId: e.target.value })}
                >
                  <option value="">Hors dossier</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(folderForm)}
        title={folderForm?.id ? 'Renommer le dossier' : 'Nouveau dossier'}
        onClose={() => setFolderForm(null)}
        size="sm"
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => setFolderForm(null)}>
              Annuler
            </button>
            <button type="button" className="btn primary" onClick={saveFolder}>
              {folderForm?.id ? 'Renommer' : 'Créer'}
            </button>
          </>
        }
      >
        {folderForm ? (
          <div className="field">
            <label>Nom du dossier</label>
            <input
              className="input"
              autoFocus
              maxLength={60}
              value={folderForm.name}
              onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && saveFolder()}
              placeholder="Acte I — Valmorne"
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/** Réglages de la scene ouverte : colonne a part, a cote de la liste. */
export function SceneSettings() {
  const scene = useTable((s) => s.scene);
  const folders = useTable((s) => s.sceneFolders);
  const patchScene = useTable((s) => s.patchScene);
  const moveSceneToFolder = useTable((s) => s.moveSceneToFolder);
  const toast = useToast();
  const [picking, setPicking] = useState(false);

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
      asset.width && asset.height ? { width: asset.width, height: asset.height } : await imageSize(asset.url);
    await patchScene({
      backgroundUrl: asset.url,
      // La scène épouse le fond : sans ça, la carte est rognée ou entourée de vide.
      ...(size?.width && size?.height ? { width: size.width, height: size.height } : {}),
    });
  };

  if (!scene) {
    return (
      <div className="scene-settings scroll">
        <h4 className="panel-title">Réglages de la scène</h4>
        <p className="faint">Ouvrez une scène pour la régler.</p>
      </div>
    );
  }

  return (
    <div className="scene-settings scroll">
      <h4 className="panel-title">Réglages de la scène</h4>

      <div className="field">
        <label>Nom</label>
        <LazyInput value={scene.name} onCommit={(name) => patchScene({ name })} />
      </div>

      {folders.length ? (
        <div className="field">
          <label>Dossier</label>
          <select
            className="input"
            value={folders.some((f) => f.id === scene.folderId) ? scene.folderId : ''}
            onChange={(e) => moveSceneToFolder(scene.id, e.target.value || null).catch((err) => toast(err.message, 'error'))}
          >
            <option value="">Hors dossier</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

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
          Sert à convertir les distances : outil de mesure, portée de déplacement, taille de référence d'un pion.
          Les pions se placent librement, sans alignement.
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

      <Modal open={picking} title="Choisir un fond de carte" onClose={() => setPicking(false)} size="lg">
        <AssetLibrary filterKind="MAP" uploadKind="MAP" onPick={applyBackground} />
      </Modal>
    </div>
  );
}
