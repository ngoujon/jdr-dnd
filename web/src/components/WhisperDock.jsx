import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth, useTable } from '../lib/store.js';
import { Avatar } from './Ui.jsx';

/**
 * Conversations privées, en fenêtres flottantes.
 *
 * Un chuchotement se perdait dans le fil général, entre les jets de dés et les
 * répliques de toute la table. Chaque correspondant a désormais sa fenêtre, que
 * l'on peut réduire dans la barre du bas et rouvrir plus tard : l'historique est
 * alors rechargé depuis le serveur, car le fil général ne garde que ses derniers
 * messages en mémoire.
 */
export function WhisperDock() {
  const me = useAuth((s) => s.user);
  const campaign = useTable((s) => s.campaign);
  const campaignId = useTable((s) => s.campaignId);
  const messages = useTable((s) => s.messages);
  const sendChat = useTable((s) => s.sendChat);

  // { [userId]: { minimized, unread, history, loading } }
  const [threads, setThreads] = useState({});
  const seenRef = useRef(new Set());

  const membersById = useMemo(() => {
    const map = new Map();
    for (const member of campaign?.members || []) map.set(member.userId, member);
    return map;
  }, [campaign]);

  /** Le correspondant d'un message privé, ou null si le message n'en est pas un. */
  const correspondentOf = useCallback(
    (message) => {
      if (!message.whisperTo || !me) return null;
      if (message.userId === me.id) return message.whisperTo;
      if (message.whisperTo === me.id) return message.userId;
      return null;
    },
    [me],
  );

  const openThread = useCallback(
    async (userId, { focus = true } = {}) => {
      setThreads((current) => ({
        ...current,
        [userId]: {
          ...current[userId],
          minimized: focus ? false : (current[userId]?.minimized ?? true),
          unread: focus ? 0 : (current[userId]?.unread ?? 0),
          loading: current[userId]?.history ? false : true,
        },
      }));

      if (threads[userId]?.history || !campaignId) return;
      try {
        const { messages: history } = await api.get(
          `/campaigns/${campaignId}/chat/conversations/${userId}`,
        );
        setThreads((current) => ({
          ...current,
          [userId]: { ...current[userId], history, loading: false },
        }));
      } catch {
        setThreads((current) => ({
          ...current,
          [userId]: { ...current[userId], history: [], loading: false },
        }));
      }
    },
    [campaignId, threads],
  );

  // Un chuchotement qui arrive ouvre sa fenêtre. Les messages déjà vus sont
  // mémorisés pour qu'un rechargement du fil ne rouvre pas tout.
  useEffect(() => {
    for (const message of messages) {
      if (seenRef.current.has(message.id)) continue;
      seenRef.current.add(message.id);
      const other = correspondentOf(message);
      if (!other) continue;
      const mine = message.userId === me?.id;
      setThreads((current) => {
        const thread = current[other];
        return {
          ...current,
          [other]: {
            ...thread,
            // Un message reçu dans une fenêtre réduite ne la déplie pas de
            // force : il s'annonce par un compteur sur la barre du bas.
            minimized: thread ? thread.minimized : !mine ? false : true,
            unread: thread?.minimized && !mine ? (thread.unread ?? 0) + 1 : (thread?.unread ?? 0),
            history: thread?.history ? [...thread.history, message] : thread?.history,
          },
        };
      });
    }
  }, [messages, correspondentOf, me]);

  const close = (userId) =>
    setThreads((current) => {
      const { [userId]: _removed, ...rest } = current;
      return rest;
    });

  const entries = Object.entries(threads);
  if (!entries.length) return null;

  const open = entries.filter(([, thread]) => !thread.minimized);
  const minimized = entries.filter(([, thread]) => thread.minimized);

  return (
    <>
      <div className="whisper-windows">
        {open.map(([userId, thread]) => (
          <WhisperWindow
            key={userId}
            member={membersById.get(userId)}
            thread={thread}
            me={me}
            onMinimize={() =>
              setThreads((current) => ({
                ...current,
                [userId]: { ...current[userId], minimized: true },
              }))
            }
            onClose={() => close(userId)}
            onSend={(text) => sendChat(`/w ${membersById.get(userId)?.username || ''} ${text}`)}
          />
        ))}
      </div>

      {minimized.length ? (
        <div className="whisper-bar">
          {minimized.map(([userId, thread]) => (
            <button
              key={userId}
              type="button"
              className={`whisper-tab ${thread.unread ? 'has-unread' : ''}`}
              onClick={() => openThread(userId)}
            >
              <Avatar
                name={membersById.get(userId)?.username || '?'}
                url={membersById.get(userId)?.avatarUrl}
                size={20}
              />
              <span className="ellipsis">{membersById.get(userId)?.username || 'Joueur'}</span>
              {thread.unread ? <em className="whisper-badge">{thread.unread}</em> : null}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

function WhisperWindow({ member, thread, me, onMinimize, onClose, onSend }) {
  const [text, setText] = useState('');
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [thread.history]);

  const submit = (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText('');
  };

  return (
    <section className="whisper-window">
      <header className="whisper-head">
        <Avatar name={member?.username || '?'} url={member?.avatarUrl} size={22} />
        <strong className="ellipsis">{member?.username || 'Joueur'}</strong>
        <span className="spacer" />
        <button type="button" className="btn ghost xs" onClick={onMinimize} title="Réduire">
          –
        </button>
        <button type="button" className="btn ghost xs" onClick={onClose} title="Fermer">
          ✕
        </button>
      </header>

      <div className="whisper-body scroll" ref={bodyRef}>
        {thread.loading ? <p className="faint">Chargement de la conversation…</p> : null}
        {!thread.loading && !thread.history?.length ? (
          <p className="faint">Aucun message pour l'instant.</p>
        ) : null}
        {thread.history?.map((message) => (
          <p key={message.id} className={`whisper-line ${message.userId === me?.id ? 'mine' : ''}`}>
            <span>{message.content}</span>
            <time>
              {new Date(message.createdAt).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </p>
        ))}
      </div>

      <form className="whisper-foot" onSubmit={submit}>
        <input
          className="input sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Message privé à ${member?.username || '…'}`}
          aria-label={`Message privé à ${member?.username || ''}`}
        />
        <button type="submit" className="btn primary xs" disabled={!text.trim()}>
          Envoyer
        </button>
      </form>
    </section>
  );
}
