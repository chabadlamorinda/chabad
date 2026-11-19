#!/usr/bin/env bash
# Keeps the server up to date by itself (like Render did): every few minutes it checks GitHub for a newer version of the website and,
# if there is one, installs it. If the new version does not start, the old one is put back. Installed by install.sh as /etc/cron.d/website-auto-update.
# Run by hand:   sudo bash /opt/website-src/deploy-oracle/auto-update.sh
set -uo pipefail
SRC=/opt/website-src          # a git copy of the repository (made by install.sh)
BRANCH="${DEPLOY_BRANCH:-claude/github-render-site-guide-94hral}"
LOG=/var/log/website-auto-update.log
cd "$SRC" || exit 1
git fetch --quiet origin "$BRANCH" || exit 0
[ "$(git rev-parse HEAD)" = "$(git rev-parse FETCH_HEAD)" ] && exit 0
OLD="$(git rev-parse HEAD)"
{
  echo "$(date -Is) new version found: $(git rev-parse --short FETCH_HEAD)"
  git reset --hard FETCH_HEAD
  if ! NO_PULL=1 bash deploy-oracle/update.sh; then
    echo "$(date -Is) the new version did not start: going back to $(echo "$OLD" | cut -c1-7)"
    git reset --hard "$OLD"
    NO_PULL=1 bash deploy-oracle/update.sh
  fi
} >> "$LOG" 2>&1
