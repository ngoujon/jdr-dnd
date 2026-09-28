#!/bin/sh
# Deploiement de la production (VPS OVH), a lancer depuis le poste de dev.
#
# Le repertoire distant n'est pas un depot git : les sources y sont copiees par
# rsync depuis le poste, puis les images Docker sont reconstruites sur place.
#
# Le script refuse de partir si le depot local n'est pas propre et pousse : le
# numero de version affiche dans l'en-tete de l'appli vient du commit courant,
# il doit donc correspondre a quelque chose de reellement present sur origin.
#
# A la fin, la version reellement servie par l'URL publique est comparee au
# commit deploye. Sans cette verification, un deploiement peut sembler reussi
# alors que le navigateur recoit encore l'ancien bundle.
#
#   ./scripts/deploy-prod.sh
#
# L'authentification se fait par cle SSH (hote "mon-serveur" de ~/.ssh/config).
# Aucun mot de passe n'est stocke ici.
set -e

SSH_HOST="${PROD_SSH_HOST:-mon-serveur}"
REMOTE_DIR="${PROD_DIR:-/chemin/vers/table-ronde}"
PROD_URL="${PROD_URL:-http://serveur.exemple.test/jdr/}"

cd "$(dirname "$0")/.."

# --- Verifications locales -------------------------------------------------

if [ -n "$(git status --porcelain)" ]; then
  echo "[deploy-prod] ERREUR : des modifications ne sont pas commitees." >&2
  git status --short >&2
  exit 1
fi

git fetch --quiet origin
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ -n "$(git log --oneline "origin/$BRANCH..HEAD")" ]; then
  echo "[deploy-prod] ERREUR : des commits ne sont pas pousses sur origin/$BRANCH." >&2
  exit 1
fi

VERSION="$(git rev-parse --short HEAD)-$(git log -1 --format=%cd --date=format:'%Y%m%d%H%M')"
echo "[deploy-prod] version    : $VERSION"
echo "[deploy-prod] destination: $SSH_HOST:$REMOTE_DIR"

# --- Copie des sources -----------------------------------------------------

# --delete retire du serveur les fichiers supprimes ici, sinon un ancien module
# continue d'etre compile dans le bundle. Les chemins exclus sont, de ce fait,
# aussi proteges de la suppression : la configuration et les fichiers
# televerses en production ne sont jamais touches.
echo "[deploy-prod] copie des sources…"
rsync -az --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.env' \
  --exclude='.env.bak-*' \
  --exclude='uploads/' \
  ./ "$SSH_HOST:$REMOTE_DIR/"

# --- Reconstruction et redemarrage ----------------------------------------

echo "[deploy-prod] reconstruction complète (sans cache)…"
ssh "$SSH_HOST" "cd '$REMOTE_DIR' \
  && export VITE_APP_VERSION='$VERSION' \
  && docker compose build --no-cache \
  && docker compose up -d --force-recreate \
  && docker compose ps"

# --- Verification ----------------------------------------------------------

echo "[deploy-prod] vérification de la version servie par $PROD_URL"
ASSET="$(curl -fsS "$PROD_URL" | grep -o 'assets/index-[^"]*\.js' | head -1)"
if [ -z "$ASSET" ]; then
  echo "[deploy-prod] ERREUR : aucun bundle référencé par la page publique." >&2
  exit 1
fi

SERVED="$(curl -fsS "${PROD_URL%/}/$ASSET" | grep -o '[0-9a-f]\{7\}-20[0-9]\{10\}' | head -1)"
if [ "$SERVED" != "$VERSION" ]; then
  echo "[deploy-prod] ERREUR : la production sert « $SERVED », attendu « $VERSION »." >&2
  exit 1
fi

echo "[deploy-prod] terminé — $PROD_URL sert bien $VERSION."
