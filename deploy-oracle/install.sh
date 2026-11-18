#!/usr/bin/env bash
# Installs the Kiddush board on a fresh Ubuntu (22.04 or 24.04) server: Node 22, Postgres, Caddy (automatic https), a systemd service,
# a nightly database backup and a basic firewall. Safe to run again (it skips what is already done).
#
# Run as root on the server:   sudo bash deploy-oracle/install.sh
# It asks for: the web address to use, the staff password, and (optional) the Stripe keys. Nothing secret is stored in the repository:
# the secrets go in /etc/kiddush.env (readable only by root and the service).
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "Please run with sudo:  sudo bash $0"; exit 1; }
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR=/opt/kiddush
ENV_FILE=/etc/kiddush.env

say() { printf '\n==> %s\n' "$*"; }
ask() { local v; read -r -p "$1 " v; echo "$v"; }

say "1/8  Checking the operating system"
. /etc/os-release
case "$ID" in ubuntu|debian) ;; *) echo "This script is written for Ubuntu/Debian (you have: $PRETTY_NAME). Ask Claude to adapt it (dnf instead of apt for Oracle Linux)."; exit 1;; esac

say "2/8  Installing Node 22, Postgres, Caddy and tools"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git ufw rsync postgresql debian-keyring debian-archive-keyring apt-transport-https
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y && apt-get install -y caddy
fi

say "3/8  Creating the database (local only, never exposed to the internet)"
systemctl enable --now postgresql
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='kiddush'" | grep -q 1; then
  DB_PASS="$(openssl rand -hex 24)"
  sudo -u postgres psql -c "CREATE ROLE kiddush LOGIN PASSWORD '${DB_PASS}'"
  sudo -u postgres createdb -O kiddush kiddush
  NEW_DB_URL="postgres://kiddush:${DB_PASS}@127.0.0.1:5432/kiddush"
else
  NEW_DB_URL=""
  echo "Database role already exists; keeping the existing DATABASE_URL in ${ENV_FILE}."
fi

say "4/8  Copying the app to ${APP_DIR}"
id kiddush >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin kiddush
mkdir -p "$APP_DIR"
rsync -a --delete --exclude node_modules --exclude .git "$REPO_DIR"/ "$APP_DIR"/
chown -R kiddush:kiddush "$APP_DIR"
(cd "$APP_DIR" && sudo -u kiddush npm ci --omit=dev)

say "5/8  Settings and secrets (${ENV_FILE})"
if [ ! -f "$ENV_FILE" ]; then
  ADMIN_PW=""
  while [ "${#ADMIN_PW}" -lt 12 ]; do ADMIN_PW="$(ask 'Choose the staff-page password (12 or more characters):')"; done
  SK="$(ask 'Stripe SECRET key (sk_test_... or sk_live_...), or press Enter to skip card payments for now:')"
  PK=""; WH=""
  if [ -n "$SK" ]; then PK="$(ask 'Stripe PUBLISHABLE key (pk_...):')"; WH="$(ask 'Stripe webhook signing secret (whsec_...), or Enter if not created yet:')"; fi
  umask 077
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3000
SESSION_SECRET=$(openssl rand -hex 32)
DATABASE_URL=${NEW_DB_URL}
ADMIN_PASSWORD=${ADMIN_PW}
STRIPE_SECRET_KEY=${SK}
STRIPE_PUBLISHABLE_KEY=${PK}
STRIPE_WEBHOOK_SECRET=${WH}
SMTP_URL=
MAIL_FROM=
EOF
  chown root:kiddush "$ENV_FILE"; chmod 640 "$ENV_FILE"
else
  echo "${ENV_FILE} already exists: leaving it alone (edit it by hand to change a secret)."
fi

say "6/8  The service (starts at boot, restarts if it stops)"
cat > /etc/systemd/system/kiddush.service <<'EOF'
[Unit]
Description=Kiddush board
After=network.target postgresql.service
Wants=postgresql.service
[Service]
User=kiddush
WorkingDirectory=/opt/kiddush
EnvironmentFile=/etc/kiddush.env
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable kiddush
systemctl restart kiddush

say "7/8  Secure web address (Caddy gets and renews the https certificate by itself)"
HOST="${KIDDUSH_HOST:-}"
if [ -z "$HOST" ]; then
  IP="$(curl -fsS https://api.ipify.org || true)"
  SUGGEST="$(echo "$IP" | tr . -).sslip.io"
  echo "Your server's public address is ${IP:-unknown}."
  echo "Use either your own name (for example kiddush.chabadoflamorinda.com, once its DNS 'A' record points to ${IP:-this server}),"
  echo "or the free name ${SUGGEST} which works right away."
  HOST="$(ask "Web address to use [${SUGGEST}]:")"; HOST="${HOST:-$SUGGEST}"
fi
cat > /etc/caddy/Caddyfile <<EOF
${HOST} {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
EOF
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

say "8/8  Nightly backup and firewall"
mkdir -p /var/backups/kiddush
cat > /etc/cron.d/kiddush-backup <<'EOF'
# every night at 03:15: dump the database, keep the last 30
15 3 * * * root sudo -u postgres pg_dump -Fc kiddush > /var/backups/kiddush/kiddush-$(date +\%F).dump && find /var/backups/kiddush -name '*.dump' -mtime +30 -delete
EOF
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

cat <<EOF

Done.

  TV display:     https://${HOST}/kiddush/tv/
  Sponsor page:   https://${HOST}/kiddush/
  Staff page:     https://${HOST}/admin/kiddush/

Next steps (see deploy-oracle/README.md):
  * In the Oracle Cloud console, allow ports 80 and 443 in the instance's network security list (this script only opens the server's own firewall).
  * Copy your existing sponsors across:  see deploy-oracle/README.md, "Move your data from Neon".
  * Point Stripe's webhook to https://${HOST}/api/stripe/webhook, and the TV (Fully Kiosk) and the website forward to the new address.
Check the app:  systemctl status kiddush     Logs:  journalctl -u kiddush -n 50
EOF
