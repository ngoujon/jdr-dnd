import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/store.js';

/** Ecran d'entree : connexion et creation de compte. */
export function AuthPage({ mode }) {
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ identifier: '', email: '', username: '', password: '' });
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      if (mode === 'login') await login(form.identifier, form.password);
      else await register({ email: form.email, username: form.username, password: form.password });
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.details || {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-art" aria-hidden="true">
        <div className="auth-art-inner">
          <svg viewBox="0 0 200 200" width="128" height="128">
            <polygon points="100,12 178,56 178,144 100,188 22,144 22,56" fill="none" stroke="#c0873f" strokeWidth="4" />
            <polygon points="100,42 152,72 152,128 100,158 48,128 48,72" fill="#1b2029" stroke="#8a5f2b" strokeWidth="2" />
            <text x="100" y="118" fontFamily="Cinzel, Georgia, serif" fontSize="46" fill="#e8d9b5" textAnchor="middle">
              20
            </text>
          </svg>
          <h1>Table Ronde</h1>
          <p>
            Votre table de jeu virtuelle : cartes, pions, fiches de personnage et jets de dés,
            partagés en temps réel avec toute votre bande.
          </p>
          <ul className="auth-features">
            <li>Cartes avec grille, brouillard de guerre et dessin</li>
            <li>Fiches D&amp;D 5e complètes, calculées automatiquement</li>
            <li>Espace de préparation privé pour le Maître du Jeu</li>
            <li>Chat, jets de dés et ordre d'initiative partagés</li>
          </ul>
        </div>
      </div>

      <div className="auth-form-side">
        <form className="auth-form card" onSubmit={submit}>
          <h2>{mode === 'login' ? 'Reprendre la partie' : 'Rejoindre la table'}</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {mode === 'login'
              ? 'Connectez-vous pour retrouver vos campagnes.'
              : 'Créez votre compte : vos personnages vous suivront de campagne en campagne.'}
          </p>

          {error ? <div className="alert error">{error}</div> : null}

          {mode === 'login' ? (
            <div className="field">
              <label htmlFor="identifier">Pseudo ou adresse e-mail</label>
              <input
                id="identifier"
                className="input"
                autoComplete="username"
                autoFocus
                value={form.identifier}
                onChange={set('identifier')}
                required
              />
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="username">Pseudo</label>
                <input
                  id="username"
                  className="input"
                  autoComplete="username"
                  autoFocus
                  value={form.username}
                  onChange={set('username')}
                  required
                />
                {fieldErrors.username ? <span className="field-error">{fieldErrors.username[0]}</span> : null}
              </div>
              <div className="field">
                <label htmlFor="email">Adresse e-mail</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={set('email')}
                  required
                />
                {fieldErrors.email ? <span className="field-error">{fieldErrors.email[0]}</span> : null}
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={form.password}
              onChange={set('password')}
              required
            />
            {fieldErrors.password ? <span className="field-error">{fieldErrors.password[0]}</span> : null}
            {mode === 'register' ? <span className="faint">8 caractères minimum.</span> : null}
          </div>

          <button type="submit" className="btn primary block" disabled={busy}>
            {busy ? 'Un instant…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>

          <p className="muted" style={{ textAlign: 'center', marginBottom: 0 }}>
            {mode === 'login' ? (
              <>
                Pas encore de compte ? <Link to="/inscription">Inscrivez-vous</Link>
              </>
            ) : (
              <>
                Déjà inscrit ? <Link to="/connexion">Connectez-vous</Link>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
