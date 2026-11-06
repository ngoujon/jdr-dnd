import { useEffect } from 'react';
import { useAuth, useTable } from '../lib/store.js';
import {
  useVoice,
  listenVoice,
  joinVoice,
  leaveVoice,
  setVoiceMuted,
  setGmBroadcast,
  VOICE_FULL_METERS,
  VOICE_SILENT_METERS,
} from '../lib/voice.js';
import { useToast } from './Ui.jsx';

const ROOMS = [
  { key: '1', label: 'Salon 1' },
  { key: '2', label: 'Salon 2' },
];

/** Onglet « Com. » : salons vocaux, son coupe, et mode de parole du MJ. */
export function VoicePanel() {
  const campaignId = useTable((s) => s.campaignId);
  const isGM = useTable((s) => s.isGM);
  const hasGmPawn = useTable((s) => s.tokens.some((t) => t.isGmPawn));
  const me = useAuth((s) => s.user);
  const { room, joining, muted, error, rooms, gmBroadcast, levels } = useVoice();
  const toast = useToast();

  useEffect(() => {
    listenVoice(campaignId);
  }, [campaignId]);

  const join = (key) => joinVoice(campaignId, key).catch(() => {});

  return (
    <div className="voice-panel scroll">
      <div className="row" style={{ padding: '0 10px 8px' }}>
        <h4 className="panel-title">Communication</h4>
      </div>

      {error ? <p className="voice-error">{error}</p> : null}

      {isGM ? (
        <div className="voice-gm card-soft">
          <label className="switch-row">
            <input
              type="checkbox"
              checked={gmBroadcast}
              onChange={(e) => setGmBroadcast(campaignId, e.target.checked)}
            />
            <span className="col" style={{ gap: 2 }}>
              <strong>Parler à toute la carte</strong>
              <span className="faint">
                {gmBroadcast
                  ? 'Tout le monde vous entend au même volume.'
                  : hasGmPawn
                    ? 'Seuls les joueurs proches de votre pion MJ vous entendent.'
                    : 'Posez votre pion MJ sur la carte : sans lui, tout le monde vous entend.'}
              </span>
            </span>
          </label>
        </div>
      ) : null}

      <div className="voice-rooms">
        {ROOMS.map(({ key, label }) => {
          const members = rooms[key] || [];
          const here = room === key;
          return (
            <section key={key} className={`voice-room ${here ? 'here' : ''}`}>
              <div className="voice-room-head">
                <span aria-hidden="true">{here ? '🔊' : '🔈'}</span>
                <strong>{label}</strong>
                <span className="faint">{members.length}</span>
                <span className="spacer" />
                {here ? (
                  <button type="button" className="btn xs danger" onClick={leaveVoice}>
                    Quitter
                  </button>
                ) : (
                  <button type="button" className="btn xs primary" disabled={joining} onClick={() => join(key)}>
                    {room ? 'Changer' : 'Rejoindre'}
                  </button>
                )}
              </div>
              {members.length ? (
                <ul className="voice-members">
                  {members.map((member) => {
                    const self = member.userId === me?.id && here;
                    const level = levels[member.peerId];
                    return (
                      <li key={member.peerId}>
                        <span className={`voice-dot ${member.isGM ? 'gm' : ''}`} />
                        <span className="ellipsis" style={{ flex: 1 }}>
                          {member.username}
                          {member.isGM ? ' (MJ)' : ''}
                          {self ? ' — vous' : ''}
                        </span>
                        {here && !self && level ? (
                          <span
                            className="voice-level"
                            title={level.connected ? 'Volume selon la distance' : 'Connexion en cours…'}
                          >
                            {level.connected ? `${Math.round(level.gain * 100)} %` : '…'}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="faint voice-empty">Personne pour l'instant.</p>
              )}
            </section>
          );
        })}
      </div>

      {room ? (
        <div className="row" style={{ padding: '0 10px', gap: 6 }}>
          <button
            type="button"
            className={`btn sm ${muted ? 'danger' : ''}`}
            onClick={() => {
              setVoiceMuted(!muted);
              toast(muted ? 'Micro réactivé' : 'Micro coupé', 'info');
            }}
          >
            {muted ? '🔇 Micro coupé' : '🎙️ Couper mon micro'}
          </button>
        </div>
      ) : null}

      <p className="faint voice-help">
        Le son dépend de la distance entre les pions : plein volume jusqu'à {VOICE_FULL_METERS} m, plus rien
        au-delà de {VOICE_SILENT_METERS} m.
        {isGM ? ' En tant que MJ, vous entendez toujours tout le monde.' : ' Sans pion sur la carte, pas de réglage selon la distance.'}
      </p>
    </div>
  );
}
