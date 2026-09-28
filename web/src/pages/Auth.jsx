import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/store.js';
import { IconCampaigns, IconSheet, IconStory, IconCombat } from '../components/Icons.jsx';

/** Ecran d'entree : connexion et creation de compte. */
export function AuthPage({ mode }) {
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({
    identifier: '',
    email: '',
    username: '',
    password: '',
    confirm: '',
  });
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    // Une faute de frappe sur un mot de passe masqué ne se voit qu'à la
    // connexion suivante : on la rattrape ici plutôt que côté serveur, qui ne
    // reçoit jamais la confirmation.
    if (mode === 'register' && form.password !== form.confirm) {
      setFieldErrors({ confirm: ['Les deux mots de passe ne correspondent pas'] });
      return;
    }
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
            <li>
              <IconCampaigns />
              <span>
                <strong>Cartes vivantes</strong>
                Pions déplaçables au pixel près, brouillard de guerre, dessin partagé et mesure des
                distances.
              </span>
            </li>
            <li>
              <IconSheet />
              <span>
                <strong>Fiches D&amp;D 5e complètes</strong>
                Modificateurs, maîtrises et valeurs passives calculés pour vous. Un clic sur une
                compétence lance le dé.
              </span>
            </li>
            <li>
              <IconStory />
              <span>
                <strong>Un espace privé pour le MJ</strong>
                Scènes préparées à l'avance, PNJ cachés, documents secrets et jets discrets.
              </span>
            </li>
            <li>
              <IconCombat />
              <span>
                <strong>Le combat, sans paperasse</strong>
                Ordre d'initiative partagé, tour par tour, points de vie synchronisés avec les pions.
              </span>
            </li>
          </ul>

          <ol className="auth-steps">
            <li>Créez votre compte</li>
            <li>Rejoignez une campagne avec le code du MJ</li>
            <li>Composez votre personnage et entrez en jeu</li>
          </ol>
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
            <div className="input-with-action">
              <input
                id="password"
                className="input"
                type={reveal ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={form.password}
                onChange={set('password')}
                required
              />
              <button
                type="button"
                className="btn ghost xs"
                onClick={() => setReveal((v) => !v)}
                aria-pressed={reveal}
              >
                {reveal ? 'Masquer' : 'Afficher'}
              </button>
            </div>
            {fieldErrors.password ? <span className="field-error">{fieldErrors.password[0]}</span> : null}
            {mode === 'register' ? <span className="faint">8 caractères minimum.</span> : null}
          </div>

          {mode === 'register' ? (
            <div className="field">
              <label htmlFor="confirm">Confirmer le mot de passe</label>
              <input
                id="confirm"
                className="input"
                type={reveal ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.confirm}
                onChange={set('confirm')}
                required
              />
              {fieldErrors.confirm ? <span className="field-error">{fieldErrors.confirm[0]}</span> : null}
            </div>
          ) : null}

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
