import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/store.js';
import { Spinner } from './components/Ui.jsx';
import { AuthPage } from './pages/Auth.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { TablePage } from './pages/Table.jsx';
import { PrepPage } from './pages/Prep.jsx';
import { CharactersPage } from './pages/Characters.jsx';
import { AccountPage } from './pages/Account.jsx';

function Protected({ children }) {
  const status = useAuth((s) => s.status);
  const location = useLocation();
  if (status === 'loading') return <Spinner label="Ouverture de la table…" />;
  if (status !== 'authenticated') return <Navigate to="/connexion" state={{ from: location }} replace />;
  return children;
}

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap);
  const status = useAuth((s) => s.status);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <Routes>
      <Route
        path="/connexion"
        element={status === 'authenticated' ? <Navigate to="/" replace /> : <AuthPage mode="login" />}
      />
      <Route
        path="/inscription"
        element={status === 'authenticated' ? <Navigate to="/" replace /> : <AuthPage mode="register" />}
      />
      <Route
        path="/"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/personnages"
        element={
          <Protected>
            <CharactersPage />
          </Protected>
        }
      />
      <Route
        path="/compte"
        element={
          <Protected>
            <AccountPage />
          </Protected>
        }
      />
      <Route
        path="/campagne/:campaignId"
        element={
          <Protected>
            <TablePage />
          </Protected>
        }
      />
      <Route
        path="/campagne/:campaignId/preparation"
        element={
          <Protected>
            <PrepPage />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
