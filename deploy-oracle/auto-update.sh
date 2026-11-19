#!/usr/bin/env bash
# Keeps the server up to date by itself (like Render did): it checks GitHub for a newer version of the website every 10 seconds
# and, if there is one, installs it (about 20 to 30 seconds from the push to live). If the new version does not start, the old
# one is put back. After each look it runs any maintenance requests that have not run yet (deploy-oracle/maintenance.sh).
# Started every minute by cron (/etc/cron.d/website-auto-update, with flock so two never run together); each run keeps
# watching for about 55 seconds, so a push is picked up within 10 seconds.
# Run once by hand:   sudo ONCE=1 bash /opt/website-src/deploy-oracle/auto-update.sh
set -uo pipefail
SRC=/opt/website-src          # a git copy of the repository (made by install.sh)
BRANCH="${DEPLOY_BRANCH:-claude/github-render-site-guide-94hral}"
LOG=/var/log/website-auto-update.log
cd "$SRC" || exit 1

STATE="${STATE_DIR:-/var/lib/website-maintenance}"; mkdir -p "$STATE" 2>/dev/null
FAILED="$STATE/failed-sha"   # a version that did not start is not tried again until a newer one is published

check_once() {
  git fetch --quiet origin "$BRANCH" || return 0
  if [ "$(git rev-parse HEAD)" != "$(git rev-parse FETCH_HEAD)" ] && [ "$(git rev-parse FETCH_HEAD)" != "$(cat "$FAILED" 2>/dev/null)" ]; then
    local OLD NEW; OLD="$(git rev-parse HEAD)"; NEW="$(git rev-parse FETCH_HEAD)"
    {
      echo "$(date -Is) new version found: $(git rev-parse --short FETCH_HEAD)"
      git reset --hard FETCH_HEAD
      if NO_PULL=1 bash deploy-oracle/update.sh; then rm -f "$FAILED"
      else
        echo "$(date -Is) the new version did not start: going back to $(echo "$OLD" | cut -c1-7) (it will not be tried again until a newer version is published)"
        echo "$NEW" > "$FAILED"
        git reset --hard "$OLD"
        NO_PULL=1 bash deploy-oracle/update.sh
      fi
      echo "$(date -Is) done"
    } >> "$LOG" 2>&1
  fi
  # the CRM and Invitations apps: same idea, from their own GitHub repositories (deploy-oracle/update-apps.sh)
  bash deploy-oracle/update-apps.sh update >> "$LOG" 2>&1
  # maintenance requests (restart, updates, disk clean-up...) that Claude added for the server
  bash deploy-oracle/maintenance.sh >> "$LOG" 2>&1
}

if [ -n "${ONCE:-}" ]; then check_once; exit 0; fi
for i in 1 2 3 4 5; do
  check_once
  [ "$i" -lt 5 ] && sleep 10
done
exit 0
