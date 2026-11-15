import { useEffect } from 'react';
import { useAuth, useTable } from '../lib/store.js';
import {
  useVoice,
  listenVoice,
  joinVoice,
  leaveVoice,
  setVoiceMuted,
  setGmBroadcast,
  setMicSensitivity,
  setNoiseSuppression,
  sensitivityToDb,
  meterPosition,
  levelToDb,
  VOICE_FULL_METERS,
  VOICE_SILENT_METERS,
} from '../lib/voice.js';
import { useToast } from './Ui.jsx';
import { ListenerVolumes } from './SoundPanel.jsx';

const ROOMS = [
  { key: '1', label: 'Salon 1' },
  { key: '2', label: 'Salon 2' },
];

/** Reglages du micro propres a chaque personne : sensibilite et suppresseur de bruit. */
function MicSettings() {
  const room = useVoice((s) => s.room);
  const sensitivity = useVoice((s) => s.sensitivity);
  const noiseSuppression = useVoice((s) => s.noiseSuppression);
  const micLevel = useVoice((s) => s.micLevel);
  const micOpen = useVoice((s) => s.micOpen);
  const muted = useVoice((s) => s.muted);
  const thresholdDb = sensitivityToDb(sensitivity);
  const levelPct = meterPosition(levelToDb(micLevel)) * 100;
  const thresholdPct = thresholdDb === null ? null : meterPosition(thresholdDb) * 100;
  const sending = room && micOpen && !muted;

  return (
    <div className="voice-gm card-soft voice-mic">
      <strong style={{ fontSize: 12.5 }}>Mon micro</strong>

      <label className="voice-mic-row">
        <span className="row" style={{ justifyContent: 'space-between' }}>
          <span>Sensibilité</span>
          <span className="faint">{sensitivity >= 100 ? 'Max — tout passe' : `${sensitivity} %`}</span>
        </span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={sensitivity}
          onChange={(e) => setMicSensitivity(Number(e.target.value))}
        />
        <span className="faint">
          Baissez-la si le micro capte les bruits autour de vous : seule une voix assez forte passera.
        </span>
      </label>

      {room ? (
        <div className="voice-meter" title={sending ? 'Votre voix est envoyée' : 'Rien n’est envoyé'}>
          <div className={`voice-meter-fill ${sending ? 'on' : ''}`} style={{ width: `${levelPct}%` }} />
          {thresholdPct !== null ? <div className="voice-meter-mark" style={{ left: `${thresholdPct}%` }} /> : null}
        </div>
      ) : (
        <p className="faint" style={{ margin: 0, fontSize: 11.5 }}>
          Rejoignez un salon pour voir le niveau de votre micro.
        </p>
      )}

      <label className="switch-row">
        <input type="checkbox" checked={noiseSuppression} onChange={(e) => setNoiseSuppression(e.target.checked)} />
        <span className="col" style={{ gap: 2 }}>
          <strong>Suppresseur de bruit</strong>
          <span className="faint">Atténue le souffle, le ventilateur et le clavier. Réglage personnel.</span>
        </span>
      </label>
    </div>
  );
}

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

      <MicSettings />

      <ListenerVolumes />

      <p className="faint voice-help">
        Le son dépend de la distance entre les pions : plein volume jusqu'à {VOICE_FULL_METERS} m, plus rien
        au-delà de {VOICE_SILENT_METERS} m.
        {isGM ? ' En tant que MJ, vous entendez toujours tout le monde.' : ' Sans pion sur la carte, pas de réglage selon la distance.'}
      </p>
    </div>
  );
}
