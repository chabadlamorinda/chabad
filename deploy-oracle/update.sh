#!/usr/bin/env bash
# Update the running app to the latest code from GitHub:   sudo bash /opt/kiddush-src/deploy-oracle/update.sh
# (run from a git checkout of the repository; it copies the new files to /opt/kiddush and restarts the service)
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Please run with sudo."; exit 1; }
SRC="$(cd "$(dirname "$0")/.." && pwd)"
git -C "$SRC" pull --ff-only
rsync -a --delete --exclude node_modules --exclude .git "$SRC"/ /opt/kiddush/
chown -R kiddush:kiddush /opt/kiddush
(cd /opt/kiddush && sudo -u kiddush npm ci --omit=dev)
systemctl restart kiddush
sleep 2
systemctl is-active kiddush && curl -fsS http://127.0.0.1:3000/healthz && echo " updated and running"
