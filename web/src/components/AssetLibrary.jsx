import { useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useTable } from '../lib/store.js';
import { useToast } from './Ui.jsx';

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
  const inputRef = useRef(null);
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

  const upload = async (files) => {
    if (!files?.length) return;
    const form = new FormData();
    for (const file of files) form.append('files', file);
    form.append('kind', filterKind || uploadKind);
    if (campaignId) form.append('campaignId', campaignId);
    setBusy(true);
    try {
      await api.upload('/assets', form);
      await refreshAssets();
      toast(`${files.length} fichier(s) ajouté(s)`, 'success');
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

  return (
    <div className={`asset-library ${compact ? 'compact' : ''}`}>
      <div className="asset-toolbar">
        {!filterKind ? (
          <div className="seg small">
            {KINDS.map((k) => (
              <button key={k.key} type="button" className={kind === k.key ? 'active' : ''} onClick={() => setKind(k.key)}>
                {k.label}
              </button>
            ))}
          </div>
        ) : null}
        <input
          className="input sm"
          placeholder="Rechercher…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="btn sm primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? '…' : 'Téléverser'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,audio/*,application/pdf"
          hidden
          onChange={(e) => {
            upload([...e.target.files]);
            e.target.value = '';
          }}
        />
      </div>

      <div
        className="asset-grid scroll"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload([...e.dataTransfer.files]);
        }}
      >
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
            Aucune ressource. Glissez-deposez vos images ici.
          </div>
        ) : null}
      </div>
    </div>
  );
}
