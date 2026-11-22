import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTable, useAuth } from '../lib/store.js';
import { useToast } from './Ui.jsx';

const QUICK_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

const DEFAULT_HEIGHT = 220;
const MIN_HEIGHT = 90;
// Hauteur de la barre de saisie seule, quand le chat est replié.
const COLLAPSED_HEIGHT = 74;

const timeOf = (iso) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Jet de dés tenu sur une ligne : libellé, dés, modificateurs, total. */
function RollLine({ roll, label }) {
  if (!roll) return null;
  const tone = roll.crit ? 'crit' : roll.fumble ? 'fumble' : '';
  return (
    <span className={`roll-line ${tone}`}>
      {label && label !== roll.formula ? <span className="roll-line-label">{label}</span> : null}
      <span className="roll-line-formula mono">{roll.normalized || roll.formula}</span>
      {roll.advantage === 'advantage' ? <span className="roll-line-adv on">av.</span> : null}
      {roll.advantage === 'disadvantage' ? <span className="roll-line-adv">désav.</span> : null}
      <span className="roll-line-parts">
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
                  className={`die sm ${die.kept ? '' : 'dropped'} ${
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
      <span className="roll-line-eq">=</span>
      <strong className="roll-line-total">{roll.total}</strong>
      {roll.crit ? <span className="roll-flag crit">critique !</span> : null}
      {roll.fumble ? <span className="roll-flag fumble">échec critique</span> : null}
    </span>
  );
}

/**
 * Chat de la table, ancré en bas du plateau (MJ comme joueurs).
 *
 * Fond légèrement transparent pour garder la carte visible derrière, hauteur
 * réglable à la poignée du haut et mémorisée sur le compte.
 */
export function ChatPanel({ speakingAs, onSpeakingAsChange, recipient, onRecipientChange }) {
  const messages = useTable((s) => s.messages);
  const sendChat = useTable((s) => s.sendChat);
  const roll = useTable((s) => s.roll);
  const characters = useTable((s) => s.characters);
  const isGM = useTable((s) => s.isGM);
  const campaign = useTable((s) => s.campaign);
  const me = useAuth((s) => s.user);
  const savePrefs = useAuth((s) => s.savePrefs);
  const toast = useToast();

  const [text, setText] = useState('');
  const [advantage, setAdvantage] = useState('none');
  const [secret, setSecret] = useState(false);
  const [height, setHeight] = useState(me?.prefs?.chatHeight || DEFAULT_HEIGHT);
  const [collapsed, setCollapsed] = useState(Boolean(me?.prefs?.chatCollapsed));
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stickToBottom = useRef(true);

  const mine = useMemo(
    () => characters.filter((c) => c.ownerId === me?.id || (isGM && c.isNpc)),
    [characters, me, isGM],
  );

  const usernameById = useMemo(() => {
    const map = new Map();
    for (const member of campaign?.members || []) map.set(member.userId, member.username);
    return map;
  }, [campaign]);

  const others = useMemo(
    () => (campaign?.members || []).filter((m) => m.userId !== me?.id).map((m) => m.username),
    [campaign, me],
  );

  const shownHeight = collapsed ? COLLAPSED_HEIGHT : height;

  // La hauteur est publiée sur la page : le zoom et les fenêtres privées se
  // placent juste au-dessus du chat au lieu d'être recouverts.
  useLayoutEffect(() => {
    const page = rootRef.current?.closest('.table-page');
    page?.style.setProperty('--chat-h', `${shownHeight}px`);
  }, [shownHeight]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, shownHeight]);

  // Clic sur « chuchoter » dans le panneau Groupe : le curseur va dans le
  // message. Pas quand on tape soi-même le pseudo dans le champ destinataire.
  useEffect(() => {
    if (recipient && !rootRef.current?.contains(document.activeElement)) inputRef.current?.focus();
  }, [recipient]);

  /** Poignée du haut : glisser pour agrandir ou réduire, enregistré au lâcher. */
  const startResize = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = collapsed ? COLLAPSED_HEIGHT : height;
    const area = rootRef.current?.parentElement;
    const maxH = Math.max(MIN_HEIGHT, (area?.clientHeight || window.innerHeight) - 60);
    let next = startH;
    setDragging(true);
    if (collapsed) setCollapsed(false);
    const onMove = (ev) => {
      next = Math.round(Math.min(maxH, Math.max(MIN_HEIGHT, startH + (startY - ev.clientY))));
      setHeight(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDragging(false);
      savePrefs({ chatHeight: next, chatCollapsed: false });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    savePrefs({ chatCollapsed: next });
  };

  const submit = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    const res = await sendChat(value, speakingAs?.name, recipient.trim());
    if (res?.error) {
      setText(value);
      toast(res.error, 'error');
    }
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

  const privateTo = recipient.trim();

  return (
    <section
      ref={rootRef}
      className={`chat-dock ${collapsed ? 'collapsed' : ''} ${dragging ? 'dragging' : ''}`}
      style={{ height: shownHeight }}
      aria-label="Chat de la table"
    >
      <div
        className="chat-dock-grip"
        onPointerDown={startResize}
        title="Glisser pour agrandir ou réduire le chat"
        role="separator"
        aria-orientation="horizontal"
      />

      <div className="chat-dock-bar">
        <strong className="chat-dock-title">Chat</strong>
        <div className="chat-dock-dice">
          {QUICK_DICE.map((die) => (
            <button
              key={die}
              type="button"
              className="die-btn sm"
              onClick={() => quickRoll(die)}
              title={die === 'd20' && advantage !== 'none' ? `Lancer 1${die} (${advantage === 'advantage' ? 'avantage' : 'désavantage'})` : `Lancer 1${die}`}
            >
              {die}
            </button>
          ))}
        </div>
        <div className="seg small" title="S'applique aux jets de d20">
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
              aria-pressed={advantage === key}
            >
              {label}
            </button>
          ))}
        </div>
        <label className={`check chat-secret ${secret ? 'on' : ''}`} title={isGM ? 'Résultat visible de vous seul' : 'Résultat visible du MJ seul'}>
          <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
          Jet secret
        </label>
        <span className="spacer" />
        <button
          type="button"
          className="btn ghost xs chat-dock-toggle"
          onClick={toggleCollapsed}
          title={collapsed ? 'Déplier le chat' : 'Replier le chat'}
        >
          {collapsed ? '▴' : '▾'}
        </button>
      </div>

      {collapsed ? null : (
        <div
          className="chat-log scroll"
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
        >
          {messages.length === 0 ? (
            <div className="chat-empty">La table est silencieuse. Lancez un dé ou écrivez un message.</div>
          ) : null}
          {messages.map((message) => {
            const privateLabel = message.whisperTo
              ? message.whisperTo === me?.id
                ? message.userId === me?.id
                  ? 'secret'
                  : 'privé'
                : `→ ${usernameById.get(message.whisperTo) || '…'}`
              : null;
            return (
              <p
                key={message.id}
                className={`chat-line ${message.type.toLowerCase()} ${message.userId === me?.id ? 'own' : ''} ${
                  message.whisperTo ? 'private' : ''
                }`}
              >
                <time>{timeOf(message.createdAt)}</time>
                <strong className="chat-author">{message.authorName}</strong>
                {privateLabel ? <span className="chat-private">{privateLabel}</span> : null}
                {message.type === 'OOC' ? <span className="chat-private">hors-jeu</span> : null}
                {message.type === 'ROLL' ? (
                  <RollLine roll={message.rollData} label={message.content} />
                ) : (
                  <span className="chat-text">
                    {message.type === 'EMOTE' ? `* ${message.content}` : message.content}
                  </span>
                )}
              </p>
            );
          })}
        </div>
      )}

      <form className="chat-form" onSubmit={submit}>
        <div className={`chat-to ${privateTo ? 'private' : ''}`}>
          <input
            className="input sm"
            value={recipient}
            onChange={(e) => onRecipientChange(e.target.value)}
            placeholder="À : tout le monde"
            list="chat-recipients"
            aria-label="Destinataire (vide : toute la table)"
            title="Vide : message à toute la table. Un pseudo : message privé."
          />
          {privateTo ? (
            <button type="button" className="chat-to-clear" onClick={() => onRecipientChange('')} title="Écrire à tout le monde">
              ✕
            </button>
          ) : null}
          <datalist id="chat-recipients">
            {others.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
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
          ref={inputRef}
          className="input sm chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={privateTo ? `Message privé à ${privateTo}…` : 'Message à la table, /roll 2d6+3, /me sourit…'}
          aria-label="Message"
        />
        <button type="submit" className="btn primary sm" disabled={!text.trim()}>
          Envoyer
        </button>
      </form>
    </section>
  );
}
