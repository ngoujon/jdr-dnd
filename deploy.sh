#!/bin/sh
# Déploiement en production : reconstruit les images sans cache et redémarre
# les conteneurs, pour être certain qu'aucun bundle ou couche Docker périmée
# ne reste en place. Le numéro affiché dans l'en-tête de l'appli vient du
# commit git courant, ce qui permet de vérifier d'un coup d'œil que la
# version déployée correspond bien au dernier code poussé.
set -e

cd "$(dirname "$0")"

export VITE_APP_VERSION="$(git rev-parse --short HEAD)-$(git log -1 --format=%cd --date=format:'%Y%m%d%H%M')"

echo "[deploy] version : $VITE_APP_VERSION"
echo "[deploy] reconstruction complète (sans cache)…"
docker compose build --no-cache

echo "[deploy] redémarrage des conteneurs…"
docker compose up -d --force-recreate

echo "[deploy] terminé."
docker compose ps
