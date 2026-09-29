import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store.js';
import { Modal } from './Ui.jsx';

/**
 * Avertit les comptes issus des scripts de peuplement.
 *
 * Ces comptes sont crees pour essayer l'outil, avec des adresses et des mots de
 * passe que n'importe qui peut lire dans le depot. Certains joueurs s'en servent
 * pourtant comme compte de jeu : leur partie est alors accessible a qui connait
 * la valeur par defaut.
 *
 * L'avertissement revient a chaque connexion, et ne se referme que pour la
 * session en cours : il doit rester genant tant que l'adresse n'a pas change,
 * sinon il serait ecarte une fois puis oublie. Il disparait de lui-meme des que
 * l'utilisateur a change d'adresse, sans qu'il ait a s'en occuper.
 */
export function SeedIdentityNotice() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  // Un changement de compte remet l'avertissement en jeu : sans cela, une
  // deconnexion suivie d'une reconnexion le laisserait masque.
  useEffect(() => setDismissed(false), [user?.id]);

  if (!user?.usesSeedIdentity || dismissed) return null;

  return (
    <Modal
      open
      title="Ce compte utilise des identifiants de démonstration"
      onClose={() => setDismissed(true)}
      size="sm"
      footer={
        <>
          <button type="button" className="btn ghost" onClick={() => setDismissed(true)}>
            Plus tard
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setDismissed(true);
              navigate('/compte');
            }}
          >
            Modifier mon compte
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <p style={{ margin: 0 }}>
          Vous êtes connecté avec <strong>{user.email}</strong>, une adresse créée par les scripts
          d'installation pour découvrir l'outil.
        </p>
        <p style={{ margin: 0 }}>
          Ces comptes sont livrés avec des mots de passe connus : tant que vous gardez cette
          adresse, quelqu'un d'autre peut se connecter à votre place et lire vos personnages, vos
          notes et vos conversations privées.
        </p>
        <p className="faint" style={{ margin: 0 }}>
          Renseignez votre propre adresse e-mail et choisissez un nouveau mot de passe depuis la
          page « Mon compte ». Ce message disparaîtra tout seul.
        </p>
      </div>
    </Modal>
  );
}
