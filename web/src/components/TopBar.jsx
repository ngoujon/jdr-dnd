import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store.js';
import { Avatar } from './Ui.jsx';

export function TopBar({ title, subtitle, children }) {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();

  return (
    <header className="topbar">
      <Link to="/" className="brand" title="Mes campagnes">
        <svg viewBox="0 0 64 64" width="26" height="26" aria-hidden="true">
          <polygon points="32,4 58,19 58,45 32,60 6,45 6,19" fill="#1b2029" stroke="#c0873f" strokeWidth="3" />
          <text x="32" y="42" fontFamily="Cinzel, Georgia, serif" fontSize="24" fill="#e8d9b5" textAnchor="middle">
            20
          </text>
        </svg>
        <span>Table Ronde</span>
      </Link>

      {title ? (
        <div className="topbar-title">
          <strong>{title}</strong>
          {subtitle ? <span className="faint">{subtitle}</span> : null}
        </div>
      ) : null}

      <div className="spacer" />
      {children}

      <div className="topbar-user">
        <Link to="/personnages" className="btn ghost sm">
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
