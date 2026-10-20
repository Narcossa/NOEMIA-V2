#!/usr/bin/env bash
# Installation de NOÉMIA sur le VPS Ubuntu (à lancer avec sudo depuis le dossier du dépôt cloné).
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "› Paquets système (Node.js 24, Caddy)"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(`.`)[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

echo "› Utilisateur et dossiers"
id noemia >/dev/null 2>&1 || useradd --system --home /var/lib/noemia --shell /usr/sbin/nologin noemia
mkdir -p /var/lib/noemia /opt/noemia
chown noemia:noemia /var/lib/noemia
rsync -a --delete --exclude node_modules --exclude .env "$REPO_DIR/server/" /opt/noemia/server/
cd /opt/noemia/server && npm ci --omit=dev --no-audit --no-fund

if [ ! -f /opt/noemia/server/.env ]; then
  cp .env.example .env
  sed -i "s|^SECRET_KEY=.*|SECRET_KEY=$(openssl rand -base64 32)|" .env
  echo "⚠ Complète /opt/noemia/server/.env (clés Google et Anthropic) puis relance : sudo systemctl restart noemia"
fi
chown root:noemia .env && chmod 640 .env

echo "› Services"
cp "$REPO_DIR/deploy/noemia.service" /etc/systemd/system/noemia.service
cp "$REPO_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now noemia
systemctl reload caddy || systemctl restart caddy
ufw allow 80,443/tcp >/dev/null 2>&1 || true

echo "✓ Terminé. Test : curl https://vps-1d994dff.vps.ovh.ca/health"
