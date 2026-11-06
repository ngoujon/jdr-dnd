import { useEffect, useState } from 'react';
import { Modal, useToast, useConfirm } from './Ui.jsx';

/** Dossiers replies, memorises dans ce navigateur sous la cle donnee. */
export function useCollapsedFolders(storageKey) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...collapsed]));
    } catch {
      /* stockage indisponible : le repli ne survit simplement pas au rechargement */
    }
  }, [storageKey, collapsed]);

  const toggle = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setAll = (ids) => setCollapsed(new Set(ids));

  return [collapsed, toggle, setAll];
}

/**
 * Rangement en dossiers repliables, sur le modele des scenes : creer,
 * renommer, supprimer un dossier, et glisser un element d'un dossier a
 * l'autre. Chaque element glissable pose son id sous `dragType`.
 */
export function FolderGroups({
  folders,
  items,
  folderOf,
  renderList,
  dragType,
  onMove,
  onCreate,
  onRename,
  onDelete,
  storageKey,
  itemLabel = 'élément(s)',
  emptyHint = 'Glissez un élément ici.',
  title = null,
  actions = null,
  canManage = true,
  /** Contenu optionnel ajoute dans l'en-tete de chaque dossier (ex. declencheur d'un dossier de sons). */
  renderFolderExtra = null,
}) {
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [collapsed, toggleFolder, setCollapsed] = useCollapsedFolders(storageKey);
  // Modale de dossier : { id?, name } (id present = renommage).
  const [folderForm, setFolderForm] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const folderIds = new Set(folders.map((f) => f.id));
  // Un element dont le dossier n'existe plus (autre onglet) reste visible hors dossier.
  const placeOf = (item) => {
    const id = folderOf(item);
    return id && folderIds.has(id) ? id : null;
  };
  const loose = items.filter((item) => !placeOf(item));
  const allCollapsed = folders.length > 0 && folders.every((f) => collapsed.has(f.id));

  const saveFolder = async () => {
    const name = folderForm.name.trim();
    if (!name) return toast('Donnez un nom au dossier', 'error');
    try {
      if (folderForm.id) await onRename(folderForm.id, name);
      else await onCreate(name);
      setFolderForm(null);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const removeFolder = async (folder) => {
    const count = items.filter((item) => placeOf(item) === folder.id).length;
    const ok = await confirm({
      title: 'Supprimer le dossier',
      message: count
        ? `« ${folder.name} » sera supprimé. Ses ${count} ${itemLabel} ne sont pas effacés : ils reviennent hors dossier.`
        : `« ${folder.name} » sera supprimé.`,
      danger: true,
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    try {
      await onDelete(folder);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const dropProps = (folderId) => ({
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes(dragType)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      setDropTarget(folderId ?? 'root');
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null);
    },
    onDrop: async (e) => {
      const itemId = e.dataTransfer.getData(dragType);
      setDropTarget(null);
      if (!itemId) return;
      e.preventDefault();
      e.stopPropagation();
      const item = items.find((i) => i.id === itemId);
      if (!item || placeOf(item) === (folderId ?? null)) return;
      try {
        await onMove(itemId, folderId ?? null);
        // Un dossier replie s'ouvre pour montrer ou l'element est arrive.
        if (folderId && collapsed.has(folderId)) toggleFolder(folderId);
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  });

  return (
    <div className="folder-groups" onDragEnd={() => setDropTarget(null)}>
      {confirmNode}
      {title || canManage || actions ? (
        <div className="row folder-groups-bar">
          {title}
          <span className="spacer" />
          {canManage && folders.length ? (
            <button
              type="button"
              className="btn xs ghost"
              onClick={() => setCollapsed(allCollapsed ? [] : folders.map((f) => f.id))}
            >
              {allCollapsed ? 'Tout déplier' : 'Tout replier'}
            </button>
          ) : null}
          {canManage ? (
            <button type="button" className="btn xs" onClick={() => setFolderForm({ name: '' })} title="Créer un dossier de rangement">
              + Dossier
            </button>
          ) : null}
          {actions}
        </div>
      ) : null}

      <div className="scene-tree">
        {folders.map((folder) => {
          const inside = items.filter((item) => placeOf(item) === folder.id);
          const isCollapsed = collapsed.has(folder.id);
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
                  <span className="faint count">{inside.length}</span>
                </button>
                {renderFolderExtra ? renderFolderExtra(folder) : null}
                {canManage ? (
                  <>
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
                  </>
                ) : null}
              </div>
              {!isCollapsed ? (
                inside.length ? (
                  <div className="folder-body">{renderList(inside)}</div>
                ) : (
                  <p className="faint scene-folder-empty">{emptyHint}</p>
                )
              ) : null}
            </section>
          );
        })}

        <div className={`scene-root ${dropTarget === 'root' ? 'drop' : ''}`} {...dropProps(null)}>
          {folders.length ? <span className="faint scene-root-label">Hors dossier</span> : null}
          {renderList(loose)}
        </div>
      </div>

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
