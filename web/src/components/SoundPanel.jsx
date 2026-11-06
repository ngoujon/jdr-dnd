import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useTable } from '../lib/store.js';
import {
  useSound,
  gmPlayMusic,
  gmStopMusic,
  gmMusicVolume,
  gmPlaySfx,
  previewSound,
  unlockSound,
  setMusicVolume,
  setSfxVolume,
} from '../lib/sound.js';
import { FileDrop, Modal, useToast } from './Ui.jsx';
import { FolderGroups } from './FolderGroups.jsx';

const AUDIO_ACCEPT = 'audio/mpeg,audio/ogg,audio/wav';

/** Declencheurs possibles d'un dossier de sons (meme liste que SOUND_TRIGGERS cote serveur). */
const TRIGGERS = [
  { key: '', label: 'Aucun : je lance les sons moi-même', help: 'Les sons du dossier ne partent que quand vous cliquez dessus.' },
  { key: 'CRIT_SUCCESS', label: '🎯 Réussite critique (20 naturel)', help: "Joué quand un d20 fait 20. Un jet secret ne s'entend que chez ceux qui le voient." },
  { key: 'CRIT_FAIL', label: '💀 Échec critique (1 naturel)', help: "Joué quand un d20 fait 1. Un jet secret ne s'entend que chez ceux qui le voient." },
  { key: 'ENEMY_APPEARS', label: "👹 Apparition d'un ennemi", help: 'Joué quand vous posez ou rendez visible un pion qui n’est pas un personnage joueur, sur la scène en jeu.' },
  { key: 'FOG_REVEAL', label: '🗺️ La carte se dévoile', help: 'Joué quand vous révélez une zone du brouillard de guerre.' },
  { key: 'SCENE', label: '🎬 Une scène est affichée', help: 'Joué quand vous diffusez cette scène aux joueurs. Idéal pour lancer la musique du lieu.' },
];

const triggerLabel = (folder, scenes) => {
  if (folder.trigger === 'SCENE') {
    const scene = scenes.find((s) => s.id === folder.triggerSceneId);
    return `🎬 ${scene ? scene.name : 'Scène supprimée'}`;
  }
  return TRIGGERS.find((t) => t.key === folder.trigger)?.label.split(' (')[0] || '⚡ Déclencheur';
};
const SOUND_DRAG = 'application/x-sound';

/** Onglet « Son » du MJ : musique d'ambiance, effets, sons des jets critiques. */
export function SoundPanel() {
  const campaignId = useTable((s) => s.campaignId);
  const assets = useTable((s) => s.assets);
  const refreshAssets = useTable((s) => s.refreshAssets);
  const { music } = useSound();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [sfxVolume, setGmSfxVolume] = useState(1);
  const scenes = useTable((s) => s.scenes);
  const updateAssetFolder = useTable((s) => s.updateAssetFolder);
  const [triggerFor, setTriggerFor] = useState(null);

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
          renderFolderExtra={(folder) => (
            <button
              type="button"
              className={`trigger-chip ${folder.trigger ? 'on' : ''}`}
              onClick={() =>
                setTriggerFor({
                  id: folder.id,
                  name: folder.name,
                  trigger: folder.trigger || '',
                  sceneId: folder.triggerSceneId || '',
                  mode: folder.triggerMode || '',
                })
              }
              title="Choisir quand ce dossier se joue tout seul"
            >
              {folder.trigger ? triggerLabel(folder, scenes) : '⚡ Déclencheur'}
            </button>
          )}
        />
        {!sounds.length ? <p className="faint sound-hint">Ajoutez des fichiers audio pour les jouer à la table.</p> : null}
      </section>

      <p className="faint sound-hint" style={{ padding: '0 10px' }}>
        ⚡ Un dossier peut se jouer tout seul : réussite ou échec critique, ennemi qui apparaît, carte qui se dévoile,
        scène affichée. Sans déclencheur, c'est vous qui lancez ses sons.
      </p>

      <ListenerVolumes />

      <Modal
        open={Boolean(triggerFor)}
        title={`Déclencheur — ${triggerFor?.name || ''}`}
        onClose={() => setTriggerFor(null)}
        size="sm"
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => setTriggerFor(null)}>
              Annuler
            </button>
            <button type="button" className="btn primary" onClick={saveTrigger}>
              Enregistrer
            </button>
          </>
        }
      >
        {triggerFor ? (
          <div className="col" style={{ gap: 12 }}>
            <div className="field">
              <label>Quand jouer ce dossier ?</label>
              <select
                className="select"
                value={triggerFor.trigger}
                onChange={(e) => setTriggerFor({ ...triggerFor, trigger: e.target.value })}
              >
                {TRIGGERS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="faint hint-text">{TRIGGERS.find((t) => t.key === triggerFor.trigger)?.help}</p>
            </div>
            {triggerFor.trigger === 'SCENE' ? (
              <div className="field">
                <label>Quelle scène ?</label>
                <select
                  className="select"
                  value={triggerFor.sceneId}
                  onChange={(e) => setTriggerFor({ ...triggerFor, sceneId: e.target.value })}
                >
                  <option value="">Choisir une scène…</option>
                  {scenes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {triggerFor.trigger ? (
              <div className="field">
                <label>Comment le jouer ?</label>
                <select
                  className="select"
                  value={triggerFor.mode || (triggerFor.trigger === 'SCENE' ? 'music' : 'sfx')}
                  onChange={(e) => setTriggerFor({ ...triggerFor, mode: e.target.value })}
                >
                  <option value="music">Musique en boucle (remplace la musique en cours)</option>
                  <option value="sfx">Effet joué une fois</option>
                </select>
                <p className="faint hint-text">S'il y a plusieurs sons dans le dossier, l'un d'eux est tiré au hasard.</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );

  async function saveTrigger() {
    const t = triggerFor;
    if (t.trigger === 'SCENE' && !t.sceneId) return toast('Choisissez la scène qui lance ce dossier', 'error');
    try {
      await updateAssetFolder(t.id, {
        trigger: t.trigger || null,
        triggerSceneId: t.trigger === 'SCENE' ? t.sceneId : null,
        triggerMode: t.trigger ? t.mode || (t.trigger === 'SCENE' ? 'music' : 'sfx') : null,
      });
      setTriggerFor(null);
      toast(t.trigger ? 'Déclencheur enregistré' : 'Dossier en lecture manuelle', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

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
