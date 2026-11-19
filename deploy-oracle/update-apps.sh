#!/usr/bin/env bash
# Keeps the CRM (chabadlamorinda/chabad-crm) and Invitations (chabadlamorinda/invitations) apps up to date the way auto-update.sh keeps the
# website up to date: a new version on GitHub (branch main) is installed within seconds, and put back if the app does not start.
# It finds the apps by itself: every systemd service whose WorkingDirectory is a git clone of one of those two repositories.
#   update  (default)  one look at each app; installed if GitHub has something newer. Called by auto-update.sh every 10 seconds.
#   report             what it found (apps, folders, versions, whether GitHub can be reached, last updates): the maintenance action "apps-report".
# Settings for testing: SYSTEMD_DIR, SYSTEMCTL, NPM_CMD, STATE_DIR, APPS_LOG, APPS_BRANCH, APPS_REPOS_RE, SETTLE (seconds to wait after a restart).
set -uo pipefail
UNITDIR="${SYSTEMD_DIR:-/etc/systemd/system}"
SYSTEMCTL="${SYSTEMCTL:-systemctl}"
NPM="${NPM_CMD:-npm}"
STATE="${STATE_DIR:-/var/lib/website-maintenance}"
LOG="${APPS_LOG:-/var/log/website-auto-update.log}"
BRANCH="${APPS_BRANCH:-main}"
REPOS_RE="${APPS_REPOS_RE:-chabadlamorinda/(chabad-crm|invitations)(\.git)?$}"
SETTLE="${SETTLE:-6}"
MODE="${1:-update}"
mkdir -p "$STATE" 2>/dev/null

say() { echo "$(date -Is) apps: $*"; }
redact() { sed -E 's#(//)[^/@ ]+@#\1***@#g'; }
g() { local d="$1"; shift; git -c safe.directory='*' -C "$d" "$@"; }

# unit|folder|user|remote
discover() {
  local f wd root url user
  for f in "$UNITDIR"/*.service; do
    [ -f "$f" ] || continue
    wd="$(grep -E '^WorkingDirectory=' "$f" | head -1 | cut -d= -f2- | sed 's/^-//')"
    [ -n "$wd" ] && [ -d "$wd" ] || continue
    root="$(g "$wd" rev-parse --show-toplevel 2>/dev/null)" || continue
    url="$(g "$root" remote get-url origin 2>/dev/null)" || continue
    echo "$url" | grep -qE "$REPOS_RE" || continue
    user="$(grep -E '^User=' "$f" | head -1 | cut -d= -f2-)"
    echo "$(basename "$f")|$root|$user|$url"
  done
}

# Warn about a problem at most once an hour (this runs every 10 seconds).
warn_once() { local key="$1" msg="$2" mark="$STATE/apps-warned-$(echo "$1" | tr -c 'A-Za-z0-9' _)"; if [ ! -f "$mark" ] || [ -n "$(find "$mark" -mmin +60 2>/dev/null)" ]; then say "$msg" >> "$LOG"; touch "$mark"; fi; }

install_packages() { # folder, user: only when package-lock.json changed
  local dir="$1" owner; owner="$(stat -c %U "$dir" 2>/dev/null || echo root)"
  if [ "$owner" = root ]; then (cd "$dir" && $NPM ci --omit=dev) >/dev/null 2>&1; else (cd "$dir" && sudo -u "$owner" $NPM ci --omit=dev) >/dev/null 2>&1; fi
}

update_one() {
  local unit="$1" dir="$2" old new oldlock newlock
  if ! g "$dir" fetch --quiet origin "$BRANCH" 2>"$STATE/apps-fetch.err"; then
    warn_once "fetch-$dir" "$dir: cannot reach GitHub for updates ($(tr '\n' ' ' < "$STATE/apps-fetch.err" | redact | head -c 160)). The app keeps running as it is."
    return 0
  fi
  [ "$(g "$dir" rev-parse HEAD)" = "$(g "$dir" rev-parse FETCH_HEAD)" ] && return 0
  local failed="$STATE/apps-failed-$(echo "$dir" | tr -c 'A-Za-z0-9' _)"   # a version that did not start waits for a newer one
  [ "$(g "$dir" rev-parse FETCH_HEAD)" = "$(cat "$failed" 2>/dev/null)" ] && return 0
  old="$(g "$dir" rev-parse HEAD)"
  oldlock="$(sha256sum "$dir/package-lock.json" 2>/dev/null | cut -d' ' -f1)"
  {
    say "$dir: new version found: $(g "$dir" rev-parse --short FETCH_HEAD)"
    if ! g "$dir" merge --ff-only FETCH_HEAD >/dev/null 2>&1; then say "$dir: cannot be moved forward (changes on the server?): left as it is"; return 0; fi
    newlock="$(sha256sum "$dir/package-lock.json" 2>/dev/null | cut -d' ' -f1)"
    [ "$oldlock" != "$newlock" ] && install_packages "$dir"
    $SYSTEMCTL restart "$unit"; sleep "$SETTLE"
    if $SYSTEMCTL is-active --quiet "$unit"; then say "$dir: updated and running"; rm -f "$failed"
    else
      say "$dir: the new version did not start: going back to $(echo "$old" | cut -c1-7) (not tried again until a newer version is published)"
      g "$dir" rev-parse FETCH_HEAD > "$failed"
      g "$dir" reset --hard "$old" >/dev/null 2>&1
      [ "$oldlock" != "$newlock" ] && install_packages "$dir"
      $SYSTEMCTL restart "$unit"
    fi
  } >> "$LOG" 2>&1
}

if [ "$MODE" = report ]; then
  echo "== apps found (a service whose folder is a git clone of the CRM or Invitations)"
  found=0
  while IFS='|' read -r unit dir user url; do
    [ -n "$unit" ] || continue; found=1
    echo "- $unit: $dir (runs as ${user:-root}), from $(echo "$url" | redact)"
    echo "    version: $(g "$dir" log --oneline -1 2>&1 | cut -c1-110)"
    if g "$dir" fetch --quiet origin "$BRANCH" 2>"$STATE/apps-fetch.err"; then
      echo "    GitHub: reachable; newest on $BRANCH: $(g "$dir" log --oneline -1 FETCH_HEAD 2>&1 | cut -c1-110)"
    else echo "    GitHub: NOT reachable from here: $(tr '\n' ' ' < "$STATE/apps-fetch.err" | redact | head -c 200)"; fi
    echo "    service: $($SYSTEMCTL is-active "$unit" 2>&1)"
  done < <(discover)
  [ "$found" = 1 ] || echo "(none found: the apps may run some other way, for example docker or pm2)"
  echo "== web addresses served by Caddy"
  grep -E '^[A-Za-z0-9*].*\{|reverse_proxy' /etc/caddy/Caddyfile 2>/dev/null | tr -s '\t ' ' ' | head -20
  echo "== services that look like apps"
  $SYSTEMCTL list-units --type=service --no-pager --no-legend 2>/dev/null | grep -iE 'crm|invit|chabad|kiddush|node|pm2|docker' | awk '{print "- " $1 " " $3 " " $4}' | head -12
  echo "== last app updates"
  grep ' apps: ' "$LOG" 2>/dev/null | tail -n 6 | redact
  exit 0
fi

while IFS='|' read -r unit dir user url; do
  [ -n "$unit" ] && update_one "$unit" "$dir"
done < <(discover)
exit 0
