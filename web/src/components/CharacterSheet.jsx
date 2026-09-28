import { useEffect, useMemo, useState } from 'react';
import { useTable, useAuth } from '../lib/store.js';
import {
  ABILITIES, SKILLS, CLASSES, RACES, BACKGROUNDS, ALIGNMENTS, DAMAGE_TYPES,
  TEMPLATES, SPELL_ABILITY_BY_CLASS, modifier, proficiencyBonus, signed, levelFromXp,
} from '../lib/dnd.js';
import { api } from '../lib/api.js';
import { Modal, LazyInput, Spinner, InfoTip, FieldLabel, useToast, useConfirm } from './Ui.jsx';
import {
  IconCharacter, IconSkills, IconCombat, IconSpells, IconGear, IconStory, IconLook, IconNotes,
} from './Icons.jsx';
import { AssetLibrary } from './AssetLibrary.jsx';
import { TokenStyler } from './TokenStyler.jsx';
import { CharacterPrintSheet } from './CharacterPrintSheet.jsx';

const TABS = [
  { key: 'main', label: 'Personnage', icon: <IconCharacter /> },
  { key: 'skills', label: 'Compétences', icon: <IconSkills /> },
  { key: 'combat', label: 'Combat', icon: <IconCombat /> },
  { key: 'spells', label: 'Sorts', icon: <IconSpells /> },
  { key: 'gear', label: 'Équipement', icon: <IconGear /> },
  { key: 'story', label: 'Histoire', icon: <IconStory /> },
  { key: 'look', label: 'Apparence', icon: <IconLook /> },
  { key: 'notes', label: 'Notes', icon: <IconNotes /> },
];

const uid = () => Math.random().toString(36).slice(2, 10);

export function CharacterSheet({ character: initial, onClose }) {
  const characters = useTable((s) => s.characters);
  const saveCharacter = useTable((s) => s.saveCharacter);
  const deleteCharacter = useTable((s) => s.deleteCharacter);
  const createToken = useTable((s) => s.createToken);
  const scene = useTable((s) => s.scene);
  const roll = useTable((s) => s.roll);
  const isGM = useTable((s) => s.isGM);
  const me = useAuth((s) => s.user);
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [tab, setTab] = useState('main');
  const [hpDelta, setHpDelta] = useState(5);

  // La fiche vit dans le store : elle se met à jour si un autre client l'edite.
  const character = useMemo(
    () => characters.find((c) => c.id === initial?.id) || initial,
    [characters, initial],
  );
  const editable = character && (character.ownerId === me?.id || isGM);

  useEffect(() => setTab('main'), [initial?.id]);

  if (!character) return null;

  const abilities = character.abilities || {};
  const derived = character.derived || {};
  const prof = derived.proficiencyBonus ?? proficiencyBonus(character.level);
  const profs = character.proficiencies || { saves: {}, skills: {} };

  const save = (patch) => {
    if (!editable) return;
    saveCharacter(character.id, patch).catch((err) => toast(err.message, 'error'));
  };

  const doRoll = (formula, label, advantage = 'none') =>
    roll({ formula, label, advantage, characterName: character.name })
      .then((res) => {
        if (res?.error) toast(res.error, 'error');
      })
      .catch((err) => toast(err.message, 'error'));

  const rollWithModifiers = (bonus, label) => (e) => {
    const advantage = e.shiftKey ? 'advantage' : e.ctrlKey || e.metaKey ? 'disadvantage' : 'none';
    doRoll(`1d20${signed(bonus)}`, label, advantage);
  };

  const applyTemplate = (className) => {
    const template = TEMPLATES[className];
    if (!template) return save({ class: className });
    const conMod = modifier(template.abilities.con);
    const hitDieMax = Number(template.hitDice.split('d')[1]);
    save({
      class: className,
      abilities: template.abilities,
      ac: template.ac,
      hitDice: `${character.level}d${hitDieMax}`,
      hitDiceLeft: character.level,
      maxHp: hitDieMax + conMod,
      hp: hitDieMax + conMod,
      proficiencies: {
        saves: Object.fromEntries(template.saves.map((s) => [s, 1])),
        skills: Object.fromEntries(template.skills.map((s) => [s, 1])),
      },
      spellcasting: {
        ...(character.spellcasting || {}),
        ability: SPELL_ABILITY_BY_CLASS[className] || 'int',
      },
    });
  };

  const adjustHp = (amount) => {
    let { hp, tempHp, maxHp } = character;
    if (amount < 0) {
      const absorbed = Math.min(tempHp || 0, -amount);
      tempHp = (tempHp || 0) - absorbed;
      hp = Math.max(-maxHp, hp + amount + absorbed);
    } else {
      hp = Math.min(maxHp, hp + amount);
    }
    save({ hp, tempHp });
  };

  const dropOnMap = async () => {
    if (!scene) return toast('Aucune scène active', 'error');
    const scalePx = scene.scalePx || 70;
    try {
      await createToken({
        name: character.name,
        imageUrl: character.tokenUrl || character.portraitUrl || null,
        style: character.style || {},
        characterId: character.id,
        x: Math.round((scene.width - scalePx) / 2),
        y: Math.round((scene.height - scalePx) / 2),
        width: scalePx,
        height: scalePx,
        hp: character.hp,
        maxHp: character.maxHp,
        ac: character.ac,
      });
      toast(`${character.name} est posé sur la carte`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const hpRatio = character.maxHp ? Math.max(0, Math.min(1, character.hp / character.maxHp)) : 0;
  const tempRatio = character.maxHp
    ? Math.max(0, Math.min(1 - hpRatio, (character.tempHp || 0) / character.maxHp))
    : 0;
  // La couleur porte l'information : on doit pouvoir juger l'état du personnage
  // sans lire les chiffres, y compris de loin pendant une partie.
  const [hpColor, hpState] =
    character.hp <= 0
      ? ['var(--blood)', 'À terre']
      : hpRatio <= 0.25
        ? ['var(--blood)', 'Critique']
        : hpRatio <= 0.5
          ? ['#d9a441', 'Blessé']
          : ['#57a866', 'En forme'];

  return (
    <Modal open title="" onClose={onClose} size="sheet">
      {confirmNode}
      <div className="sheet">
        <header className="sheet-head">
          <button
            type="button"
            className="sheet-portrait"
            style={{
              background: character.portraitUrl
                ? `center/cover url(${character.portraitUrl})`
                : character.style?.accent || 'var(--ink-700)',
              borderColor: character.style?.frameColor || 'var(--brass-dim)',
            }}
            onClick={() => setTab('look')}
            title="Changer le portrait"
          >
            {!character.portraitUrl ? <span>{character.name?.[0]?.toUpperCase()}</span> : null}
          </button>

          <div className="sheet-identity">
            <LazyInput
              className="input sheet-name"
              value={character.name}
              onCommit={(name) => save({ name })}
              disabled={!editable}
            />
            <div className="sheet-sub">
              <select
                className="select sm"
                value={character.class}
                onChange={(e) => applyTemplate(e.target.value)}
                disabled={!editable}
              >
                <option value="">Classe…</option>
                {CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="select sm"
                value={character.race}
                onChange={(e) => save({ race: e.target.value })}
                disabled={!editable}
              >
                <option value="">Race…</option>
                {RACES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <label className="mini-field">
                <span>Niveau</span>
                <LazyInput
                  className="input sm center"
                  type="number"
                  value={character.level}
                  onCommit={(v) => save({ level: Math.max(1, Math.min(20, Number(v) || 1)) })}
                  disabled={!editable}
                />
              </label>
              <span className="mini-field">
                <span>Maîtrise</span>
                <strong className="mono">{signed(prof)}</strong>
              </span>
            </div>
          </div>

          <div className="sheet-vitals">
            <div
              className="vital-hp"
              style={{ '--ratio': hpRatio, '--temp-ratio': tempRatio, '--hp-color': hpColor }}
            >
              <div className="hp-head">
                <span className="label">Points de vie</span>
                <span className="hp-state" style={{ color: hpColor }}>
                  {hpState}
                </span>
              </div>

              <div className="hp-values">
                <LazyInput
                  className="input hp-current"
                  type="number"
                  value={character.hp}
                  onCommit={(v) => save({ hp: Number(v) || 0 })}
                  disabled={!editable}
                />
                <span className="hp-max">/ {character.maxHp}</span>
                {character.tempHp > 0 ? (
                  <span className="hp-temp-badge" title="Points de vie temporaires">
                    +{character.tempHp} temp.
                  </span>
                ) : null}
              </div>

              <div className="hp-bar">
                <span className="hp-bar-fill" />
                {character.tempHp > 0 ? <span className="hp-bar-temp" /> : null}
              </div>

              <div className="hp-actions">
                <button type="button" className="btn xs danger" onClick={() => adjustHp(-hpDelta)} disabled={!editable} title="Infliger des dégâts">
                  −
                </button>
                <input
                  className="input sm center"
                  type="number"
                  value={hpDelta}
                  onChange={(e) => setHpDelta(Math.max(1, Number(e.target.value) || 1))}
                  aria-label="Nombre de points de vie à retirer ou rendre"
                />
                <button type="button" className="btn xs" onClick={() => adjustHp(hpDelta)} disabled={!editable} title="Soigner">
                  +
                </button>
                <InfoTip
                  help="Le − retire d'abord les points de vie temporaires, puis les points de vie réels. Le + ne dépasse jamais le maximum."
                  example="Avec 12 PV et 4 temporaires, infliger 6 laisse 10 PV et 0 temporaire"
                />
              </div>
            </div>

            <div className="vital-box">
              <span className="label">CA<InfoTip help={"Classe d'armure : le score qu'un attaquant doit atteindre ou depasser sur son jet pour toucher."} example={"Cotte de mailles (16) + bouclier (+2) = 18"} /></span>
              <LazyInput
                className="input center big"
                type="number"
                value={character.ac}
                onCommit={(v) => save({ ac: Number(v) || 10 })}
                disabled={!editable}
              />
            </div>
            <button
              type="button"
              className="vital-box clickable"
              onClick={rollWithModifiers(derived.initiative ?? 0, 'Initiative')}
              title="Lancer l'initiative (Maj = avantage)"
            >
              <span className="label">Init.<InfoTip help={"Bonus ajoute au d20 au debut d'un combat pour determiner l'ordre des tours. Il vaut le modificateur de Dexterite."} example={"+2 de Dexterite : on lance 1d20+2"} /></span>
              <strong className="big mono">{signed(derived.initiative ?? 0)}</strong>
            </button>
            <div className="vital-box">
              <span className="label">Vitesse<InfoTip help={"Distance parcourue en un tour, en pieds. Le cercle affiche sur la carte quand le pion est selectionne en decoule."} example={"30 pour un humain, 25 pour un nain"} /></span>
              <LazyInput
                className="input center big"
                type="number"
                value={character.speed}
                onCommit={(v) => save({ speed: Number(v) || 0 })}
                disabled={!editable}
              />
            </div>
          </div>

          <div className="sheet-head-actions">
            <button type="button" className="btn sm primary" onClick={dropOnMap}>
              Poser sur la carte
            </button>
            <button type="button" className="btn sm" onClick={() => window.print()}>
              Exporter en PDF
            </button>
            {editable ? (
              <button
                type="button"
                className="btn sm danger"
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Supprimer le personnage',
                    message: `« ${character.name} » sera définitivement supprimé.`,
                    danger: true,
                    confirmLabel: 'Supprimer',
                  });
                  if (ok) {
                    await deleteCharacter(character.id);
                    onClose();
                  }
                }}
              >
                Supprimer
              </button>
            ) : null}
          </div>
        </header>

        <div className="sheet-main">
          <nav className="sheet-rail" aria-label="Sections de la fiche">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`sheet-rail-btn ${tab === item.key ? 'active' : ''}`}
                aria-current={tab === item.key ? 'page' : undefined}
                onClick={() => setTab(item.key)}
              >
                <span className="sheet-rail-icon">{item.icon}</span>
                <span className="sheet-rail-label">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="sheet-body scroll">
          {tab === 'main' ? (
            <MainTab
              character={character}
              abilities={abilities}
              derived={derived}
              profs={profs}
              prof={prof}
              editable={editable}
              save={save}
              rollWithModifiers={rollWithModifiers}
            />
          ) : null}
          {tab === 'skills' ? (
            <SkillsTab
              character={character}
              profs={profs}
              derived={derived}
              editable={editable}
              save={save}
              rollWithModifiers={rollWithModifiers}
            />
          ) : null}
          {tab === 'combat' ? (
            <CombatTab character={character} editable={editable} save={save} doRoll={doRoll} derived={derived} />
          ) : null}
          {tab === 'spells' ? (
            <SpellsTab character={character} editable={editable} save={save} derived={derived} doRoll={doRoll} />
          ) : null}
          {tab === 'gear' ? <GearTab character={character} editable={editable} save={save} /> : null}
          {tab === 'story' ? <StoryTab character={character} editable={editable} save={save} /> : null}
          {tab === 'look' ? <LookTab character={character} editable={editable} save={save} /> : null}
          {tab === 'notes' ? <NotesTab characterId={character.id} isOwner={character.ownerId === me?.id} /> : null}
          </div>
        </div>
      </div>
      <CharacterPrintSheet character={character} derived={derived} prof={prof} profs={profs} />
    </Modal>
  );
}

/* ------------------------------------------------------------- Onglets --- */

function MainTab({ character, abilities, derived, profs, prof, editable, save, rollWithModifiers }) {
  const details = character.details || {};
  const setDetail = (key, value) => save({ details: { ...details, [key]: value } });

  const setAbility = (key, value) =>
    save({ abilities: { ...abilities, [key]: Math.max(1, Math.min(30, Number(value) || 10)) } });

  const toggleSave = (key) =>
    save({
      proficiencies: {
        ...profs,
        saves: { ...profs.saves, [key]: profs.saves?.[key] ? 0 : 1 },
      },
    });

  return (
    <div className="sheet-grid">
      <section className="ability-row">
        {ABILITIES.map((ability) => {
          const score = abilities[ability.key] ?? 10;
          const mod = derived.mods?.[ability.key] ?? modifier(score);
          return (
            <div key={ability.key} className="ability-card">
              <span className="ability-name">{ability.label}</span>
              <button
                type="button"
                className="ability-mod"
                onClick={rollWithModifiers(mod, `Test de ${ability.label}`)}
                title={`Test de ${ability.label} — Maj : avantage, Ctrl : désavantage`}
              >
                {signed(mod)}
              </button>
              <LazyInput
                className="input center ability-score"
                type="number"
                value={score}
                onCommit={(v) => setAbility(ability.key, v)}
                disabled={!editable}
              />
              <button
                type="button"
                className={`ability-save ${profs.saves?.[ability.key] ? 'proficient' : ''}`}
                onClick={rollWithModifiers(derived.saves?.[ability.key] ?? mod, `Sauvegarde de ${ability.label}`)}
              >
                <span
                  className="dot"
                  onClick={(e) => {
                    if (!editable) return;
                    e.stopPropagation();
                    toggleSave(ability.key);
                  }}
                  title="Maîtrise de la sauvegarde"
                />
                Sauv. {signed(derived.saves?.[ability.key] ?? mod)}
              </button>
            </div>
          );
        })}
      </section>

      <section className="card pad">
        <h4 className="panel-title">État<InfoTip help={"Points de vie, des de vie et jets de mort : tout ce qui decrit la condition physique du personnage en cours de partie."} example={"A 0 point de vie, on lance un jet de sauvegarde contre la mort a chaque tour"} /></h4>
        <div className="grid-3">
          <div className="field">
            <label><FieldLabel help={"Points de vie au maximum, une fois complètement reposé. Il augmente à chaque niveau selon le dé de vie de la classe et le modificateur de Constitution."} example={"Un guerrier niveau 3 avec +2 en Constitution : 10 + 2 × (1d10 + 2)"}>PV max</FieldLabel></label>
            <LazyInput
              className="input"
              type="number"
              value={character.maxHp}
              onCommit={(v) => save({ maxHp: Math.max(1, Number(v) || 1) })}
              disabled={!editable}
            />
          </div>
          <div className="field">
            <label><FieldLabel help={"Points de vie encaissés en premier, qui ne se cumulent pas entre eux : une nouvelle source remplace la précédente si elle est plus élevée. Ils disparaissent au repos long."} example={"Le sort Armure du mage n'en donne pas, mais Mots de guérison trompeurs en accorde 1d4 + modificateur"}>PV temporaires</FieldLabel></label>
            <LazyInput
              className="input"
              type="number"
              value={character.tempHp}
              onCommit={(v) => save({ tempHp: Math.max(0, Number(v) || 0) })}
              disabled={!editable}
            />
          </div>
          <div className="field">
            <label><FieldLabel help={"Dé lancé pour récupérer des points de vie pendant un repos court, un par niveau. Il dépend de la classe."} example={"d6 pour un magicien, d10 pour un guerrier, d12 pour un barbare"}>Dés de vie</FieldLabel></label>
            <LazyInput
              className="input"
              value={character.hitDice}
              onCommit={(hitDice) => save({ hitDice })}
              disabled={!editable}
            />
          </div>
        </div>
        <div className="row wrap" style={{ gap: 16, marginTop: 10 }}>
          <label className="check">
            <input
              type="checkbox"
              checked={character.inspiration}
              onChange={(e) => save({ inspiration: e.target.checked })}
              disabled={!editable}
            />
            Inspiration
          </label>
          <DeathSaves character={character} save={save} editable={editable} />
        </div>
      </section>

      <section className="card pad">
        <h4 className="panel-title">Identité<InfoTip help={"Qui est le personnage sur le papier : son passe, sa morale, sa specialisation et sa progression."} example={"Sage, Neutre bon, College du savoir"} /></h4>
        <div className="grid-2">
          <div className="field">
            <label><FieldLabel help={"Le passé du personnage avant l'aventure. Il accorde deux maîtrises de compétence et un trait de personnalité."} example={"Sage, Criminel, Soldat, Artisan de guilde"}>Historique</FieldLabel></label>
            <select
              className="select"
              value={character.background}
              onChange={(e) => save({ background: e.target.value })}
              disabled={!editable}
            >
              <option value="">—</option>
              {BACKGROUNDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label><FieldLabel help={"La boussole morale du personnage : comment il tranche entre la loi et la liberté, le bien et l'égoïsme."} example={"Chaotique bon : il désobéit aux règles quand elles nuisent aux gens"}>Alignement</FieldLabel></label>
            <select
              className="select"
              value={character.alignment}
              onChange={(e) => save({ alignment: e.target.value })}
              disabled={!editable}
            >
              <option value="">—</option>
              {ALIGNMENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label><FieldLabel help={"La spécialisation choisie à l'intérieur de la classe, généralement au niveau 2 ou 3."} example={"Pour un barde : Collège du savoir ; pour un guerrier : Champion"}>Sous-classe</FieldLabel></label>
            <LazyInput
              className="input"
              value={character.subclass}
              onCommit={(subclass) => save({ subclass })}
              disabled={!editable}
            />
          </div>
          <div className="field">
            <label><FieldLabel help={"La personne qui incarne ce personnage. Utile quand plusieurs joueurs partagent la table."} example={"Camille"}>Nom du joueur</FieldLabel></label>
            <LazyInput
              className="input"
              value={details.playerName || ''}
              onCommit={(v) => setDetail('playerName', v)}
              disabled={!editable}
            />
          </div>
          <div className="field">
            <label>
              <FieldLabel
                help="Points d'expérience cumulés. Le niveau affiché à côté est celui que ce total permet d'atteindre."
                example="2 700 XP correspond au niveau 4"
              >
                Expérience (niveau {levelFromXp(character.xp)})
              </FieldLabel>
            </label>
            <LazyInput
              className="input"
              type="number"
              value={character.xp}
              onCommit={(v) => save({ xp: Math.max(0, Number(v) || 0) })}
              disabled={!editable}
            />
          </div>
        </div>
      </section>

      <section className="card pad passive-row">
        <div>
          <span className="label">Perception passive</span>
          <strong className="big mono">{derived.passivePerception ?? 10}</strong>
        </div>
        <div>
          <span className="label">Perspicacité passive</span>
          <strong className="big mono">{derived.passiveInsight ?? 10}</strong>
        </div>
        <div>
          <span className="label">Bonus de maîtrise</span>
          <strong className="big mono">{signed(prof)}</strong>
        </div>
      </section>
    </div>
  );
}

function DeathSaves({ character, save, editable }) {
  const ds = character.deathSaves || { successes: 0, failures: 0 };
  const set = (key, value) => save({ deathSaves: { ...ds, [key]: value } });
  return (
    <div className="death-saves">
      <span className="label">Jets de mort</span>
      <div className="row" style={{ gap: 10 }}>
        <span className="row" style={{ gap: 3 }}>
          {[1, 2, 3].map((n) => (
            <button
              key={`s${n}`}
              type="button"
              className={`ds-dot success ${ds.successes >= n ? 'on' : ''}`}
              onClick={() => editable && set('successes', ds.successes >= n ? n - 1 : n)}
              title={`${n} réussite(s)`}
            />
          ))}
        </span>
        <span className="row" style={{ gap: 3 }}>
          {[1, 2, 3].map((n) => (
            <button
              key={`f${n}`}
              type="button"
              className={`ds-dot failure ${ds.failures >= n ? 'on' : ''}`}
              onClick={() => editable && set('failures', ds.failures >= n ? n - 1 : n)}
              title={`${n} échec(s)`}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

function SkillsTab({ character, profs, derived, editable, save, rollWithModifiers }) {
  const cycle = (key) => {
    const current = profs.skills?.[key] || 0;
    save({
      proficiencies: { ...profs, skills: { ...profs.skills, [key]: (current + 1) % 3 } },
    });
  };

  return (
    <div className="card pad">
      <p className="faint" style={{ marginTop: 0 }}>
        Cliquez sur la pastille pour alterner entre aucune maîtrise, maîtrise et expertise. Maj +
        clic sur un jet pour un avantage, Ctrl + clic pour un désavantage.
        <InfoTip
          help="La maîtrise ajoute le bonus de maîtrise au jet, l'expertise le double. Elles viennent de la classe et de l'historique."
          example="Un roublard niveau 5 avec expertise en Discrétion ajoute +6 au lieu de +3"
        />
      </p>
      <ul className="skill-list">
        {SKILLS.map((skill) => {
          const rank = profs.skills?.[skill.key] || 0;
          const bonus = derived.skills?.[skill.key] ?? 0;
          const ability = ABILITIES.find((a) => a.key === skill.ability);
          return (
            <li key={skill.key}>
              <button
                type="button"
                className={`prof-dot rank-${rank}`}
                onClick={() => editable && cycle(skill.key)}
                title={['Aucune maîtrise', 'Maîtrise', 'Expertise'][rank]}
                aria-label={`Maîtrise de ${skill.label}`}
              />
              <button
                type="button"
                className="skill-roll"
                onClick={rollWithModifiers(bonus, skill.label)}
              >
                <span className="skill-name">{skill.label}</span>
                <span className="skill-ability">{ability?.short}</span>
                <span className="skill-bonus mono">{signed(bonus)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CombatTab({ character, editable, save, doRoll, derived }) {
  const attacks = character.attacks || [];

  const update = (index, patch) =>
    save({ attacks: attacks.map((a, i) => (i === index ? { ...a, ...patch } : a)) });

  const add = () =>
    save({
      attacks: [
        ...attacks,
        { id: uid(), name: 'Nouvelle attaque', bonus: derived.proficiencyBonus ?? 2, damage: '1d6', type: 'Tranchant', range: 'CaC', notes: '' },
      ],
    });

  return (
    <div className="col" style={{ gap: 12 }}>
      <section className="card pad">
        <div className="row">
          <h4 className="panel-title">Attaques<InfoTip help={"Armes et sorts d'attaque, avec leur bonus au jet et leurs degats. Un clic sur une ligne lance le de et annonce le resultat dans le chat."} example={"Rapiere — bonus +5, degats 1d8+3 perforant"} /></h4>
          <span className="spacer" />
          {editable ? (
            <button type="button" className="btn xs primary" onClick={add}>
              + Ajouter
            </button>
          ) : null}
        </div>
        <table className="sheet-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th style={{ width: 70 }}>Bonus</th>
              <th style={{ width: 100 }}>Dégâts</th>
              <th style={{ width: 130 }}>Type</th>
              <th style={{ width: 110 }}>Jets</th>
              <th style={{ width: 34 }} />
            </tr>
          </thead>
          <tbody>
            {attacks.map((attack, index) => (
              <tr key={attack.id || index}>
                <td>
                  <LazyInput
                    className="input sm"
                    value={attack.name}
                    onCommit={(name) => update(index, { name })}
                    disabled={!editable}
                  />
                </td>
                <td>
                  <LazyInput
                    className="input sm center"
                    type="number"
                    value={attack.bonus ?? 0}
                    onCommit={(v) => update(index, { bonus: Number(v) || 0 })}
                    disabled={!editable}
                  />
                </td>
                <td>
                  <LazyInput
                    className="input sm center mono"
                    value={attack.damage}
                    onCommit={(damage) => update(index, { damage })}
                    disabled={!editable}
                  />
                </td>
                <td>
                  <select
                    className="select sm"
                    value={attack.type || ''}
                    onChange={(e) => update(index, { type: e.target.value })}
                    disabled={!editable}
                  >
                    <option value="">—</option>
                    {DAMAGE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    <button
                      type="button"
                      className="btn xs"
                      onClick={(e) =>
                        doRoll(
                          `1d20${signed(attack.bonus ?? 0)}`,
                          `${attack.name} — attaque`,
                          e.shiftKey ? 'advantage' : e.ctrlKey || e.metaKey ? 'disadvantage' : 'none',
                        )
                      }
                    >
                      Att.
                    </button>
                    <button
                      type="button"
                      className="btn xs"
                      onClick={() => doRoll(attack.damage, `${attack.name} — dégâts${attack.type ? ` (${attack.type})` : ''}`)}
                    >
                      Dég.
                    </button>
                  </div>
                </td>
                <td>
                  {editable ? (
                    <button
                      type="button"
                      className="btn xs ghost"
                      onClick={() => save({ attacks: attacks.filter((_, i) => i !== index) })}
                    >
                      ✕
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!attacks.length ? (
              <tr>
                <td colSpan={6} className="empty">
                  Aucune attaque enregistrée.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="card pad">
        <h4 className="panel-title">Capacités &amp; traits<InfoTip help={"Les capacites utilisables en jeu : dons de classe, traits raciaux, pouvoirs a usage limite."} example={"Inspiration bardique — 1d6, 3 usages par repos court"} /></h4>
        <FeatureList character={character} editable={editable} save={save} />
      </section>
    </div>
  );
}

function FeatureList({ character, editable, save }) {
  const features = character.features || [];
  const update = (index, patch) =>
    save({ features: features.map((f, i) => (i === index ? { ...f, ...patch } : f)) });

  return (
    <div className="col" style={{ gap: 8 }}>
      {features.map((feature, index) => (
        <div key={feature.id || index} className="feature-item">
          <div className="row">
            <LazyInput
              className="input sm"
              value={feature.name}
              onCommit={(name) => update(index, { name })}
              disabled={!editable}
              placeholder="Nom"
            />
            <LazyInput
              className="input sm"
              style={{ maxWidth: 150 }}
              value={feature.source || ''}
              onCommit={(source) => update(index, { source })}
              disabled={!editable}
              placeholder="Source"
            />
            {editable ? (
              <button
                type="button"
                className="btn xs ghost"
                onClick={() => save({ features: features.filter((_, i) => i !== index) })}
              >
                ✕
              </button>
            ) : null}
          </div>
          <LazyInput
            as="textarea"
            className="textarea"
            rows={2}
            value={feature.description || ''}
            onCommit={(description) => update(index, { description })}
            disabled={!editable}
            placeholder="Description…"
          />
        </div>
      ))}
      {editable ? (
        <button
          type="button"
          className="btn sm"
          onClick={() => save({ features: [...features, { id: uid(), name: '', source: '', description: '' }] })}
        >
          + Ajouter une capacité
        </button>
      ) : null}
    </div>
  );
}

function SpellsTab({ character, editable, save, derived, doRoll }) {
  const sc = character.spellcasting || { ability: 'int', slots: {}, known: [] };
  const known = sc.known || [];

  const setSc = (patch) => save({ spellcasting: { ...sc, ...patch } });
  const setSlot = (level, patch) =>
    setSc({ slots: { ...sc.slots, [level]: { ...(sc.slots?.[level] || { max: 0, used: 0 }), ...patch } } });
  const updateSpell = (index, patch) =>
    setSc({ known: known.map((s, i) => (i === index ? { ...s, ...patch } : s)) });

  return (
    <div className="col" style={{ gap: 12 }}>
      <section className="card pad">
        <div className="grid-3">
          <div className="field">
            <label><FieldLabel help={"La caracteristique qui alimente les sorts de la classe. Elle determine le degre de difficulte des sauvegardes et le bonus d'attaque des sorts."} example={"Charisme pour un barde, Intelligence pour un magicien, Sagesse pour un clerc"}>Caractéristique</FieldLabel></label>
            <select
              className="select"
              value={sc.ability || 'int'}
              onChange={(e) => setSc({ ability: e.target.value })}
              disabled={!editable}
            >
              {ABILITIES.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div className="stat-readout">
            <span className="label">DD de sauvegarde</span>
            <strong className="big mono">{derived.spellSaveDc ?? 10}</strong>
          </div>
          <button
            type="button"
            className="stat-readout clickable"
            onClick={(e) =>
              doRoll(
                `1d20${signed(derived.spellAttack ?? 0)}`,
                'Attaque de sort',
                e.shiftKey ? 'advantage' : e.ctrlKey || e.metaKey ? 'disadvantage' : 'none',
              )
            }
          >
            <span className="label">Attaque de sort</span>
            <strong className="big mono">{signed(derived.spellAttack ?? 0)}</strong>
          </button>
        </div>
        <div className="field" style={{ maxWidth: 240, marginTop: 10 }}>
          <label><FieldLabel help={"Nombre de sorts que le personnage choisit apres un repos long. Les classes a sorts connus, comme le barde, laissent ce champ a zero."} example={"Un clerc niveau 3 avec +3 en Sagesse en prepare 6"}>Sorts à préparer chaque jour</FieldLabel></label>
          <LazyInput
            className="input"
            type="number"
            value={sc.prepared ?? 0}
            onCommit={(v) => setSc({ prepared: Math.max(0, Number(v) || 0) })}
            disabled={!editable}
          />
        </div>
      </section>

      <section className="card pad">
        <h4 className="panel-title">Emplacements de sorts<InfoTip help={"Nombre de sorts lancables par niveau avant un repos long. Ils se rechargent tous au repos long."} example={"Un barde niveau 3 a 4 emplacements de niveau 1 et 2 de niveau 2"} /></h4>
        <div className="slot-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => {
            const slot = sc.slots?.[level] || { max: 0, used: 0 };
            return (
              <div key={level} className="slot-card">
                <span className="slot-level">Niv. {level}</span>
                <div className="slot-pips">
                  {Array.from({ length: Math.min(slot.max, 9) }).map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`slot-pip ${i < slot.used ? 'used' : ''}`}
                      onClick={() => editable && setSlot(level, { used: i < slot.used ? i : i + 1 })}
                      title={i < slot.used ? 'Restaurer' : 'Depenser'}
                    />
                  ))}
                </div>
                <LazyInput
                  className="input sm center"
                  type="number"
                  value={slot.max}
                  onCommit={(v) => setSlot(level, { max: Math.max(0, Math.min(9, Number(v) || 0)) })}
                  disabled={!editable}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="card pad">
        <div className="row">
          <h4 className="panel-title">Sorts connus<InfoTip help={"Les sorts que le personnage peut lancer. Les classes a preparation choisissent chaque jour dans cette liste."} example={"Mot de guerison, Vague tonnante, Image silencieuse"} /></h4>
          <span className="spacer" />
          {editable ? (
            <button
              type="button"
              className="btn xs primary"
              onClick={() => setSc({ known: [...known, { id: uid(), name: '', level: 0, prepared: false, notes: '' }] })}
            >
              + Sort
            </button>
          ) : null}
        </div>
        <ul className="spell-list">
          {known.map((spell, index) => (
            <li key={spell.id || index}>
              <button
                type="button"
                className={`prof-dot ${spell.prepared ? 'rank-1' : 'rank-0'}`}
                onClick={() => editable && updateSpell(index, { prepared: !spell.prepared })}
                title={spell.prepared ? 'Préparé' : 'Non préparé'}
              />
              <LazyInput
                className="input sm"
                value={spell.name}
                onCommit={(name) => updateSpell(index, { name })}
                disabled={!editable}
                placeholder="Nom du sort"
              />
              <select
                className="select sm"
                style={{ maxWidth: 110 }}
                value={spell.level ?? 0}
                onChange={(e) => updateSpell(index, { level: Number(e.target.value) })}
                disabled={!editable}
              >
                <option value={0}>Tour de magie</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
                  <option key={l} value={l}>
                    Niveau {l}
                  </option>
                ))}
              </select>
              <LazyInput
                className="input sm"
                value={spell.notes || ''}
                onCommit={(notes) => updateSpell(index, { notes })}
                disabled={!editable}
                placeholder="Dégâts, portée, durée…"
              />
              {spell.notes && /\d+d\d+/.test(spell.notes) ? (
                <button
                  type="button"
                  className="btn xs"
                  onClick={() => doRoll(spell.notes.match(/\d+d\d+([+-]\d+)?/)[0], spell.name)}
                >
                  Lancer
                </button>
              ) : null}
              {editable ? (
                <button
                  type="button"
                  className="btn xs ghost"
                  onClick={() => setSc({ known: known.filter((_, i) => i !== index) })}
                >
                  ✕
                </button>
              ) : null}
            </li>
          ))}
          {!known.length ? <li className="empty">Aucun sort.</li> : null}
        </ul>
      </section>
    </div>
  );
}

function GearTab({ character, editable, save }) {
  const inventory = character.inventory || [];
  const currency = character.currency || {};
  const update = (index, patch) =>
    save({ inventory: inventory.map((item, i) => (i === index ? { ...item, ...patch } : item)) });

  const totalWeight = inventory.reduce((sum, item) => sum + (Number(item.weight) || 0) * (Number(item.qty) || 1), 0);

  return (
    <div className="col" style={{ gap: 12 }}>
      <section className="card pad">
        <h4 className="panel-title">Bourse<InfoTip help={"La monnaie transportee. En D&D 5e, 1 piece d'or vaut 10 pieces d'argent et 100 pieces de cuivre."} example={"35 po, 12 pa, 40 pc"} /></h4>
        <div className="currency-row">
          {[
            ['pp', 'Platine'],
            ['gp', 'Or'],
            ['ep', 'Électrum'],
            ['sp', 'Argent'],
            ['cp', 'Cuivre'],
          ].map(([key, label]) => (
            <label key={key} className="currency-box">
              <span>{label}</span>
              <LazyInput
                className="input center"
                type="number"
                value={currency[key] ?? 0}
                onCommit={(v) => save({ currency: { ...currency, [key]: Math.max(0, Number(v) || 0) } })}
                disabled={!editable}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="card pad">
        <div className="row">
          <h4 className="panel-title">Inventaire<InfoTip help={"Ce que le personnage transporte. La colonne du poids sert si vous jouez avec la charge maximale."} example={"Corde de chanvre (15 m) — 1 unite, 5 kg"} /></h4>
          <span className="spacer" />
          <span className="faint">{totalWeight.toFixed(1)} kg</span>
          {editable ? (
            <button
              type="button"
              className="btn xs primary"
              onClick={() => save({ inventory: [...inventory, { id: uid(), name: '', qty: 1, weight: 0, equipped: false, notes: '' }] })}
            >
              + Objet
            </button>
          ) : null}
        </div>
        <table className="sheet-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>Eq.</th>
              <th>Objet</th>
              <th style={{ width: 60 }}>Qté</th>
              <th style={{ width: 70 }}>Poids</th>
              <th>Notes</th>
              <th style={{ width: 34 }} />
            </tr>
          </thead>
          <tbody>
            {inventory.map((item, index) => (
              <tr key={item.id || index}>
                <td>
                  <input
                    type="checkbox"
                    checked={Boolean(item.equipped)}
                    onChange={(e) => update(index, { equipped: e.target.checked })}
                    disabled={!editable}
                  />
                </td>
                <td>
                  <LazyInput className="input sm" value={item.name} onCommit={(name) => update(index, { name })} disabled={!editable} />
                </td>
                <td>
                  <LazyInput
                    className="input sm center"
                    type="number"
                    value={item.qty ?? 1}
                    onCommit={(v) => update(index, { qty: Math.max(0, Number(v) || 0) })}
                    disabled={!editable}
                  />
                </td>
                <td>
                  <LazyInput
                    className="input sm center"
                    type="number"
                    value={item.weight ?? 0}
                    onCommit={(v) => update(index, { weight: Math.max(0, Number(v) || 0) })}
                    disabled={!editable}
                  />
                </td>
                <td>
                  <LazyInput className="input sm" value={item.notes || ''} onCommit={(notes) => update(index, { notes })} disabled={!editable} />
                </td>
                <td>
                  {editable ? (
                    <button
                      type="button"
                      className="btn xs ghost"
                      onClick={() => save({ inventory: inventory.filter((_, i) => i !== index) })}
                    >
                      ✕
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!inventory.length ? (
              <tr>
                <td colSpan={6} className="empty">
                  Sac vide.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/**
 * Notes privées attachées au personnage.
 *
 * Chacun ne voit que les siennes : le joueur ce qu'il garde pour lui, le MJ son
 * mémo sur le personnage. C'est l'API qui le garantit — les notes ne font pas
 * partie de la fiche diffusée à la table.
 */
function NotesTab({ characterId, isOwner }) {
  const toast = useToast();
  const [note, setNote] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setNote(null);
    api
      .get(`/characters/${characterId}/notes`)
      .then(({ note: loaded }) => {
        if (!cancelled) setNote(loaded.body);
      })
      .catch((err) => {
        if (!cancelled) toast(err.message, 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  if (note === null) return <Spinner label="Chargement des notes…" />;

  return (
    <div className="sheet-grid">
      <section className="card pad">
        <h4 className="notes-title">
          {isOwner ? 'Mes notes' : 'Mémo du Maître du Jeu'}
          <InfoTip
            help={
              isOwner
                ? "Ces notes n'appartiennent qu'à vous : ni le Maître du Jeu ni les autres joueurs ne peuvent les lire."
                : "Ce mémo n'appartient qu'à vous : le joueur ne peut pas le lire, et vous n'avez pas accès aux notes qu'il tient sur son personnage."
            }
            example={
              isOwner
                ? "Ne pas faire confiance à l'aubergiste, il a menti sur la crypte"
                : 'A reconnu le symbole sur la porte — lui faire jouer le doute à la prochaine séance'
            }
          />
        </h4>
        <LazyInput
          as="textarea"
          className="textarea"
          rows={16}
          value={note}
          onCommit={(v) => {
            setNote(v);
            api.put(`/characters/${characterId}/notes`, { body: v }).catch((err) => toast(err.message, 'error'));
          }}
          placeholder={
            isOwner
              ? 'Ce que votre personnage a appris, soupçonne, ou veut garder secret…'
              : 'Ce que vous voulez retenir sur ce personnage, d’une séance à l’autre…'
          }
        />
      </section>
    </div>
  );
}

function StoryTab({ character, editable, save }) {
  const details = character.details || {};
  const setDetail = (key, value) => save({ details: { ...details, [key]: value } });

  const fields = [
    [
      'personality',
      'Traits de personnalité',
      "Deux ou trois manies qui rendent le personnage reconnaissable a table. Elles se jouent, elles ne se calculent pas.",
      "Je cite des proverbes nains a tout propos, meme quand personne n'ecoute",
    ],
    [
      'ideals',
      'Idéaux',
      "Ce a quoi le personnage croit et qui guide ses choix quand la situation se complique.",
      "La liberte. Personne ne devrait dicter a un autre ce qu'il doit devenir",
    ],
    [
      'bonds',
      'Liens',
      "Ce qui l'attache au monde : une personne, un lieu, un objet. C'est la ou le Maitre du Jeu viendra le chercher.",
      "Ma soeur est restee a Valmorne. Je ne partirai pas sans elle",
    ],
    [
      'flaws',
      'Défauts',
      "La faiblesse qui le met en difficulte. Un bon defaut cree des ennuis, il n'en evite pas.",
      "Je ne resiste jamais a un pari, meme quand je sais que je vais perdre",
    ],
    [
      'languages',
      'Langues',
      "Les langues comprises et parlees, venant de la race, de l'historique ou de la classe.",
      "Commun, nain, elfique",
    ],
    [
      'tools',
      'Outils et maîtrises',
      "Outils, instruments, armures et armes que le personnage sait utiliser avec son bonus de maitrise.",
      "Outils de voleur, luth, armures legeres",
    ],
  ];

  return (
    <div className="col" style={{ gap: 12 }}>
      <section className="card pad grid-2">
        {fields.map(([key, label, help, example]) => (
          <div className="field" key={key}>
            <label>
              <FieldLabel help={help} example={example}>
                {label}
              </FieldLabel>
            </label>
            <LazyInput
              as="textarea"
              className="textarea"
              rows={2}
              value={details[key] || ''}
              onCommit={(v) => setDetail(key, v)}
              disabled={!editable}
            />
          </div>
        ))}
      </section>
      <section className="card pad">
        <div className="field">
          <label><FieldLabel help={"D'ou vient-il, ce qu'il cherche, ce qu'il a laisse derriere lui. C'est la matiere que le Maitre du Jeu utilisera pour vous ecrire des scenes."} example={"Ancien garde de Valmorne, parti le soir ou la comete est tombee"}>Histoire du personnage</FieldLabel></label>
          <LazyInput
            as="textarea"
            className="textarea"
            rows={10}
            value={details.backstory || ''}
            onCommit={(v) => setDetail('backstory', v)}
            disabled={!editable}
            placeholder="D'où vient-il ? Que cherche-t-il ? Qui a-t-il laisse derrière lui ?"
          />
        </div>
      </section>
      <section className="card pad grid-2">
        <div className="field">
          <label><FieldLabel help={"Les gens et les groupes sur lesquels le personnage peut compter, ou auxquels il doit quelque chose."} example={"Guilde des marchands de Sourbier — ils me doivent une faveur"}>Alliés et organisations</FieldLabel></label>
          <LazyInput
            as="textarea"
            className="textarea"
            rows={3}
            value={details.alliesOrganizations || ''}
            onCommit={(v) => setDetail('alliesOrganizations', v)}
            disabled={!editable}
            placeholder="Nom, symbole, relation…"
          />
        </div>
        <div className="field">
          <label><FieldLabel help={"Les biens de valeur qui ne tiennent pas dans l'inventaire : proprietes, titres, objets remarquables."} example={"Un anneau de famille grave aux armes des Chantevent"}>Trésor</FieldLabel></label>
          <LazyInput
            as="textarea"
            className="textarea"
            rows={3}
            value={details.treasure || ''}
            onCommit={(v) => setDetail('treasure', v)}
            disabled={!editable}
          />
        </div>
      </section>
      <section className="card pad">
        <div className="field">
          <label><FieldLabel help={"Tout ce que les autres onglets ne couvrent pas : dons, traits raciaux, capacites de classe."} example={"Vision dans le noir 18 m — Chanceux : je relance un 1 trois fois par jour"}>Capacités et traits supplémentaires</FieldLabel></label>
          <LazyInput
            as="textarea"
            className="textarea"
            rows={4}
            value={details.extraFeatures || ''}
            onCommit={(v) => setDetail('extraFeatures', v)}
            disabled={!editable}
          />
        </div>
      </section>
    </div>
  );
}

function LookTab({ character, editable, save }) {
  const [picking, setPicking] = useState(null);
  const details = character.details || {};
  const setDetail = (key, value) => save({ details: { ...details, [key]: value } });
  return (
    <div className="col" style={{ gap: 12 }}>
      <section className="card pad">
        <h4 className="panel-title">Apparence physique<InfoTip help={"La description du personnage, pour que les autres joueurs puissent se le representer."} example={"Petite, nerveuse, manteau rapiece"} /></h4>
        <div className="grid-3">
          {[
            ['age', 'Âge', "L'age du personnage. Les races longevives vieillissent autrement : un elfe de 120 ans est un jeune adulte.", '27 ans'],
            ['height', 'Taille', 'Sa taille, utile pour se representer la scene et pour les descriptions.', '1,62 m'],
            ['weight', 'Poids', 'Son poids. Il compte rarement, sauf pour une chute, une monture ou un pont fragile.', '58 kg'],
            ['eyes', 'Yeux', 'La couleur des yeux, un detail que les autres personnages remarquent en premier.', 'Vert pale'],
            ['skin', 'Peau', 'Le teint, les cicatrices, les marques particulieres.', 'Halee, une cicatrice sur la joue gauche'],
            ['hair', 'Cheveux', 'La coiffure et la couleur, souvent ce qui distingue un personnage de loin.', 'Noirs, tresses serrees'],
          ].map(([key, label, help, example]) => (
            <div className="field" key={key}>
              <label>
                <FieldLabel help={help} example={example}>
                  {label}
                </FieldLabel>
              </label>
              <LazyInput
                className="input"
                value={details[key] || ''}
                onCommit={(v) => setDetail(key, v)}
                disabled={!editable}
              />
            </div>
          ))}
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label><FieldLabel help={"La silhouette generale, la tenue, l'allure. De quoi permettre aux autres joueurs de se le representer."} example={"Petite et nerveuse, manteau de voyage rapiece, ne tient jamais en place"}>Apparence du personnage</FieldLabel></label>
          <LazyInput
            as="textarea"
            className="textarea"
            rows={3}
            value={details.appearance || ''}
            onCommit={(v) => setDetail('appearance', v)}
            disabled={!editable}
          />
        </div>
      </section>
      <TokenStyler
        style={character.style || {}}
        portraitUrl={character.portraitUrl}
        tokenUrl={character.tokenUrl}
        name={character.name}
        editable={editable}
        onChange={(style) => save({ style })}
        onPickPortrait={() => setPicking('portrait')}
        onPickToken={() => setPicking('token')}
        onClearPortrait={() => save({ portraitUrl: null })}
        onClearToken={() => save({ tokenUrl: null })}
      />
      <Modal
        open={Boolean(picking)}
        title={picking === 'portrait' ? 'Choisir un portrait' : 'Choisir un pion'}
        onClose={() => setPicking(null)}
        size="lg"
      >
        <AssetLibrary
          filterKind={picking === 'portrait' ? 'PORTRAIT' : 'TOKEN'}
          uploadKind={picking === 'portrait' ? 'PORTRAIT' : 'TOKEN'}
          onPick={(asset) => {
            save(picking === 'portrait' ? { portraitUrl: asset.url } : { tokenUrl: asset.url });
            setPicking(null);
          }}
        />
      </Modal>
    </div>
  );
}
