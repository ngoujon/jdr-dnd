#!/bin/sh
# Démarrage du conteneur API : schéma, ressources fournies, puis serveur.
set -e

echo "[tabletop] synchronisation du schéma de base…"
npx prisma db push --skip-generate --accept-data-loss

# L'installation des ressources fournies ne doit jamais empêcher l'API de démarrer.
if ! node prisma/seed.js; then
  echo "[tabletop] avertissement : ressources intégrées non installées, l'API démarre quand même"
fi

exec node src/index.js
