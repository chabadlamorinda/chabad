#!/usr/bin/env bash
# Deploy the latest code. Usage: update.sh [prod|staging] [git-ref]   (default: prod, the branch the checkout is on)
# Takes a backup first, installs, restarts, checks /healthz, and puts the old version back if it does not come up.
. "$(dirname "$0")/lib.sh"
INST="${1:-prod}"; REF="${2:-}"; load_env "$INST"
APP="/opt/baykosher/$INST/baykosher"; cd "$APP"
as() { if [ "$(id -u)" = 0 ]; then sudo -u baykosher "$@"; else "$@"; fi; }   # files belong to the baykosher user
as "$APP/deploy/backup.sh" "$INST"
OLD="$(as git rev-parse HEAD)"
as git fetch --quiet origin
if [ -n "$REF" ]; then as git checkout --quiet "$REF"; fi
as git pull --ff-only --quiet || true
as npm ci --omit=dev --silent
systemctl restart "baykosher@$INST"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then echo "updated $INST: $(as git rev-parse --short HEAD)"; exit 0; fi
  sleep 2
done
echo "new version did not start; going back to $OLD" >&2
as git checkout --quiet "$OLD"; as npm ci --omit=dev --silent; systemctl restart "baykosher@$INST"
exit 1
