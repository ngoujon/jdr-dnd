#!/bin/sh
# Démarrage du conteneur API : schéma, ressources fournies, puis serveur.
set -e

echo "[tabletop] reprises de données avant synchronisation…"
node prisma/pre-push.js

echo "[tabletop] synchronisation du schéma de base…"
npx prisma db push --skip-generate --accept-data-loss

echo "[tabletop] reprises de données après synchronisation…"
node prisma/post-push.js

# L'installation des ressources fournies ne doit jamais empêcher l'API de démarrer.
if ! node prisma/seed.js; then
  echo "[tabletop] avertissement : ressources intégrées non installées, l'API démarre quand même"
fi

exec node src/index.js
