import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/store.js';
import { Avatar, Modal } from './Ui.jsx';
import { IconCampaigns, IconPlus, IconJoin, IconSheet, IconCharacter } from './Icons.jsx';
import { CHANGELOG, APP_VERSION } from '../lib/changelog.js';

/**
 * Menu « Mes campagnes » de l'en-tête.
 *
 * Il évite le détour par le tableau de bord pour passer d'une campagne à une
 * autre. La liste n'est chargée qu'à l'ouverture : l'en-tête est présent sur
 * toutes les pages, y compris la table de jeu, où une requête au montage serait
 * du trafic inutile.
 */
function CampaignMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [campaigns, setCampaigns] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    api
      .get('/campaigns')
      .then(({ campaigns: list }) => setCampaigns(list))
      .catch(() => setCampaigns([]));

    const onPointerDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const go = (to, state) => {
    setOpen(false);
    navigate(to, state ? { state } : undefined);
  };

  return (
    <div className="topbar-menu" ref={ref}>
      <button
        type="button"
        className="btn ghost sm with-icon"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <IconCampaigns />
        Mes campagnes
      </button>

      {open ? (
        <div className="menu-pop" role="menu">
          <div className="menu-section">
            {campaigns === null ? <span className="menu-empty">Chargement…</span> : null}
            {campaigns?.length === 0 ? (
              <span className="menu-empty">Aucune campagne pour l'instant</span>
            ) : null}
            {campaigns?.map((campaign) => (
              <button
                key={campaign.id}
                type="button"
                className="menu-item"
                role="menuitem"
                onClick={() => go(`/campagne/${campaign.id}`)}
              >
                <span className="ellipsis">{campaign.name}</span>
                {campaign.isGM ? <em className="menu-tag">MJ</em> : null}
              </button>
            ))}
          </div>

          <div className="menu-section bordered">
            <button type="button" className="menu-item" role="menuitem" onClick={() => go('/', { create: true })}>
              <IconPlus />
              Créer une campagne
            </button>
            <button type="button" className="menu-item" role="menuitem" onClick={() => go('/', { join: true })}>
              <IconJoin />
              Rejoindre avec un code
            </button>
            <button type="button" className="menu-item" role="menuitem" onClick={() => go('/')}>
              <IconSheet />
              Voir toutes mes campagnes
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TopBar({ title, subtitle, children }) {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const [showChangelog, setShowChangelog] = useState(false);

  return (
    <header className="topbar">
      <div className="brand-block">
        <Link to="/" className="brand" title="Mes campagnes">
          <svg viewBox="0 0 64 64" width="26" height="26" aria-hidden="true">
            <polygon points="32,4 58,19 58,45 32,60 6,45 6,19" fill="#1b2029" stroke="#c0873f" strokeWidth="3" />
            <text x="32" y="42" fontFamily="Cinzel, Georgia, serif" fontSize="24" fill="#e8d9b5" textAnchor="middle">
              20
            </text>
          </svg>
          <span>Table Ronde</span>
        </Link>
        <button
          type="button"
          className="brand-version"
          onClick={() => setShowChangelog(true)}
          title="Voir les notes de version"
        >
          v{APP_VERSION}
        </button>
      </div>

      <Modal
        open={showChangelog}
        title="Notes de version"
        onClose={() => setShowChangelog(false)}
        size="sm"
      >
        <div className="changelog-list">
          {CHANGELOG.map((entry) => (
            <div key={entry.version} className="changelog-entry">
              <div className="changelog-entry-head">
                <strong>v{entry.version}</strong>
                <span className="faint">{entry.date}</span>
              </div>
              <ul>
                {entry.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="faint changelog-build" title={`Build : ${import.meta.env.VITE_APP_VERSION || 'dev'}`}>
          Build déployé : {import.meta.env.VITE_APP_VERSION || 'dev'}
        </p>
      </Modal>

      {title ? (
        <div className="topbar-title">
          <strong>{title}</strong>
          {subtitle ? <span className="faint">{subtitle}</span> : null}
        </div>
      ) : null}

      <div className="spacer" />
      {children}

      <div className="topbar-user">
        <CampaignMenu />
        <Link to="/personnages" className="btn ghost sm with-icon">
          <IconCharacter />
          Mes personnages
        </Link>
        <Link to="/compte" className="topbar-avatar" title="Mon compte">
          <Avatar name={user?.username || '?'} url={user?.avatarUrl} size={30} />
        </Link>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            logout();
            navigate('/connexion');
          }}
        >
          Quitter
        </button>
      </div>
    </header>
  );
}
