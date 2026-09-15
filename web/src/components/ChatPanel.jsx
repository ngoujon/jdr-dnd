import { useEffect, useMemo, useRef, useState } from 'react';
import { useTable, useAuth } from '../lib/store.js';
import { Avatar, useToast } from './Ui.jsx';

const QUICK_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

/** Detail d'un jet : chaque de, les valeurs ecartees, le total. */
function RollCard({ roll, whisper }) {
  if (!roll) return null;
  const tone = roll.crit ? 'crit' : roll.fumble ? 'fumble' : '';
  return (
    <div className={`roll-card ${tone} ${whisper ? 'whisper' : ''}`}>
      <div className="roll-head">
        <span className="roll-formula mono">{roll.normalized || roll.formula}</span>
        {roll.advantage === 'advantage' ? <span className="tag on">avantage</span> : null}
        {roll.advantage === 'disadvantage' ? <span className="tag">désavantage</span> : null}
      </div>
      <div className="roll-total-row">
        <span className="roll-total">{roll.total}</span>
        <span className="roll-parts">
          {roll.parts.map((part, i) =>
            part.kind === 'modifier' ? (
              <span key={i} className="roll-mod">
                {part.sign < 0 ? '−' : '+'}
                {part.value}
              </span>
            ) : (
              <span key={i} className="roll-dice">
                {part.dice.map((die, j) => (
                  <span
                    key={j}
                    className={`die d${part.sides} ${die.kept ? '' : 'dropped'} ${
                      die.value === part.sides ? 'max' : die.value === 1 ? 'min' : ''
                    }`}
                  >
                    {die.value}
                  </span>
                ))}
              </span>
            ),
          )}
        </span>
      </div>
      {roll.crit ? <span className="roll-flag crit">Réussite critique</span> : null}
      {roll.fumble ? <span className="roll-flag fumble">Échec critique</span> : null}
    </div>
  );
}

export function ChatPanel({ speakingAs, onSpeakingAsChange }) {
  const messages = useTable((s) => s.messages);
  const sendChat = useTable((s) => s.sendChat);
  const roll = useTable((s) => s.roll);
  const characters = useTable((s) => s.characters);
  const isGM = useTable((s) => s.isGM);
  const me = useAuth((s) => s.user);
  const toast = useToast();

  const [text, setText] = useState('');
  const [advantage, setAdvantage] = useState('none');
  const [secret, setSecret] = useState(false);
  const listRef = useRef(null);
  const stickToBottom = useRef(true);

  const mine = useMemo(
    () => characters.filter((c) => c.ownerId === me?.id || (isGM && c.isNpc)),
    [characters, me, isGM],
  );

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    const res = await sendChat(value, speakingAs?.name);
    if (res?.error) toast(res.error, 'error');
  };

  const quickRoll = async (die) => {
    const res = await roll({
      formula: `1${die}`,
      label: '',
      advantage: die === 'd20' ? advantage : 'none',
      secret,
      characterName: speakingAs?.name,
    });
    if (res?.error) toast(res.error, 'error');
  };

  return (
    <div className="chat-panel">
      <div
        className="chat-log scroll"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        {messages.length === 0 ? (
          <div className="empty">
            La table est silencieuse.
            <br />
            Tapez <code>/roll 1d20+3</code> ou lancez un dé ci-dessous.
          </div>
        ) : null}
        {messages.map((message) => (
          <article
            key={message.id}
            className={`chat-msg ${message.type.toLowerCase()} ${message.userId === me?.id ? 'own' : ''}`}
          >
            <Avatar name={message.authorName} url={message.user?.avatarUrl} size={26} />
            <div className="chat-body">
              <header>
                <strong>{message.authorName}</strong>
                {message.whisperTo ? <span className="tag">chuchote</span> : null}
                {message.type === 'OOC' ? <span className="tag">hors-jeu</span> : null}
                <time>
                  {new Date(message.createdAt).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </header>
              {message.type === 'ROLL' ? (
                <>
                  {message.content ? <p className="roll-label">{message.content}</p> : null}
                  <RollCard roll={message.rollData} whisper={Boolean(message.whisperTo)} />
                </>
              ) : (
                <p className={message.type === 'EMOTE' ? 'emote' : ''}>
                  {message.type === 'EMOTE' ? `* ${message.content}` : message.content}
                </p>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="dice-tray">
        <div className="row wrap">
          {QUICK_DICE.map((die) => (
            <button key={die} type="button" className="die-btn" onClick={() => quickRoll(die)}>
              {die}
            </button>
          ))}
        </div>
        <div className="row wrap dice-opts">
          <div className="seg">
            {[
              ['none', 'Normal'],
              ['advantage', 'Avantage'],
              ['disadvantage', 'Désavantage'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={advantage === key ? 'active' : ''}
                onClick={() => setAdvantage(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
            Jet secret
          </label>
        </div>
      </div>

      <form className="chat-form" onSubmit={submit}>
        {mine.length ? (
          <select
            className="select sm speaker"
            value={speakingAs?.id || ''}
            onChange={(e) => onSpeakingAsChange(mine.find((c) => c.id === e.target.value) || null)}
            title="Parler en tant que"
          >
            <option value="">{me?.username}</option>
            {mine.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>
        ) : null}
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message, /roll 2d6+3, /me sourit, /w Pseudo …"
          aria-label="Message"
        />
        <button type="submit" className="btn primary" disabled={!text.trim()}>
          Envoyer
        </button>
      </form>
    </div>
  );
}
