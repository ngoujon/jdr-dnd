import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useTable } from '../lib/store.js';
import { FileDrop, useFileDrop, useToast } from './Ui.jsx';

// Doit rester aligne sur ALLOWED_MIME cote serveur : le selecteur de fichiers
// ne propose ainsi que ce qui sera accepte (pas de HEIC refuse apres coup).
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif,audio/mpeg,audio/ogg,audio/wav,application/pdf';

const KINDS = [
  { key: 'ALL', label: 'Tout' },
  { key: 'TOKEN', label: 'Pions' },
  { key: 'MAP', label: 'Cartes' },
  { key: 'PORTRAIT', label: 'Portraits' },
  { key: 'HANDOUT', label: 'Documents' },
  { key: 'AUDIO', label: 'Sons' },
];

/**
 * Bibliotheque d'images : ressources fournies + televersements du joueur.
 * `onPick` recoit l'asset choisi (posé d'un pion, fond de carte, portrait…).
 */
export function AssetLibrary({ onPick, filterKind, compact, uploadKind = 'MISC' }) {
  const assets = useTable((s) => s.assets);
  const refreshAssets = useTable((s) => s.refreshAssets);
  const campaignId = useTable((s) => s.campaignId);
  const toast = useToast();
  const [kind, setKind] = useState(filterKind || 'ALL');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (kind !== 'ALL' && asset.kind !== kind) return false;
      if (asset.kind === 'AUDIO' && kind === 'ALL') return false;
      if (!needle) return true;
      return (
        asset.name.toLowerCase().includes(needle) ||
        (asset.tags || []).some((tag) => tag.includes(needle))
      );
    });
  }, [assets, kind, query]);

  // Hors d'une campagne (page Personnages, Mon compte) la bibliotheque n'a
  // jamais ete chargee : on la recupere a l'ouverture.
  useEffect(() => {
    if (!campaignId) refreshAssets().catch(() => {});
  }, [campaignId, refreshAssets]);

  const upload = async (files) => {
    if (!files?.length) return;
    const form = new FormData();
    for (const file of files) form.append('files', file);
    form.append('kind', filterKind || (kind !== 'ALL' ? kind : uploadKind));
    if (campaignId) form.append('campaignId', campaignId);
    setBusy(true);
    try {
      const { assets: uploaded } = await api.upload('/assets', form);
      await refreshAssets();
      toast(`${files.length} fichier(s) ajouté(s)`, 'success');
      // Un seul fichier envoyé depuis un sélecteur (pion, portrait…) : on le
      // choisit directement plutôt que de forcer à le retrouver dans la grille.
      if (onPick && files.length === 1 && filterKind && uploaded?.length === 1) onPick(uploaded[0]);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (asset, event) => {
    event.stopPropagation();
    try {
      await api.del(`/assets/${asset.id}`);
      await refreshAssets();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  // Toute la bibliotheque accepte le depot ; la zone ne fait que l'afficher.
  const drop = useFileDrop(upload, { accept: ACCEPT, disabled: busy });

  return (
    <div className={`asset-library ${compact ? 'compact' : ''} ${drop.dragging ? 'dragging' : ''}`} {...drop.handlers}>
      <div className="asset-toolbar">
        {/* Les onglets restent visibles meme filtre : une image deja importee
            dans une autre categorie doit pouvoir servir de pion ou de portrait. */}
        <div className="seg small">
          {KINDS.filter((k) => !filterKind || k.key !== 'AUDIO').map((k) => (
            <button key={k.key} type="button" className={kind === k.key ? 'active' : ''} onClick={() => setKind(k.key)}>
              {k.label}
            </button>
          ))}
        </div>
        <input
          className="input sm"
          placeholder="Rechercher…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <FileDrop
        onFiles={upload}
        accept={ACCEPT}
        busy={busy}
        dragging={drop.dragging}
        className="asset-drop"
        hint="PNG, JPG, WebP, GIF, SVG · 25 Mo max"
      />

      <div className="asset-grid scroll">
        {filtered.map((asset) => (
          <button
            key={asset.id}
            type="button"
            className="asset-card"
            onClick={() => onPick?.(asset)}
            title={asset.name}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('application/x-asset', JSON.stringify(asset))}
          >
            <span
              className="asset-thumb"
              style={{
                background:
                  asset.kind === 'AUDIO'
                    ? 'var(--ink-700)'
                    : `center/${asset.kind === 'TOKEN' ? 'contain' : 'cover'} no-repeat url("${asset.url}"), var(--ink-900)`,
              }}
            >
              {asset.kind === 'AUDIO' ? '♪' : ''}
            </span>
            <span className="asset-name ellipsis">{asset.name}</span>
            {!asset.builtin ? (
              <span className="asset-del" onClick={(e) => remove(asset, e)} title="Supprimer">
                ✕
              </span>
            ) : null}
          </button>
        ))}
        {!filtered.length ? (
          <div className="empty" style={{ gridColumn: '1/-1' }}>
            Aucune ressource dans cette catégorie.
          </div>
        ) : null}
      </div>
    </div>
  );
}
