#!/usr/bin/env bash
# One-time server setup for Ubuntu 22.04/24.04 (works on Oracle Ampere ARM and on x86).
# Run as root:  REPO_URL=git@github.com:chabadlamorinda/chabad.git BRANCH=main bash setup.sh
# Safe to run again: it never overwrites an existing env file or database.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 1; }
REPO_URL="${REPO_URL:?set REPO_URL (the git address of the repository)}"
BRANCH="${BRANCH:-main}"
STAGING="${STAGING:-1}"            # 1 = also set up the test copy on port 3001
export DEBIAN_FRONTEND=noninteractive

echo "== packages"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git postgresql postgresql-client rclone debian-keyring debian-archive-keyring apt-transport-https iptables-persistent >/dev/null
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null; apt-get install -y -qq nodejs >/dev/null
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sed 's#^deb #deb [signed-by=/usr/share/keyrings/caddy.gpg] #' > /etc/apt/sources.list.d/caddy.list
  apt-get update -qq; apt-get install -y -qq caddy >/dev/null
fi
timedatectl set-timezone America/Los_Angeles || true   # backups and timers run on store time

echo "== user and folders"
id baykosher >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin baykosher
install -d -m 750 -o root -g baykosher /etc/baykosher
install -d -m 750 -o baykosher -g baykosher /var/backups/baykosher /opt/baykosher

echo "== database"
sudo -u postgres psql -qtc "SELECT 1 FROM pg_roles WHERE rolname='baykosher'" | grep -q 1 || {
  DBPW="$(openssl rand -hex 20)"; echo "$DBPW" > /etc/baykosher/.dbpw; chmod 640 /etc/baykosher/.dbpw; chgrp baykosher /etc/baykosher/.dbpw
  sudo -u postgres psql -qc "CREATE ROLE baykosher LOGIN CREATEDB PASSWORD '$DBPW'"
}
DBPW="$(cat /etc/baykosher/.dbpw)"
INSTANCES="prod"; [ "$STAGING" = 1 ] && INSTANCES="prod staging"
for inst in $INSTANCES; do
  db=baykosher; [ "$inst" = staging ] && db=baykosher_staging
  sudo -u postgres psql -qtc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 || sudo -u postgres createdb -O baykosher "$db"
done

echo "== code and settings"
SRC="$(cd "$(dirname "$0")" && pwd)"
for inst in $INSTANCES; do
  dir=/opt/baykosher/$inst
  if [ ! -d "$dir/.git" ]; then sudo -u baykosher git clone --quiet --branch "$BRANCH" "$REPO_URL" "$dir"; fi
  (cd "$dir/baykosher" && sudo -u baykosher npm ci --omit=dev --silent)
  envf=/etc/baykosher/$inst.env
  if [ ! -f "$envf" ]; then
    cp "$dir/baykosher/deploy/env.$inst.example" "$envf"
    db=baykosher; [ "$inst" = staging ] && db=baykosher_staging
    sed -i "s#CHANGE_ME_DB_PASSWORD#$DBPW#; s#CHANGE_ME_64_RANDOM_CHARS#$(openssl rand -hex 32)#; s#CHANGE_ME_ANOTHER_64_RANDOM_CHARS#$(openssl rand -hex 32)#; s#^PICKER_PIN=CHANGE_ME#PICKER_PIN=$(shuf -i 100000-999999 -n1)#" "$envf"
    # the admin password is generated and shown once; you can change it in the file
    ADMINPW="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
    sed -i "s#^ADMIN_PASSWORD=.*#ADMIN_PASSWORD=$ADMINPW#" "$envf"
    echo "   $inst: admin password is $ADMINPW   (saved in $envf)"
  fi
  chown root:baykosher "$envf"; chmod 640 "$envf"
done
chmod 640 /etc/baykosher/.dbpw

echo "== services"
cp "$SRC/baykosher@.service" /etc/systemd/system/baykosher@.service
for inst in $INSTANCES; do systemctl enable --now "baykosher@$inst"; done

cat > /etc/systemd/system/baykosher-backup.service <<UNIT
[Unit]
Description=Bay Kosher database backup
[Service]
Type=oneshot
User=baykosher
ExecStart=/opt/baykosher/prod/baykosher/deploy/backup.sh prod
UNIT
cat > /etc/systemd/system/baykosher-backup.timer <<'UNIT'
[Unit]
Description=Nightly Bay Kosher backup
[Timer]
OnCalendar=*-*-* 03:15:00
RandomizedDelaySec=300
Persistent=true
[Install]
WantedBy=timers.target
UNIT
cat > /etc/systemd/system/baykosher-verify.service <<UNIT
[Unit]
Description=Bay Kosher backup restore test
[Service]
Type=oneshot
User=baykosher
ExecStart=/opt/baykosher/prod/baykosher/deploy/verify-backup.sh prod
UNIT
cat > /etc/systemd/system/baykosher-verify.timer <<'UNIT'
[Unit]
Description=Weekly proof that backups restore
[Timer]
OnCalendar=Sun *-*-* 05:00:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now baykosher-backup.timer baykosher-verify.timer

echo "== firewall (Oracle images block everything but SSH by default)"
for p in 80 443; do iptables -C INPUT -p tcp --dport $p -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -p tcp --dport $p -j ACCEPT; done
netfilter-persistent save >/dev/null

echo
echo "Done. Remaining by hand (see deploy/README.md):"
echo "  1. Oracle console: open ports 80 and 443 in the subnet's Security List."
echo "  2. Put the real service keys in /etc/baykosher/prod.env, then: systemctl restart baykosher@prod"
echo "  3. Copy deploy/Caddyfile.example to /etc/caddy/Caddyfile, edit the names, then: systemctl reload caddy"
echo "  4. Set up off-server backups:  sudo -u baykosher rclone config   then set BACKUP_REMOTE in prod.env"
