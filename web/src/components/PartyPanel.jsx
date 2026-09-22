import { useMemo } from 'react';
import { useTable, useAuth } from '../lib/store.js';
import { Avatar } from './Ui.jsx';
import { signed } from '../lib/dnd.js';

/** Barre de vie compacte reutilisee dans la liste du groupe et le combat. */
export function HpBar({ hp, maxHp, tempHp = 0 }) {
  if (!maxHp) return null;
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const color = ratio > 0.5 ? 'var(--success)' : ratio > 0.25 ? 'var(--warn)' : 'var(--danger)';
  return (
    <div className="hp-bar" title={`${hp} / ${maxHp} PV${tempHp ? ` (+${tempHp} temp.)` : ''}`}>
      <span style={{ width: `${ratio * 100}%`, background: color }} />
      {tempHp > 0 ? <span className="temp" style={{ width: `${Math.min(1, tempHp / maxHp) * 100}%` }} /> : null}
      <em>
        {hp}
        {tempHp > 0 ? `+${tempHp}` : ''} / {maxHp}
      </em>
    </div>
  );
}

export function PartyPanel({ onOpenCharacter, onWhisper }) {
  const characters = useTable((s) => s.characters);
  const online = useTable((s) => s.online);
  const campaign = useTable((s) => s.campaign);
  const isGM = useTable((s) => s.isGM);
  const me = useAuth((s) => s.user);

  const members = campaign?.members || [];
  const onlineIds = useMemo(() => new Set(online.map((u) => u.id)), [online]);

  return (
    <div className="party-panel scroll">
      <section>
        <h4 className="panel-title">À la table ({members.length})</h4>
        <ul className="member-list">
          {members.map((member) => {
            const owned = characters.filter((c) => c.ownerId === member.userId && !c.isNpc);
            return (
              <li key={member.userId}>
                <div className="member-head">
                  <Avatar
                    name={member.username}
                    url={member.avatarUrl}
                    size={30}
                    ring={onlineIds.has(member.userId) ? 'var(--success)' : 'transparent'}
                  />
                  <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                    <span className="row" style={{ gap: 6 }}>
                      <strong className="ellipsis">{member.username}</strong>
                      {member.userId === campaign.gmId ? <span className="tag gm">MJ</span> : null}
                      {member.userId === me?.id ? <span className="tag">vous</span> : null}
                    </span>
                    <span className="faint" style={{ fontSize: 11 }}>
                      {onlineIds.has(member.userId) ? 'en ligne' : 'hors ligne'}
                    </span>
                  </div>
                  {member.userId !== me?.id ? (
                    <button
                      type="button"
                      className="btn xs ghost"
                      title={`Message privé à ${member.username}`}
                      onClick={() => onWhisper?.(member)}
                    >
                      MP
                    </button>
                  ) : null}
                </div>
                {owned.map((character) => (
                  <button
                    key={character.id}
                    type="button"
                    className="party-char"
                    onClick={() => onOpenCharacter(character)}
                  >
                    <span
                      className="party-portrait"
                      style={{
                        background: character.portraitUrl
                          ? `center/cover url(${character.portraitUrl})`
                          : character.style?.accent || 'var(--ink-700)',
                      }}
                    />
                    <span className="col" style={{ gap: 3, flex: 1, minWidth: 0 }}>
                      <span className="row" style={{ gap: 6 }}>
                        <strong className="ellipsis">{character.name}</strong>
                        <span className="faint" style={{ fontSize: 11 }}>
                          niv. {character.level}
                        </span>
                      </span>
                      <HpBar hp={character.hp} maxHp={character.maxHp} tempHp={character.tempHp} />
                    </span>
                    <span className="party-stats">
                      <em title="Classe d'armure">CA {character.ac}</em>
                      <em title="Initiative">{signed(character.derived?.initiative ?? 0)}</em>
                    </span>
                  </button>
                ))}
              </li>
            );
          })}
        </ul>
      </section>

      {isGM ? (
        <section>
          <h4 className="panel-title">PNJ &amp; créatures</h4>
          <ul className="npc-list">
            {characters
              .filter((c) => c.isNpc)
              .map((npc) => (
                <li key={npc.id}>
                  <button type="button" className="party-char" onClick={() => onOpenCharacter(npc)}>
                    <span
                      className="party-portrait"
                      style={{
                        background: npc.portraitUrl
                          ? `center/cover url(${npc.portraitUrl})`
                          : 'var(--ink-700)',
                      }}
                    />
                    <span className="col" style={{ gap: 3, flex: 1, minWidth: 0 }}>
                      <strong className="ellipsis">{npc.name}</strong>
                      <HpBar hp={npc.hp} maxHp={npc.maxHp} />
                    </span>
                    <span className="party-stats">
                      <em>CA {npc.ac}</em>
                    </span>
                  </button>
                </li>
              ))}
            {!characters.some((c) => c.isNpc) ? (
              <li className="empty" style={{ padding: '14px 8px' }}>
                Aucun PNJ. Creez-en depuis l'espace de préparation.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
