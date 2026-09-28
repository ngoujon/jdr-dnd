import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/store.js';
import { TopBar } from '../components/TopBar.jsx';
import { Avatar, useToast } from '../components/Ui.jsx';

export function AccountPage() {
  const user = useAuth((s) => s.user);
  const updateProfile = useAuth((s) => s.updateProfile);
  const toast = useToast();
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(false);

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateProfile({ username, email });
      toast('Profil mis à jour', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const uploadAvatar = async (file) => {
    if (!file) return;
    const form = new FormData();
    form.append('files', file);
    form.append('kind', 'PORTRAIT');
    try {
      const { assets } = await api.upload('/assets', form);
      await updateProfile({ avatarUrl: assets[0].url });
      toast('Avatar mis à jour', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/password', passwords);
      setPasswords({ currentPassword: '', newPassword: '' });
      toast('Mot de passe modifié', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <TopBar />
      <main className="page-body narrow">
        <h1>Mon compte</h1>

        <form className="card pad col" style={{ gap: 14 }} onSubmit={saveProfile}>
          <h3>Profil</h3>
          <div className="row" style={{ gap: 16 }}>
            <Avatar name={user?.username || '?'} url={user?.avatarUrl} size={72} />
            <div className="col" style={{ gap: 8 }}>
              <label className="btn sm">
                Changer d'avatar
                <input type="file" accept="image/*" hidden onChange={(e) => uploadAvatar(e.target.files[0])} />
              </label>
              {user?.avatarUrl ? (
                <button type="button" className="btn sm ghost" onClick={() => updateProfile({ avatarUrl: null })}>
                  Retirer
                </button>
              ) : null}
            </div>
          </div>
          <div className="field">
            <label>Pseudo</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="field">
            <label>Adresse e-mail</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn primary" disabled={busy}>
            Enregistrer
          </button>
        </form>

        <form className="card pad col" style={{ gap: 14 }} onSubmit={changePassword}>
          <h3>Mot de passe</h3>
          <div className="field">
            <label>Mot de passe actuel</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={passwords.currentPassword}
              onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Nouveau mot de passe</label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={passwords.newPassword}
              onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
              minLength={8}
              required
            />
          </div>
          <button type="submit" className="btn primary" disabled={busy}>
            Changer le mot de passe
          </button>
        </form>
      </main>
    </div>
  );
}
