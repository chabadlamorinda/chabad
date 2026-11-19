#!/usr/bin/env bash
# Update the running app to the latest code from GitHub:   sudo bash /opt/website-src/deploy-oracle/update.sh
# (run from a git checkout of the repository; it copies the new files to /opt/kiddush and restarts the service).
# NO_PULL=1: do not fetch (the caller, auto-update.sh, already did).
# Packages are reinstalled only when package-lock.json changed (that is what made updates slow).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Please run with sudo."; exit 1; }
SRC="$(cd "$(dirname "$0")/.." && pwd)"
[ -n "${NO_PULL:-}" ] || git -C "$SRC" pull --ff-only
rsync -a --delete --exclude node_modules --exclude .git --exclude .lockhash "$SRC"/ /opt/kiddush/
chown -R kiddush:kiddush /opt/kiddush
NEW_HASH="$(sha256sum "$SRC/package-lock.json" | cut -d' ' -f1)"; OLD_HASH="$(cat /opt/kiddush/.lockhash 2>/dev/null || true)"
if [ "$NEW_HASH" != "$OLD_HASH" ] || [ ! -d /opt/kiddush/node_modules ]; then
  (cd /opt/kiddush && sudo -u kiddush npm ci --omit=dev) && echo "$NEW_HASH" > /opt/kiddush/.lockhash
fi
systemctl restart kiddush
# the app opens its own main pages before it says "ok", so give it up to 40 seconds
for i in $(seq 1 40); do
  sleep 1
  if curl -fsS --max-time 10 http://127.0.0.1:3000/healthz 2>/dev/null | grep -q ok; then echo " updated and running"; exit 0; fi
done
echo "The app did not answer after the update."; systemctl status kiddush --no-pager | tail -5; exit 1
