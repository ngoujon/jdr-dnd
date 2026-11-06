import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useTable } from '../lib/store.js';
import {
  useSound,
  gmPlayMusic,
  gmStopMusic,
  gmMusicVolume,
  gmPlaySfx,
  gmSetCritSounds,
  previewSound,
  unlockSound,
  setMusicVolume,
  setSfxVolume,
} from '../lib/sound.js';
import { FileDrop, useToast } from './Ui.jsx';
import { FolderGroups } from './FolderGroups.jsx';

const AUDIO_ACCEPT = 'audio/mpeg,audio/ogg,audio/wav';
const SOUND_DRAG = 'application/x-sound';

/** Onglet « Son » du MJ : musique d'ambiance, effets, sons des jets critiques. */
export function SoundPanel() {
  const campaignId = useTable((s) => s.campaignId);
  const assets = useTable((s) => s.assets);
  const refreshAssets = useTable((s) => s.refreshAssets);
  const { music, critSuccessUrl, critFailUrl } = useSound();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [sfxVolume, setGmSfxVolume] = useState(0.9);

  const sounds = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter((a) => a.kind === 'AUDIO' && (!needle || a.name.toLowerCase().includes(needle)));
  }, [assets, query]);
  const allSounds = useMemo(() => assets.filter((a) => a.kind === 'AUDIO'), [assets]);

  // Rangement des sons en dossiers, comme les pions et les cartes.
  const assetFolders = useTable((s) => s.assetFolders);
  const createAssetFolder = useTable((s) => s.createAssetFolder);
  const renameAssetFolder = useTable((s) => s.renameAssetFolder);
  const deleteAssetFolder = useTable((s) => s.deleteAssetFolder);
  const moveAssetToFolder = useTable((s) => s.moveAssetToFolder);
  const soundFolders = useMemo(() => assetFolders.folders.filter((f) => f.scope === 'AUDIO'), [assetFolders.folders]);
  const placement = useMemo(() => {
    const ids = new Set(soundFolders.map((f) => f.id));
    return new Map(assetFolders.entries.filter((e) => ids.has(e.folderId)).map((e) => [e.assetId, e.folderId]));
  }, [assetFolders.entries, soundFolders]);

  const upload = async (files) => {
    if (!files?.length) return;
    const form = new FormData();
    for (const file of files) form.append('files', file);
    form.append('kind', 'AUDIO');
    form.append('campaignId', campaignId);
    setBusy(true);
    try {
      await api.upload('/assets', form);
      await refreshAssets();
      toast(`${files.length} son(s) ajouté(s)`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (asset) => {
    try {
      if (music?.url === asset.url) gmStopMusic(campaignId);
      await api.del(`/assets/${asset.id}`);
      await refreshAssets();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const saveCrit = (patch) => gmSetCritSounds(campaignId, patch).catch((err) => toast(err.message, 'error'));

  return (
    <div className="sound-panel scroll">
      <div className="row" style={{ padding: '0 10px' }}>
        <h4 className="panel-title">Son</h4>
      </div>

      <section className="sound-block">
        <h5 className="sound-title">Musique d'ambiance</h5>
        {music ? (
          <div className="sound-now">
            <span className="sound-eq" aria-hidden="true">♪</span>
            <strong className="ellipsis" style={{ flex: 1 }}>{music.name || 'Musique'}</strong>
            <button type="button" className="btn xs danger" onClick={() => gmStopMusic(campaignId)}>
              ■ Arrêter
            </button>
          </div>
        ) : (
          <p className="faint sound-hint">Aucune musique. Choisissez « ▶ Ambiance » sur un son ci-dessous.</p>
        )}
        {music ? (
          <label className="sound-slider">
            <span>Volume pour la table</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              defaultValue={music.volume}
              key={music.url}
              onChange={(e) => gmMusicVolume(campaignId, Number(e.target.value))}
            />
          </label>
        ) : null}
      </section>

      <section className="sound-block">
        <h5 className="sound-title">Bibliothèque de sons</h5>
        <FileDrop onFiles={upload} accept={AUDIO_ACCEPT} busy={busy} className="sound-drop" hint="MP3, OGG, WAV · 25 Mo max" />
        <div className="row" style={{ gap: 6 }}>
          <input className="input sm" placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className="sound-slider compact" title="Volume des effets pour la table">
            <span>Effets</span>
            <input type="range" min="0" max="1" step="0.05" value={sfxVolume} onChange={(e) => setGmSfxVolume(Number(e.target.value))} />
          </label>
        </div>
        <FolderGroups
          folders={soundFolders}
          items={sounds}
          folderOf={(asset) => placement.get(asset.id) ?? null}
          dragType={SOUND_DRAG}
          onMove={(assetId, folderId) => moveAssetToFolder(assetId, 'AUDIO', folderId)}
          onCreate={(name) => createAssetFolder('AUDIO', name)}
          onRename={renameAssetFolder}
          onDelete={(folder) => deleteAssetFolder(folder.id)}
          storageKey="asset-folders-collapsed:AUDIO"
          itemLabel="son(s)"
          emptyHint="Glissez un son ici."
          renderList={renderSounds}
        />
        {!sounds.length ? <p className="faint sound-hint">Ajoutez des fichiers audio pour les jouer à la table.</p> : null}
      </section>

      {renderCrit()}

      <ListenerVolumes />
    </div>
  );

  function renderSounds(list) {
    if (!list.length) return null;
    return (
          <ul className="sound-list">
            {list.map((asset) => (
              <li
                key={asset.id}
                className={music?.url === asset.url ? 'playing' : ''}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(SOUND_DRAG, asset.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <span className="ellipsis sound-name" title={asset.name}>
                  {asset.name}
                </span>
                <span className="row sound-actions">
                  <button
                    type="button"
                    className="btn xs"
                    title="Jouer en boucle pour toute la table"
                    onClick={() => gmPlayMusic(campaignId, asset)}
                  >
                    ▶ Ambiance
                  </button>
                  <button
                    type="button"
                    className="btn xs"
                    title="Jouer une fois pour toute la table"
                    onClick={() => gmPlaySfx(campaignId, asset, sfxVolume)}
                  >
                    ⚡ Effet
                  </button>
                  <button type="button" className="btn xs ghost" title="Écouter seul" onClick={() => previewSound(asset.url)}>
                    🎧
                  </button>
                  {!asset.builtin ? (
                    <button type="button" className="btn xs ghost" title="Supprimer" onClick={() => remove(asset)}>
                      ✕
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
    );
  }

  function renderCrit() {
    return (
      <section className="sound-block">
        <h5 className="sound-title">Jets critiques</h5>
        <p className="faint sound-hint">Joué chez tout le monde sur un 20 ou un 1 naturel au d20. Un jet secret ne s'entend que chez ceux qui le voient.</p>
        {[
          { key: 'critSuccessUrl', label: 'Réussite critique (20)', value: critSuccessUrl },
          { key: 'critFailUrl', label: 'Échec critique (1)', value: critFailUrl },
        ].map((item) => (
          <div key={item.key} className="field">
            <label>{item.label}</label>
            <div className="row" style={{ gap: 6 }}>
              <select
                className="input sm"
                value={item.value || ''}
                onChange={(e) => saveCrit({ [item.key]: e.target.value || null })}
              >
                <option value="">Aucun son</option>
                {allSounds.map((a) => (
                  <option key={a.id} value={a.url}>
                    {a.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn xs ghost"
                disabled={!item.value}
                title="Écouter seul"
                onClick={() => previewSound(item.value)}
              >
                🎧
              </button>
            </div>
          </div>
        ))}
      </section>
    );
  }
}

/** Reglages personnels : chacun regle la musique et les effets chez lui. */
export function ListenerVolumes() {
  const { musicVolume, sfxVolume, blocked } = useSound();
  return (
    <section className="sound-block">
      <h5 className="sound-title">Mon volume</h5>
      {blocked ? (
        <button type="button" className="btn sm primary" onClick={unlockSound}>
          🔊 Activer le son
        </button>
      ) : null}
      <label className="sound-slider">
        <span>Musique</span>
        <input type="range" min="0" max="1" step="0.05" value={musicVolume} onChange={(e) => setMusicVolume(Number(e.target.value))} />
      </label>
      <label className="sound-slider">
        <span>Effets</span>
        <input type="range" min="0" max="1" step="0.05" value={sfxVolume} onChange={(e) => setSfxVolume(Number(e.target.value))} />
      </label>
    </section>
  );
}

/** Bandeau discret quand le navigateur attend un clic pour jouer le son du MJ. */
export function SoundUnlock() {
  const blocked = useSound((s) => s.blocked);
  if (!blocked) return null;
  return (
    <button type="button" className="sound-unlock" onClick={unlockSound}>
      🔊 Le MJ joue du son — cliquez pour l'entendre
    </button>
  );
}
