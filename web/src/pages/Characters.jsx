import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth, useTable } from '../lib/store.js';
import { TopBar } from '../components/TopBar.jsx';
import { Modal, Spinner, useToast, useConfirm } from '../components/Ui.jsx';
import { StyledToken } from '../components/TokenStyler.jsx';
import { CharacterSheet } from '../components/CharacterSheet.jsx';
import { IconJoin, IconTrash, IconSheet } from '../components/Icons.jsx';
import { CLASSES, RACES, SUBRACES, TEMPLATES, SPELL_ABILITY_BY_CLASS, modifier } from '../lib/dnd.js';

/** Galerie de tous les personnages du joueur, toutes campagnes confondues. */
export function CharactersPage() {
  const me = useAuth((s) => s.user);
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [characters, setCharacters] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', playerName: '', class: 'Guerrier', race: 'Humain', subrace: '', campaignId: '' });
  const [joining, setJoining] = useState(null);
  const [joinCampaignId, setJoinCampaignId] = useState('');
  const [openSheet, setOpenSheet] = useState(null);

  const load = async () => {
    const [{ characters: list }, { campaigns: campaignList }] = await Promise.all([
      api.get('/characters'),
      api.get('/campaigns'),
    ]);
    setCharacters(list);
    setCampaigns(campaignList);
    // La fiche lit et écrit via le store de la table : on l'alimente ici pour
    // qu'elle fonctionne hors campagne. Les actions liées à une table (poser un
    // pion, lancer les dés) se désactivent d'elles-mêmes, faute de scène.
    useTable.setState({ characters: list });
  };

  useEffect(() => {
    load().catch((err) => toast(err.message, 'error'));
  }, []);

  const openCreate = () => {
    setForm((f) => ({ ...f, playerName: f.playerName || me?.username || '' }));
    setCreating(true);
  };

  const create = async () => {
    if (!form.name.trim()) return;
    const template = TEMPLATES[form.class];
    const conMod = modifier(template?.abilities?.con ?? 10);
    const hitDieMax = Number((template?.hitDice || '1d8').split('d')[1]);
    try {
      const created = await api.post('/characters', {
        name: form.name.trim(),
        campaignId: form.campaignId || undefined,
        class: form.class,
        race: form.race,
        subrace: form.subrace || undefined,
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
        spellcasting: { ability: SPELL_ABILITY_BY_CLASS[form.class] || 'int', slots: {}, known: [] },
        details: form.playerName.trim() ? { playerName: form.playerName.trim() } : undefined,
      });
      const { character } = created;
      setCreating(false);
      setForm({ name: '', playerName: '', class: 'Guerrier', race: 'Humain', subrace: '', campaignId: '' });
      await load();
      // La fiche s'ouvre dans la foulée : c'est le moment où l'on complète son
      // personnage, pas à l'entrée dans une campagne.
      setOpenSheet(character);
      toast('Personnage créé — complétez sa fiche', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const joinCampaign = async () => {
    if (!joining || !joinCampaignId) return;
    try {
      await api.patch(`/characters/${joining.id}`, { campaignId: joinCampaignId });
      setJoining(null);
      setJoinCampaignId('');
      await load();
      toast('Personnage associé à la campagne', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const remove = async (character) => {
    const ok = await confirm({
      title: 'Supprimer le personnage',
      message: `« ${character.name} » sera définitivement supprimé.`,
      danger: true,
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    await api.del(`/characters/${character.id}`);
    await load();
  };

  return (
    <div className="page">
      {confirmNode}
      <TopBar />
      <main className="page-body">
        <div className="dashboard-head">
          <div>
            <h1>Mes personnages</h1>
            <p className="muted">
              Vos héros vous suivent d'une campagne à l'autre. Ouvrez une fiche pour la compléter
              ou la modifier, ici comme à la table de jeu.
            </p>
          </div>
          <button type="button" className="btn primary" onClick={openCreate}>
            Nouveau personnage
          </button>
        </div>

        {characters === null ? <Spinner /> : null}

        <div className="character-grid">
          {characters?.map((character) => (
            <article key={character.id} className="character-card card">
              <StyledToken
                style={character.style}
                imageUrl={character.portraitUrl}
                name={character.name}
                size={84}
              />
              <div className="col" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                <strong className="ellipsis">{character.name}</strong>
                <span className="faint">
                  {character.race} {character.class} · niveau {character.level}
                </span>
                <span className="faint" style={{ fontSize: 12 }}>
                  {character.hp}/{character.maxHp} PV · CA {character.ac}
                </span>
                <span className="faint" style={{ fontSize: 12 }}>
                  {character.campaign?.name ? `Campagne : ${character.campaign.name}` : 'Sans campagne'}
                </span>
              </div>
              <div className="row card-actions">
                <button
                  type="button"
                  className="btn ghost icon"
                  onClick={() => setOpenSheet(character)}
                  title="Voir et modifier la fiche"
                  aria-label={`Voir et modifier la fiche de ${character.name}`}
                >
                  <IconSheet />
                </button>
                {!character.campaign && campaigns.length > 0 ? (
                  <button
                    type="button"
                    className="btn ghost icon"
                    onClick={() => {
                      setJoining(character);
                      setJoinCampaignId(campaigns[0].id);
                    }}
                    title="Rejoindre une campagne"
                    aria-label={`Faire rejoindre une campagne à ${character.name}`}
                  >
                    <IconJoin />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn ghost icon danger-hover"
                  onClick={() => remove(character)}
                  title="Supprimer le personnage"
                  aria-label={`Supprimer ${character.name}`}
                >
                  <IconTrash />
                </button>
              </div>
            </article>
          ))}
          {characters?.length === 0 ? (
            <div className="card empty-state" style={{ gridColumn: '1/-1' }}>
              <h3>Aucun personnage</h3>
              <p className="muted">Créez votre premier héros : les caractéristiques de base seront pre-remplies selon la classe.</p>
              <button type="button" className="btn primary" onClick={openCreate}>
                Créer un personnage
              </button>
            </div>
          ) : null}
        </div>
      </main>

      {openSheet ? (
        <CharacterSheet
          character={openSheet}
          onClose={async () => {
            setOpenSheet(null);
            await load().catch(() => {});
          }}
        />
      ) : null}

      <Modal
        open={creating}
        title="Nouveau personnage"
        onClose={() => setCreating(false)}
        size="sm"
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => setCreating(false)}>
              Annuler
            </button>
            <button type="button" className="btn primary" onClick={create} disabled={!form.name.trim()}>
              Créer
            </button>
          </>
        }
      >
        <div className="col" style={{ gap: 12 }}>
          <div className="field">
            <label>Nom</label>
            <input
              className="input"
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder="Aelith Ombrelune"
            />
          </div>
          <div className="field">
            <label>Nom du joueur</label>
            <input
              className="input"
              value={form.playerName}
              onChange={(e) => setForm({ ...form, playerName: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
          </div>
          <div className="field">
            <label>Classe</label>
            <select className="select" value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })}>
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
              value={form.race}
              onChange={(e) => setForm({ ...form, race: e.target.value, subrace: '' })}
            >
              {RACES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          {/* Regles 2014 : certaines races se declinent en sous-races, d'autres
              non. Le champ n'apparait que lorsqu'un choix existe. */}
          {SUBRACES[form.race]?.length ? (
            <div className="field">
              <label>Sous-race</label>
              <select
                className="select"
                value={form.subrace}
                onChange={(e) => setForm({ ...form, subrace: e.target.value })}
              >
                <option value="">À choisir plus tard</option>
                {SUBRACES[form.race].map((sr) => (
                  <option key={sr} value={sr}>
                    {sr}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {campaigns.length > 0 ? (
            <div className="field">
              <label>Campagne (optionnel)</label>
              <select
                className="select"
                value={form.campaignId}
                onChange={(e) => setForm({ ...form, campaignId: e.target.value })}
              >
                <option value="">Aucune — à associer plus tard</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <p className="faint" style={{ margin: 0 }}>
            Caractéristiques, points de vie et maîtrises seront pre-remplis selon la classe choisie.
            Tout reste modifiable ensuite.
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(joining)}
        title="Rejoindre une campagne"
        onClose={() => setJoining(null)}
        size="sm"
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => setJoining(null)}>
              Annuler
            </button>
            <button type="button" className="btn primary" onClick={joinCampaign} disabled={!joinCampaignId}>
              Rejoindre
            </button>
          </>
        }
      >
        <div className="col" style={{ gap: 12 }}>
          <p className="faint" style={{ margin: 0 }}>
            « {joining?.name} » rejoindra la campagne choisie et deviendra visible à la table.
          </p>
          <div className="field">
            <label>Campagne</label>
            <select className="select" value={joinCampaignId} onChange={(e) => setJoinCampaignId(e.target.value)}>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
