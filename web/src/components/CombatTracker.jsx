import { useState } from 'react';
import { useTable } from '../lib/store.js';
import { useToast } from './Ui.jsx';
import { HpBar } from './PartyPanel.jsx';
import { signed } from '../lib/dnd.js';

const uid = () => Math.random().toString(36).slice(2, 10);

/** Ordre d'initiative : ajout depuis les pions, tri, tour par tour, degats rapides. */
export function CombatTracker() {
  const combat = useTable((s) => s.combat);
  const tokens = useTable((s) => s.tokens);
  const characters = useTable((s) => s.characters);
  const isGM = useTable((s) => s.isGM);
  const saveCombat = useTable((s) => s.saveCombat);
  const nextTurn = useTable((s) => s.nextTurn);
  const roll = useTable((s) => s.roll);
  const patchToken = useTable((s) => s.patchToken);
  const toast = useToast();
  const [manualName, setManualName] = useState('');
  // Glisser-deposer : participant saisi et emplacement vise (avant / apres une ligne).
  const [dragId, setDragId] = useState(null);
  const [dropAt, setDropAt] = useState(null);
  const [editing, setEditing] = useState(null);

  const entries = combat?.entries || [];
  const sorted = entries;

  const update = (patch) => saveCombat(patch).catch((e) => toast(e.message, 'error'));

  const setEntries = (list) => update({ entries: list });

  /**
   * Place des nouveaux venus selon leur initiative sans retrier les autres :
   * l'ordre réglé à la main par le MJ reste tel quel.
   */
  const insertByInitiative = (list, additions) => {
    const result = [...list];
    for (const entry of [...additions].sort((a, b) => b.initiative - a.initiative)) {
      const at = result.findIndex((e) => e.initiative < entry.initiative);
      result.splice(at === -1 ? result.length : at, 0, entry);
    }
    return result;
  };

  /** Le tour en cours reste sur le même combattant quand la liste change. */
  const keepTurn = (list) => {
    const currentId = entries[combat?.turnIndex ?? 0]?.id;
    const index = list.findIndex((e) => e.id === currentId);
    return index === -1 ? {} : { turnIndex: index };
  };

  const addFromTokens = () => {
    const existing = new Set(entries.map((e) => e.tokenId).filter(Boolean));
    const additions = tokens
      .filter((t) => t.layer === 'TOKEN' && !existing.has(t.id))
      .map((token) => {
        const character = characters.find((c) => c.id === token.characterId);
        const bonus = character?.derived?.initiative ?? 0;
        return {
          id: uid(),
          name: token.name || character?.name || 'Créature',
          initiative: Math.floor(Math.random() * 20) + 1 + bonus,
          tokenId: token.id,
          characterId: token.characterId || null,
          hp: token.hp ?? character?.hp ?? null,
          maxHp: token.maxHp ?? character?.maxHp ?? null,
          ac: token.ac ?? character?.ac ?? null,
          isNpc: !character || character.isNpc,
          visible: token.visible !== false,
          conditions: token.conditions || [],
        };
      });
    if (!additions.length) return toast('Tous les pions sont déjà dans l’ordre du combat', 'info');
    const list = insertByInitiative(entries, additions);
    update({ entries: list, ...keepTurn(list) });
  };

  const addManual = () => {
    if (!manualName.trim()) return;
    const list = insertByInitiative(entries, [
      {
        id: uid(),
        name: manualName.trim(),
        initiative: Math.floor(Math.random() * 20) + 1,
        isNpc: true,
        visible: true,
        conditions: [],
      },
    ]);
    update({ entries: list, ...keepTurn(list) });
    setManualName('');
  };

  /**
   * Deplace un participant a la main. Le tour en cours reste sur le meme
   * combattant : seul son rang change, pas la personne qui joue.
   */
  const moveEntry = (id, targetIndex) => {
    const from = entries.findIndex((e) => e.id === id);
    if (from === -1) return;
    const list = [...entries];
    const [moved] = list.splice(from, 1);
    const to = targetIndex > from ? targetIndex - 1 : targetIndex;
    if (to === from) return;
    list.splice(to, 0, moved);
    const currentId = entries[combat?.turnIndex ?? 0]?.id;
    const turnIndex = Math.max(0, list.findIndex((e) => e.id === currentId));
    update({ entries: list, turnIndex });
  };

  const endDrag = () => {
    setDragId(null);
    setDropAt(null);
  };

  const patchEntry = (id, patch) =>
    setEntries(entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));

  /** Repercute les PV modifies depuis le tracker sur le pion lie, pour que la carte reste a jour. */
  const applyEntryHp = (entry, hp) => {
    patchEntry(entry.id, { hp });
    if (entry.tokenId) patchToken(entry.tokenId, { hp }).catch(() => {});
  };

  const rollInitiative = async () => {
    const rolled = await Promise.all(
      entries.map(async (entry) => {
        const character = characters.find((c) => c.id === entry.characterId);
        const bonus = character?.derived?.initiative ?? 0;
        const res = await roll({
          formula: `1d20${bonus >= 0 ? '+' : ''}${bonus}`,
          label: `Initiative — ${entry.name}`,
          secret: entry.isNpc,
        });
        return { ...entry, initiative: res?.roll?.total ?? entry.initiative };
      }),
    );
    setEntries(rolled.sort((a, b) => b.initiative - a.initiative));
  };

  if (!isGM) {
    return (
      <div className="combat-panel scroll">
        {combat?.isActive ? (
          <>
            <div className="combat-head">
              <span className="panel-title">Round {combat.round}</span>
            </div>
            <ol className="initiative-list">
              {sorted.map((entry, index) => (
                <li key={entry.id} className={index === combat.turnIndex ? 'current' : ''}>
                  <span className="init-score">{entry.initiative}</span>
                  <span className="col" style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <strong className="ellipsis">{entry.name}</strong>
                    {entry.maxHp && !entry.isNpc ? <HpBar hp={entry.hp} maxHp={entry.maxHp} /> : null}
                  </span>
                  {entry.ac ? <span className="faint">CA {entry.ac}</span> : null}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="empty">Aucun combat en cours.</div>
        )}
      </div>
    );
  }

  return (
    <div className="combat-panel scroll">
      <div className="combat-head">
        <span className="panel-title">
          {combat?.isActive ? `Round ${combat.round}` : 'Combat'}
        </span>
        <div className="row" style={{ gap: 4 }}>
          <button type="button" className="btn xs" onClick={() => nextTurn('previous')} disabled={!entries.length}>
            ◀
          </button>
          <button type="button" className="btn xs primary" onClick={() => nextTurn('next')} disabled={!entries.length}>
            Tour suivant ▶
          </button>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 6, padding: '0 10px 8px' }}>
        <button type="button" className="btn xs" onClick={addFromTokens}>
          + Pions de la scène
        </button>
        <button type="button" className="btn xs" onClick={rollInitiative} disabled={!entries.length}>
          Relancer l'initiative
        </button>
        <button
          type="button"
          className={`btn xs ${combat?.isActive ? 'active' : ''}`}
          onClick={() => update({ isActive: !combat?.isActive, round: 1, turnIndex: 0 })}
        >
          {combat?.isActive ? 'Terminer' : 'Démarrer'}
        </button>
        <button
          type="button"
          className="btn xs danger"
          onClick={() => update({ entries: [], isActive: false, round: 1, turnIndex: 0 })}
          disabled={!entries.length}
        >
          Vider
        </button>
      </div>

      <ol className="initiative-list gm">
        {sorted.map((entry, index) => (
          <li
            key={entry.id}
            className={[
              index === combat?.turnIndex ? 'current' : '',
              dragId === entry.id ? 'dragging' : '',
              dropAt === index ? 'drop-before' : '',
              dropAt === index + 1 && index === sorted.length - 1 ? 'drop-after' : '',
            ].join(' ')}
            draggable
            onDragStart={(e) => {
              // Les champs et boutons de la ligne restent utilisables normalement.
              if (['INPUT', 'BUTTON'].includes(e.target.tagName)) return;
              e.dataTransfer.setData('text/plain', entry.id);
              e.dataTransfer.effectAllowed = 'move';
              setDragId(entry.id);
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              const box = e.currentTarget.getBoundingClientRect();
              setDropAt(e.clientY < box.top + box.height / 2 ? index : index + 1);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId && dropAt != null) moveEntry(dragId, dropAt);
              endDrag();
            }}
            onDragEnd={endDrag}
          >
            <span className="drag-handle" aria-hidden="true" title="Glisser pour changer l'ordre">
              ⠿
            </span>
            <input
              className="input sm init-input"
              type="number"
              // Saisie locale : rien ne part au serveur avant la fin de la frappe.
              value={editing?.id === entry.id ? editing.value : entry.initiative}
              onChange={(e) => setEditing({ id: entry.id, value: e.target.value })}
              onDragStart={(e) => e.preventDefault()}
              onFocus={() => setEditing({ id: entry.id, value: String(entry.initiative) })}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              // Un score modifié replace ce seul participant ; les autres gardent l'ordre fait à la main.
              onBlur={() => {
                const value = Number(editing?.value);
                setEditing(null);
                if (editing?.id !== entry.id || !Number.isFinite(value) || value === entry.initiative) return;
                const others = entries.filter((e) => e.id !== entry.id);
                const list = insertByInitiative(others, [{ ...entry, initiative: value }]);
                update({ entries: list, ...keepTurn(list) });
              }}
              aria-label={`Initiative de ${entry.name}`}
            />
            <span className="col" style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <span className="row" style={{ gap: 5 }}>
                <strong className="ellipsis">{entry.name}</strong>
                {entry.isNpc ? <span className="tag npc">PNJ</span> : null}
              </span>
              {entry.maxHp ? <HpBar hp={entry.hp} maxHp={entry.maxHp} /> : null}
            </span>
            <span className="row init-actions">
              {entry.maxHp ? (
                <>
                  <button
                    type="button"
                    className="btn xs"
                    title="−1 PV"
                    onClick={() => applyEntryHp(entry, Math.max(0, (entry.hp ?? 0) - 1))}
                  >
                    −1
                  </button>
                  <button
                    type="button"
                    className="btn xs"
                    title="+1 PV"
                    onClick={() => applyEntryHp(entry, Math.min(entry.maxHp, (entry.hp ?? 0) + 1))}
                  >
                    +1
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="btn xs ghost"
                title="Retirer"
                onClick={() => setEntries(entries.filter((e) => e.id !== entry.id))}
              >
                ✕
              </button>
            </span>
          </li>
        ))}
      </ol>

      <div className="row" style={{ padding: '8px 10px', gap: 6 }}>
        <input
          className="input sm"
          placeholder="Ajouter un combattant…"
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addManual()}
        />
        <button type="button" className="btn sm" onClick={addManual}>
          +
        </button>
      </div>
    </div>
  );
}
