import { useMemo, useState } from 'react';
import { Modal } from './Ui.jsx';
import { SPELLS, searchSpells, spellLevelLabel } from '../lib/spells.js';

/**
 * Choix d'un sort dans le catalogue.
 *
 * La liste complete est trop longue pour se parcourir : on cherche par nom, et
 * le detail du sort selectionne s'affiche a cote plutot qu'en infobulle, parce
 * qu'on compare souvent deux sorts avant de trancher.
 */
export function SpellPicker({ open, onClose, onPick, className }) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState(null);
  const [onlyMyClass, setOnlyMyClass] = useState(Boolean(className));
  const [selected, setSelected] = useState(null);

  const results = useMemo(
    () =>
      searchSpells(query, {
        level,
        className: onlyMyClass ? className : null,
      }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'fr')),
    [query, level, onlyMyClass, className],
  );

  const close = () => {
    setQuery('');
    setSelected(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      title="Ajouter un sort"
      onClose={close}
      size="lg"
      footer={
        <>
          <button type="button" className="btn ghost" onClick={close}>
            Annuler
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!selected}
            onClick={() => {
              onPick(selected);
              close();
            }}
          >
            Ajouter {selected ? `« ${selected.name} »` : ''}
          </button>
        </>
      }
    >
      <div className="spell-picker">
        <div className="spell-picker-search">
          <input
            className="input"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher un sort par son nom…"
            aria-label="Chercher un sort par son nom"
          />

          <div className="row spell-filters">
            <select
              className="select sm"
              value={level ?? ''}
              onChange={(e) => setLevel(e.target.value === '' ? null : Number(e.target.value))}
              aria-label="Filtrer par niveau"
            >
              <option value="">Tous les niveaux</option>
              {[0, 1, 2, 3].map((l) => (
                <option key={l} value={l}>
                  {spellLevelLabel(l)}
                </option>
              ))}
            </select>
            {className ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={onlyMyClass}
                  onChange={(e) => setOnlyMyClass(e.target.checked)}
                />
                {className} uniquement
              </label>
            ) : null}
          </div>

          <ul className="spell-results scroll">
            {results.map((spell) => (
              <li key={spell.name}>
                <button
                  type="button"
                  className={`spell-result ${selected?.name === spell.name ? 'active' : ''}`}
                  onClick={() => setSelected(spell)}
                  onDoubleClick={() => {
                    onPick(spell);
                    close();
                  }}
                >
                  <span className="ellipsis">{spell.name}</span>
                  <em>{spellLevelLabel(spell.level)}</em>
                </button>
              </li>
            ))}
            {!results.length ? (
              <li className="faint spell-empty">
                Aucun sort ne correspond. Le catalogue couvre les sortilèges et les niveaux 1 à 3.
              </li>
            ) : null}
          </ul>
        </div>

        <aside className="spell-detail scroll">
          {!selected ? (
            <p className="faint">
              Sélectionnez un sort dans la liste pour voir ce qu'il fait.
              <br />
              <br />
              {SPELLS.length} sorts disponibles, issus du SRD 5.1 (règles 2014).
            </p>
          ) : (
            <>
              <h4>{selected.name}</h4>
              <p className="spell-school">
                {spellLevelLabel(selected.level)} · {selected.school}
                {selected.ritual ? ' · rituel' : ''}
                {selected.conc ? ' · concentration' : ''}
              </p>

              <dl className="spell-meta">
                <dt>Incantation</dt>
                <dd>{selected.time}</dd>
                <dt>Portée</dt>
                <dd>{selected.range}</dd>
                <dt>Composantes</dt>
                <dd>{selected.components}</dd>
                <dt>Durée</dt>
                <dd>{selected.duration}</dd>
                <dt>Classes</dt>
                <dd>{selected.classes.join(', ')}</dd>
              </dl>

              <p className="spell-text">{selected.text}</p>
            </>
          )}
        </aside>
      </div>
    </Modal>
  );
}
