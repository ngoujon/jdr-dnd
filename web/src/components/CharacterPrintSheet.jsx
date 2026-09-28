import { createPortal } from 'react-dom';
import { ABILITIES, SKILLS, modifier, signed } from '../lib/dnd.js';

/**
 * Rendu caché à l'écran, affiché uniquement par `@media print` (voir app.css).
 * Permet d'exporter la fiche via le dialogue d'impression du navigateur
 * ("Enregistrer en PDF"), sans dépendance supplémentaire.
 */
export function CharacterPrintSheet({ character, derived, prof, profs }) {
  if (!character) return null;
  const abilities = character.abilities || {};
  const details = character.details || {};
  const currency = character.currency || {};
  const attacks = character.attacks || [];
  const features = character.features || [];
  const inventory = character.inventory || [];
  const deathSaves = character.deathSaves || { successes: 0, failures: 0 };
  const sc = character.spellcasting || { ability: 'int', slots: {}, known: [] };
  const known = sc.known || [];
  const isCaster = Boolean(sc.ability) && (known.length > 0 || Object.values(sc.slots || {}).some((s) => s?.max));

  return createPortal(
    <div className="print-sheet">
      <section className="ps-page">
        <h1 className="ps-title">{character.name || 'Personnage sans nom'}</h1>
        <div className="ps-row">
          <Field label="Classe & niveau" value={`${character.class || '—'} ${character.level || 1}`} />
          <Field label="Historique" value={character.background} />
          <Field label="Nom du joueur" value={details.playerName} />
          <Field label="Race" value={character.race} />
          <Field label="Alignement" value={character.alignment} />
          <Field label="Points d'expérience" value={character.xp} />
        </div>

        <div className="ps-grid-6" style={{ marginBottom: '4mm' }}>
          {ABILITIES.map((a) => {
            const score = abilities[a.key] ?? 10;
            const mod = derived?.mods?.[a.key] ?? modifier(score);
            return (
              <div className="ps-ability" key={a.key}>
                <div className="name">{a.label}</div>
                <div className="score">{score}</div>
                <div className="mod">{signed(mod)}</div>
              </div>
            );
          })}
        </div>

        <div className="ps-row">
          <div className="ps-field">
            <span className="ps-label">Inspiration</span>
            <span className="ps-value">{character.inspiration ? 'Oui' : '—'}</span>
          </div>
          <div className="ps-field">
            <span className="ps-label">Bonus de maîtrise</span>
            <span className="ps-value">{signed(prof ?? 2)}</span>
          </div>
          <div className="ps-field">
            <span className="ps-label">CA</span>
            <span className="ps-value">{character.ac}</span>
          </div>
          <div className="ps-field">
            <span className="ps-label">Initiative</span>
            <span className="ps-value">{signed(derived?.initiative ?? 0)}</span>
          </div>
          <div className="ps-field">
            <span className="ps-label">Vitesse</span>
            <span className="ps-value">{character.speed}</span>
          </div>
        </div>

        <div className="ps-row">
          <div className="ps-field">
            <span className="ps-label">Points de vie max</span>
            <span className="ps-value">{character.maxHp}</span>
          </div>
          <div className="ps-field">
            <span className="ps-label">Points de vie actuels</span>
            <span className="ps-value">{character.hp}</span>
          </div>
          <div className="ps-field">
            <span className="ps-label">Points de vie temporaires</span>
            <span className="ps-value">{character.tempHp || 0}</span>
          </div>
          <div className="ps-field">
            <span className="ps-label">Dés de vie</span>
            <span className="ps-value">{character.hitDice} (restants : {character.hitDiceLeft})</span>
          </div>
          <div className="ps-field">
            <span className="ps-label">Jets de sauvegarde contre la mort</span>
            <span className="ps-value">
              Succès {'●'.repeat(deathSaves.successes || 0)}{'○'.repeat(3 - (deathSaves.successes || 0))}
              {'   '}Échecs {'●'.repeat(deathSaves.failures || 0)}{'○'.repeat(3 - (deathSaves.failures || 0))}
            </span>
          </div>
        </div>

        <div className="ps-row">
          <div className="ps-field" style={{ flex: '0 0 48%' }}>
            <div className="ps-section">
              <h4>Jets de sauvegarde</h4>
              <ul className="ps-list">
                {ABILITIES.map((a) => (
                  <li key={a.key}>
                    <span className={`ps-dot ${profs?.saves?.[a.key] ? 'on' : ''}`} />
                    <span style={{ flex: 1 }}>{a.label}</span>
                    <span>{signed(derived?.saves?.[a.key] ?? modifier(abilities[a.key] ?? 10))}</span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: '3mm' }}>
                <span className="ps-label">Sagesse (Perception) passive</span>
                <span className="ps-value">{derived?.passivePerception ?? 10}</span>
              </div>
            </div>
            <div className="ps-section">
              <h4>Autres maîtrises et langues</h4>
              <div className="ps-textblock">{[details.tools, details.languages].filter(Boolean).join('\n') || '—'}</div>
            </div>
          </div>

          <div className="ps-field" style={{ flex: '0 0 48%' }}>
            <div className="ps-section">
              <h4>Compétences</h4>
              <ul className="ps-list">
                {SKILLS.map((skill) => (
                  <li key={skill.key}>
                    <span className={`ps-dot ${profs?.skills?.[skill.key] ? 'on' : ''}`} />
                    <span style={{ flex: 1 }}>{skill.label} ({ABILITIES.find((a) => a.key === skill.ability)?.short})</span>
                    <span>{signed(derived?.skills?.[skill.key] ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="ps-section">
          <h4>Attaques et sorts</h4>
          <table className="ps-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Bonus att.</th>
                <th>Dégâts / type</th>
              </tr>
            </thead>
            <tbody>
              {attacks.length ? attacks.map((a, i) => (
                <tr key={a.id || i}>
                  <td>{a.name}</td>
                  <td>{signed(a.bonus ?? 0)}</td>
                  <td>{a.damage} {a.type ? `(${a.type})` : ''}</td>
                </tr>
              )) : (
                <tr><td colSpan={3}>—</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="ps-row">
          <div className="ps-field ps-section">
            <h4>Traits de personnalité</h4>
            <div className="ps-textblock">{details.personality || '—'}</div>
          </div>
          <div className="ps-field ps-section">
            <h4>Idéaux</h4>
            <div className="ps-textblock">{details.ideals || '—'}</div>
          </div>
        </div>
        <div className="ps-row">
          <div className="ps-field ps-section">
            <h4>Liens</h4>
            <div className="ps-textblock">{details.bonds || '—'}</div>
          </div>
          <div className="ps-field ps-section">
            <h4>Défauts</h4>
            <div className="ps-textblock">{details.flaws || '—'}</div>
          </div>
        </div>

        <div className="ps-section">
          <h4>Équipement</h4>
          <div className="ps-textblock">
            {inventory.length
              ? inventory.map((i) => `${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}`).join(', ')
              : '—'}
            {'\n'}
            Bourse — PP {currency.pp || 0} · PO {currency.gp || 0} · PE {currency.ep || 0} · PA {currency.sp || 0} · PC {currency.cp || 0}
          </div>
        </div>

        <div className="ps-section">
          <h4>Capacités et traits</h4>
          <div className="ps-textblock">
            {features.length ? features.map((f) => `${f.name}${f.source ? ` (${f.source})` : ''} — ${f.description || ''}`).join('\n') : '—'}
          </div>
        </div>
      </section>

      <section className="ps-page">
        <h1 className="ps-title">{character.name}</h1>
        <div className="ps-row">
          <Field label="Âge" value={details.age} />
          <Field label="Taille" value={details.height} />
          <Field label="Poids" value={details.weight} />
          <Field label="Yeux" value={details.eyes} />
          <Field label="Peau" value={details.skin} />
          <Field label="Cheveux" value={details.hair} />
        </div>
        <div className="ps-section">
          <h4>Apparence du personnage</h4>
          <div className="ps-textblock">{details.appearance || '—'}</div>
        </div>
        <div className="ps-section">
          <h4>Histoire du personnage</h4>
          <div className="ps-textblock">{details.backstory || '—'}</div>
        </div>
        <div className="ps-section">
          <h4>Alliés et organisations</h4>
          <div className="ps-textblock">{details.alliesOrganizations || '—'}</div>
        </div>
        <div className="ps-section">
          <h4>Capacités et traits supplémentaires</h4>
          <div className="ps-textblock">{details.extraFeatures || '—'}</div>
        </div>
        <div className="ps-section">
          <h4>Trésor</h4>
          <div className="ps-textblock">{details.treasure || '—'}</div>
        </div>
      </section>

      {isCaster ? (
        <section className="ps-page">
          <h1 className="ps-title">Sorts — {character.name}</h1>
          <div className="ps-row">
            <Field label="Classe de lanceur de sorts" value={character.class} />
            <Field label="Caractéristique" value={ABILITIES.find((a) => a.key === sc.ability)?.label} />
            <Field label="Sorts à préparer chaque jour" value={sc.prepared} />
            <Field label="DD de sauvegarde des sorts" value={derived?.spellSaveDc} />
            <Field label="Bonus d'attaque avec un sort" value={signed(derived?.spellAttack ?? 0)} />
          </div>

          <div className="ps-section">
            <h4>Emplacements de sorts</h4>
            <table className="ps-table">
              <thead>
                <tr>
                  <th>Niveau</th>
                  <th>Emplacements</th>
                  <th>Utilisés</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => {
                  const slot = sc.slots?.[level];
                  if (!slot?.max) return null;
                  return (
                    <tr key={level}>
                      <td>{level}</td>
                      <td>{slot.max}</td>
                      <td>{slot.used || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => {
            const spells = known.filter((s) => (s.level ?? 0) === level);
            if (!spells.length) return null;
            return (
              <div className="ps-section" key={level}>
                <h4>{level === 0 ? 'Sorts mineurs' : `Sorts de niveau ${level}`}</h4>
                <ul className="ps-list">
                  {spells.map((s, i) => (
                    <li key={s.id || i}>
                      <span className={`ps-dot ${s.prepared ? 'on' : ''}`} />
                      <span style={{ flex: 1 }}>{s.name}</span>
                      <span>{s.notes}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      ) : null}
    </div>,
    document.body,
  );
}

function Field({ label, value }) {
  return (
    <div className="ps-field">
      <span className="ps-label">{label}</span>
      <span className="ps-value">{value || value === 0 ? value : '—'}</span>
    </div>
  );
}
