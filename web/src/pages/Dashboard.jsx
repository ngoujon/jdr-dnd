import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/store.js';
import { TopBar } from '../components/TopBar.jsx';
import { Modal, Spinner, useToast, useConfirm, Avatar } from '../components/Ui.jsx';
import { copyToClipboard } from '../lib/dnd.js';

export function Dashboard() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [campaigns, setCampaigns] = useState(null);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { campaigns: list } = await api.get('/campaigns');
    setCampaigns(list);
  };

  useEffect(() => {
    load().catch((err) => toast(err.message, 'error'));
  }, []);

  const create = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const { campaign } = await api.post('/campaigns', form);
      navigate(`/campagne/${campaign.id}/preparation`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    try {
      const { campaign } = await api.post('/campaigns/join', { joinCode });
      toast(`Bienvenue dans « ${campaign.name} »`, 'success');
      navigate(`/campagne/${campaign.id}`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const leave = async (campaign) => {
    const ok = await confirm({
      title: campaign.isGM ? 'Supprimer la campagne' : 'Quitter la campagne',
      message: campaign.isGM
        ? `« ${campaign.name} », ses scènes, ses pions et son historique seront définitivement supprimés.`
        : `Vous ne verrez plus « ${campaign.name} ». Vos personnages, eux, sont conserves.`,
      danger: true,
      confirmLabel: campaign.isGM ? 'Supprimer' : 'Quitter',
    });
    if (!ok) return;
    try {
      if (campaign.isGM) await api.del(`/campaigns/${campaign.id}`);
      else await api.del(`/campaigns/${campaign.id}/members/${user.id}`);
      await load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="page">
      {confirmNode}
      <TopBar />
      <main className="page-body">
        <div className="dashboard-head">
          <div>
            <h1>Vos campagnes</h1>
            <p className="muted">Bonsoir {user?.username}. Que joue-t-on ce soir ?</p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn" onClick={() => setJoining(true)}>
              Rejoindre avec un code
            </button>
            <button type="button" className="btn primary" onClick={() => setCreating(true)}>
              Créer une campagne
            </button>
          </div>
        </div>

        {campaigns === null ? <Spinner /> : null}

        {campaigns?.length === 0 ? (
          <div className="card empty-state">
            <h3>Aucune campagne pour l'instant</h3>
            <p className="muted">
              Créez une campagne pour en devenir le Maître du Jeu, ou entrez le code que votre MJ
              vous a transmis pour rejoindre sa table.
            </p>
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              <button type="button" className="btn primary" onClick={() => setCreating(true)}>
                Créer ma première campagne
              </button>
              <button type="button" className="btn" onClick={() => setJoining(true)}>
                J'ai un code
              </button>
            </div>
          </div>
        ) : null}

        <div className="campaign-grid">
          {campaigns?.map((campaign) => (
            <article key={campaign.id} className="campaign-card card">
              <div
                className="campaign-banner"
                style={{
                  background: campaign.bannerUrl
                    ? `center/cover url(${campaign.bannerUrl})`
                    : 'linear-gradient(145deg, #232b38, #11151c)',
                }}
              >
                {campaign.isGM ? <span className="tag gm">Maître du Jeu</span> : null}
              </div>
              <div className="campaign-body">
                <h3>{campaign.name}</h3>
                <p className="muted ellipsis-2">{campaign.description || 'Pas encore de résumé.'}</p>
                <div className="row faint" style={{ fontSize: 12, gap: 12 }}>
                  <span>
                    <Avatar name={campaign.gm?.username || '?'} url={campaign.gm?.avatarUrl} size={18} />{' '}
                    {campaign.gm?.username}
                  </span>
                  <span>{campaign.memberCount} joueur(s)</span>
                  {campaign.sceneCount ? <span>{campaign.sceneCount} scène(s)</span> : null}
                </div>
                {campaign.joinCode ? (
                  <div className="join-code" title="Code à transmettre aux joueurs">
                    <span className="label">Code</span>
                    <strong className="mono">{campaign.joinCode}</strong>
                    <button
                      type="button"
                      className="btn xs ghost"
                      onClick={async () => {
                        const ok = await copyToClipboard(campaign.joinCode);
                        toast(ok ? 'Code copié' : 'Impossible de copier le code', ok ? 'success' : 'error');
                      }}
                    >
                      Copier
                    </button>
                  </div>
                ) : null}
              </div>
              <footer className="campaign-foot">
                <Link className="btn primary sm" to={`/campagne/${campaign.id}`}>
                  Entrer à la table
                </Link>
                {campaign.isGM ? (
                  <Link className="btn sm" to={`/campagne/${campaign.id}/preparation`}>
                    Préparer
                  </Link>
                ) : null}
                <span className="spacer" />
                <button type="button" className="btn ghost sm" onClick={() => leave(campaign)}>
                  {campaign.isGM ? 'Supprimer' : 'Quitter'}
                </button>
              </footer>
            </article>
          ))}
        </div>
      </main>

      <Modal
        open={creating}
        title="Nouvelle campagne"
        onClose={() => setCreating(false)}
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => setCreating(false)}>
              Annuler
            </button>
            <button type="button" className="btn primary" onClick={create} disabled={busy || !form.name.trim()}>
              Créer
            </button>
          </>
        }
      >
        <div className="col" style={{ gap: 12 }}>
          <div className="field">
            <label>Nom de la campagne</label>
            <input
              className="input"
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="La Malediction de Strahd"
            />
          </div>
          <div className="field">
            <label>Résumé (optionnel)</label>
            <textarea
              className="textarea"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Le ton, le cadre, ce que les joueurs doivent savoir avant de commencer…"
            />
          </div>
          <p className="faint" style={{ margin: 0 }}>
            Un code d'invitation sera généré automatiquement : transmettez-le à vos joueurs pour
            qu'ils rejoignent la table.
          </p>
        </div>
      </Modal>

      <Modal
        open={joining}
        title="Rejoindre une campagne"
        onClose={() => setJoining(false)}
        size="sm"
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => setJoining(false)}>
              Annuler
            </button>
            <button type="button" className="btn primary" onClick={join} disabled={busy || !joinCode.trim()}>
              Rejoindre
            </button>
          </>
        }
      >
        <div className="field">
          <label>Code d'invitation</label>
          <input
            className="input center mono"
            style={{ fontSize: 22, letterSpacing: '0.3em', textTransform: 'uppercase' }}
            autoFocus
            maxLength={8}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && join()}
            placeholder="ABC123"
          />
        </div>
      </Modal>
    </div>
  );
}
