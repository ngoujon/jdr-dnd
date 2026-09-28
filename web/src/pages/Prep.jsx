import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useTable } from '../lib/store.js';
import { TopBar } from '../components/TopBar.jsx';
import { SceneManager } from '../components/SceneManager.jsx';
import { HandoutPanel } from '../components/HandoutPanel.jsx';
import { AssetLibrary } from '../components/AssetLibrary.jsx';
import { CharacterSheet } from '../components/CharacterSheet.jsx';
import { Modal, Tabs, Spinner, Avatar, LazyInput, useToast, useConfirm } from '../components/Ui.jsx';
import { StyledToken } from '../components/TokenStyler.jsx';
import { copyToClipboard, CLASSES, RACES, TEMPLATES, SPELL_ABILITY_BY_CLASS, modifier } from '../lib/dnd.js';

const TABS = [
  { key: 'scenes', label: 'Scènes & cartes' },
  { key: 'cast', label: 'PNJ & créatures' },
  { key: 'handouts', label: 'Documents' },
  { key: 'assets', label: 'Bibliothèque' },
  { key: 'table', label: 'Table & joueurs' },
];

/** Espace prive du Maitre du Jeu : tout ce qui se prepare avant la session. */
export function PrepPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const open = useTable((s) => s.open);
  const reset = useTable((s) => s.reset);
  const loading = useTable((s) => s.loading);
  const campaign = useTable((s) => s.campaign);
  const isGM = useTable((s) => s.isGM);
  const characters = useTable((s) => s.characters);
  const createCharacter = useTable((s) => s.createCharacter);
  const refreshCampaign = useTable((s) => s.refreshCampaign);
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [tab, setTab] = useState('scenes');
  const [openCharacter, setOpenCharacter] = useState(null);
  const [creatingFor, setCreatingFor] = useState(null);
  const [newCharForm, setNewCharForm] = useState({ name: '', class: 'Guerrier', race: 'Humain' });

  useEffect(() => {
    open(campaignId);
    return () => reset();
  }, [campaignId, open, reset]);

  useEffect(() => {
    if (!loading && campaign && !isGM) {
      toast('Espace réservé au Maître du Jeu', 'error');
      navigate(`/campagne/${campaignId}`, { replace: true });
    }
  }, [loading, campaign, isGM, campaignId, navigate, toast]);

  if (loading || !campaign) return <Spinner label="Ouverture de l'atelier…" />;

  const npcs = characters.filter((c) => c.isNpc);

  const addNpc = async () => {
    try {
      const npc = await createCharacter({ name: 'Nouveau PNJ', isNpc: true, shared: false, maxHp: 11, hp: 11, ac: 12 });
      setOpenCharacter(npc);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const createCharacterFor = async () => {
    if (!creatingFor || !newCharForm.name.trim()) return;
    const template = TEMPLATES[newCharForm.class];
    const conMod = modifier(template?.abilities?.con ?? 10);
    const hitDieMax = Number((template?.hitDice || '1d8').split('d')[1]);
    try {
      const character = await createCharacter({
        name: newCharForm.name.trim(),
        ownerId: creatingFor.userId,
        class: newCharForm.class,
        race: newCharForm.race,
        abilities: template?.abilities,
        ac: template?.ac ?? 10,
        hitDice: template?.hitDice ?? '1d8',
        hitDiceLeft: 1,
        maxHp: hitDieMax + conMod,
        hp: hitDieMax + conMod,
        proficiencies: {
          saves: Object.fromEntries((template?.saves || []).map((s) => [s, 1])),
          skills: Object.fromEntries((template?.skills || []).map((s) => [s, 1])),
        },
        spellcasting: { ability: SPELL_ABILITY_BY_CLASS[newCharForm.class] || 'int', slots: {}, known: [] },
        details: { playerName: creatingFor.username },
      });
      setCreatingFor(null);
      setNewCharForm({ name: '', class: 'Guerrier', race: 'Humain' });
      setOpenCharacter(character);
      toast('Personnage créé — visible uniquement par vous et ' + creatingFor.username, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const setMemberRole = async (userId, role) => {
    try {
      await api.patch(`/campaigns/${campaignId}/members/${userId}`, { role });
      await refreshCampaign();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const removeMember = async (member) => {
    const ok = await confirm({
      title: 'Exclure le joueur',
      message: `${member.username} perdra l'accès à la campagne. Ses personnages lui restent acquis.`,
      danger: true,
      confirmLabel: 'Exclure',
    });
    if (!ok) return;
    try {
      await api.del(`/campaigns/${campaignId}/members/${member.userId}`);
      await refreshCampaign();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const regenerateCode = async () => {
    const ok = await confirm({
      title: 'Régénérer le code',
      message: "L'ancien code cessera de fonctionner immediatement.",
      confirmLabel: 'Régénérer',
    });
    if (!ok) return;
    const { joinCode } = await api.post(`/campaigns/${campaignId}/regenerate-code`);
    await refreshCampaign();
    toast(`Nouveau code : ${joinCode}`, 'success');
  };

  const saveCampaign = async (patch) => {
    try {
      await api.patch(`/campaigns/${campaignId}`, patch);
      await refreshCampaign();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="page">
      {confirmNode}
      <TopBar title={campaign.name} subtitle="Espace de préparation">
        <Link className="btn primary sm" to={`/campagne/${campaignId}`}>
          Aller à la table
        </Link>
      </TopBar>

      <main className="prep-body">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />

        <div className="prep-content">
          {tab === 'scenes' ? (
            <div className="prep-scenes card">
              <SceneManager />
            </div>
          ) : null}

          {tab === 'cast' ? (
            <div className="card pad">
              <div className="row">
                <h3>PNJ &amp; créatures</h3>
                <span className="spacer" />
                <button type="button" className="btn primary sm" onClick={addNpc}>
                  + Nouveau PNJ
                </button>
              </div>
              <p className="muted">
                Ces fiches ne sont visibles que par vous. Posez-les sur la carte depuis leur fiche,
                puis masquez-les aux joueurs jusqu'àu bon moment.
              </p>
              <div className="npc-grid">
                {npcs.map((npc) => (
                  <button key={npc.id} type="button" className="npc-card" onClick={() => setOpenCharacter(npc)}>
                    <StyledToken style={npc.style} imageUrl={npc.tokenUrl || npc.portraitUrl} name={npc.name} size={64} />
                    <strong className="ellipsis">{npc.name}</strong>
                    <span className="faint">
                      {npc.hp}/{npc.maxHp} PV · CA {npc.ac}
                    </span>
                  </button>
                ))}
                {!npcs.length ? <div className="empty">Aucun PNJ pour l'instant.</div> : null}
              </div>
            </div>
          ) : null}

          {tab === 'handouts' ? (
            <div className="card prep-handouts">
              <HandoutPanel />
            </div>
          ) : null}

          {tab === 'assets' ? (
            <div className="card pad">
              <h3>Bibliothèque de la campagne</h3>
              <p className="muted">
                Cartes, pions, portraits et illustrations. Glissez-deposez vos fichiers pour les
                ajouter — ils seront disponibles pour toute la table.
              </p>
              <AssetLibrary />
            </div>
          ) : null}

          {tab === 'table' ? (
            <div className="prep-table-grid">
              <section className="card pad">
                <h3>La campagne</h3>
                <div className="field">
                  <label>Nom</label>
                  <LazyInput value={campaign.name} onCommit={(name) => saveCampaign({ name })} />
                </div>
                <div className="field">
                  <label>Résumé</label>
                  <LazyInput
                    as="textarea"
                    className="textarea"
                    rows={5}
                    value={campaign.description}
                    onCommit={(description) => saveCampaign({ description })}
                  />
                </div>
                <div className="join-code big">
                  <span className="label">Code d'invitation</span>
                  <strong className="mono">{campaign.joinCode}</strong>
                  <button
                    type="button"
                    className="btn xs"
                    onClick={async () => {
                      const ok = await copyToClipboard(campaign.joinCode);
                      toast(ok ? 'Code copié' : 'Impossible de copier le code', ok ? 'success' : 'error');
                    }}
                  >
                    Copier
                  </button>
                  <button type="button" className="btn xs ghost" onClick={regenerateCode}>
                    Régénérer
                  </button>
                </div>
              </section>

              <section className="card pad">
                <h3>Joueurs ({campaign.members?.length})</h3>
                <ul className="prep-member-list">
                  {campaign.members?.map((member) => (
                    <li key={member.userId}>
                      <Avatar name={member.username} url={member.avatarUrl} size={34} />
                      <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                        <span className="row" style={{ gap: 6 }}>
                          <strong>{member.username}</strong>
                          {member.userId === campaign.gmId ? <span className="tag gm">MJ</span> : null}
                        </span>
                        <span className="faint" style={{ fontSize: 12 }}>
                          {characters.filter((c) => c.ownerId === member.userId && !c.isNpc).map((c) => c.name).join(', ') ||
                            'aucun personnage'}
                        </span>
                      </div>
                      {member.userId !== campaign.gmId ? (
                        <div className="row" style={{ gap: 6 }}>
                          <button
                            type="button"
                            className="btn xs ghost"
                            onClick={() => {
                              setCreatingFor(member);
                              setNewCharForm({ name: '', class: 'Guerrier', race: 'Humain' });
                            }}
                          >
                            Créer une fiche
                          </button>
                          <select
                            className="select sm"
                            value={member.role}
                            onChange={(e) => setMemberRole(member.userId, e.target.value)}
                          >
                            <option value="PLAYER">Joueur</option>
                            <option value="GM">Co-MJ</option>
                          </select>
                          <button type="button" className="btn xs danger" onClick={() => removeMember(member)}>
                            Exclure
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className="faint">
                  Un co-MJ voit les pions cachés, les notes de scène et peut modifier les cartes.
                </p>
              </section>
            </div>
          ) : null}
        </div>
      </main>

      {openCharacter ? (
        <CharacterSheet character={openCharacter} onClose={() => setOpenCharacter(null)} />
      ) : null}

      <Modal
        open={Boolean(creatingFor)}
        title={`Créer une fiche pour ${creatingFor?.username || ''}`}
        onClose={() => setCreatingFor(null)}
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => setCreatingFor(null)}>
              Annuler
            </button>
            <button type="button" className="btn primary" onClick={createCharacterFor} disabled={!newCharForm.name.trim()}>
              Créer
            </button>
          </>
        }
      >
        <div className="col" style={{ gap: 12 }}>
          <p className="faint" style={{ margin: 0 }}>
            Cette fiche ne sera visible et modifiable que par vous et {creatingFor?.username}.
          </p>
          <div className="field">
            <label>Nom du personnage</label>
            <input
              className="input"
              value={newCharForm.name}
              onChange={(e) => setNewCharForm({ ...newCharForm, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && createCharacterFor()}
              placeholder="Aelith Ombrelune"
            />
          </div>
          <div className="field">
            <label>Classe</label>
            <select
              className="select"
              value={newCharForm.class}
              onChange={(e) => setNewCharForm({ ...newCharForm, class: e.target.value })}
            >
              {CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Race</label>
            <select
              className="select"
              value={newCharForm.race}
              onChange={(e) => setNewCharForm({ ...newCharForm, race: e.target.value })}
            >
              {RACES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
