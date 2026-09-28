import { useEffect, useMemo, useState } from 'react';
import { useTable, useAuth } from '../lib/store.js';
import {
  ABILITIES, SKILLS, CLASSES, RACES, BACKGROUNDS, ALIGNMENTS, DAMAGE_TYPES,
  TEMPLATES, SPELL_ABILITY_BY_CLASS, modifier, proficiencyBonus, signed, levelFromXp,
} from '../lib/dnd.js';
import { Modal, Tabs, LazyInput, useToast, useConfirm } from './Ui.jsx';
import { AssetLibrary } from './AssetLibrary.jsx';
import { TokenStyler } from './TokenStyler.jsx';
import { CharacterPrintSheet } from './CharacterPrintSheet.jsx';

const TABS = [
  { key: 'main', label: 'Principal', icon: '✦' },
  { key: 'skills', label: 'Compétences', icon: '◈' },
  { key: 'combat', label: 'Combat', icon: '⚔' },
  { key: 'spells', label: 'Sorts', icon: '✧' },
  { key: 'gear', label: 'Équipement', icon: '⛁' },
  { key: 'story', label: 'Histoire', icon: '❦' },
  { key: 'look', label: 'Apparence', icon: '◍' },
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
    roll({ formula, label, advantage, characterName: character.name }).then((res) => {
      if (res?.error) toast(res.error, 'error');
    });

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
    const gridSize = scene.gridSize || 70;
    try {
      await createToken({
        name: character.name,
        imageUrl: character.tokenUrl || character.portraitUrl || null,
        style: character.style || {},
        characterId: character.id,
        x: Math.round(scene.width / 2 / gridSize) * gridSize,
        y: Math.round(scene.height / 2 / gridSize) * gridSize,
        width: gridSize,
        height: gridSize,
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
            <div className="vital-hp">
              <div className="hp-ring" style={{ '--ratio': hpRatio }}>
                <LazyInput
                  className="input center hp-current"
                  type="number"
                  value={character.hp}
                  onCommit={(v) => save({ hp: Number(v) || 0 })}
                  disabled={!editable}
                />
                <span className="hp-max">/ {character.maxHp}</span>
              </div>
              <div className="row" style={{ gap: 4, justifyContent: 'center' }}>
                <button type="button" className="btn xs danger" onClick={() => adjustHp(-hpDelta)} disabled={!editable}>
                  −
                </button>
                <input
                  className="input sm center"
                  style={{ width: 46 }}
                  type="number"
                  value={hpDelta}
                  onChange={(e) => setHpDelta(Math.max(1, Number(e.target.value) || 1))}
                />
                <button type="button" className="btn xs" onClick={() => adjustHp(hpDelta)} disabled={!editable}>
                  +
                </button>
              </div>
            </div>

            <div className="vital-box">
              <span className="label">CA</span>
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
              <span className="label">Init.</span>
              <strong className="big mono">{signed(derived.initiative ?? 0)}</strong>
            </button>
            <div className="vital-box">
              <span className="label">Vitesse</span>
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

        <Tabs tabs={TABS} value={tab} onChange={setTab} compact />

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
        <h4 className="panel-title">État</h4>
        <div className="grid-3">
          <div className="field">
            <label>PV max</label>
            <LazyInput
              className="input"
              type="number"
              value={character.maxHp}
              onCommit={(v) => save({ maxHp: Math.max(1, Number(v) || 1) })}
              disabled={!editable}
            />
          </div>
          <div className="field">
            <label>PV temporaires</label>
            <LazyInput
              className="input"
              type="number"
              value={character.tempHp}
              onCommit={(v) => save({ tempHp: Math.max(0, Number(v) || 0) })}
              disabled={!editable}
            />
          </div>
          <div className="field">
            <label>Dés de vie</label>
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
        <h4 className="panel-title">Identité</h4>
        <div className="grid-2">
          <div className="field">
            <label>Historique</label>
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
            <label>Alignement</label>
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
            <label>Sous-classe</label>
            <LazyInput
              className="input"
              value={character.subclass}
              onCommit={(subclass) => save({ subclass })}
              disabled={!editable}
            />
          </div>
          <div className="field">
            <label>Nom du joueur</label>
            <LazyInput
              className="input"
              value={details.playerName || ''}
              onCommit={(v) => setDetail('playerName', v)}
              disabled={!editable}
            />
          </div>
          <div className="field">
            <label>Expérience (niveau {levelFromXp(character.xp)})</label>
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
          <h4 className="panel-title">Attaques</h4>
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
        <h4 className="panel-title">Capacités &amp; traits</h4>
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
            <label>Caractéristique</label>
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
          <label>Sorts à préparer chaque jour</label>
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
        <h4 className="panel-title">Emplacements de sorts</h4>
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
          <h4 className="panel-title">Sorts connus</h4>
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
        <h4 className="panel-title">Bourse</h4>
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
          <h4 className="panel-title">Inventaire</h4>
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

function StoryTab({ character, editable, save }) {
  const details = character.details || {};
  const setDetail = (key, value) => save({ details: { ...details, [key]: value } });

  const fields = [
    ['personality', 'Traits de personnalité'],
    ["ideals", "Idéaux"],
    ['bonds', 'Liens'],
    ['flaws', 'Défauts'],
    ['languages', 'Langues'],
    ['tools', 'Outils et maîtrises'],
  ];

  return (
    <div className="col" style={{ gap: 12 }}>
      <section className="card pad grid-2">
        {fields.map(([key, label]) => (
          <div className="field" key={key}>
            <label>{label}</label>
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
          <label>Histoire du personnage</label>
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
          <label>Alliés et organisations</label>
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
          <label>Trésor</label>
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
          <label>Capacités et traits supplémentaires</label>
          <LazyInput
            as="textarea"
            className="textarea"
            rows={4}
            value={details.notes || ''}
            onCommit={(v) => setDetail('notes', v)}
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
        <h4 className="panel-title">Apparence physique</h4>
        <div className="grid-3">
          {[
            ['age', 'Âge'],
            ['height', 'Taille'],
            ['weight', 'Poids'],
            ['eyes', 'Yeux'],
            ['skin', 'Peau'],
            ['hair', 'Cheveux'],
          ].map(([key, label]) => (
            <div className="field" key={key}>
              <label>{label}</label>
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
          <label>Apparence du personnage</label>
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
