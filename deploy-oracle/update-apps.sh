#!/usr/bin/env bash
# Keeps the CRM (chabadlamorinda/chabad-crm) and Invitations (chabadlamorinda/invitations) apps up to date the way auto-update.sh keeps the
# website up to date: a new version on GitHub (branch main) is installed within seconds, and put back if the app does not start.
# It finds the apps by itself: every systemd service whose folder (WorkingDirectory, or a path in its start command) is a git clone of
# one of those two repositories. A service named crm* / invit* whose folder is NOT yet linked to GitHub is linked (the code there is
# replaced by GitHub's, data files stay), as soon as a GitHub key is saved in the Rabbi area (Keys and settings, GITHUB_APPS_TOKEN):
# the two repositories are private, so the server needs a read-only key.
#   update  (default)  one look at each app; installed if GitHub has something newer. Called by auto-update.sh every 10 seconds.
#   report             what it found (apps, folders, versions, whether GitHub can be reached, last updates): the maintenance action "apps-report".
# Settings for testing: SYSTEMD_DIR, SYSTEMCTL, NPM_CMD, STATE_DIR, APPS_LOG, APPS_BRANCH, APPS_REPOS_RE, APPS_GITHUB_BASE, GITHUB_APPS_TOKEN, SETTLE.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
UNITDIR="${SYSTEMD_DIR:-/etc/systemd/system}"
SYSTEMCTL="${SYSTEMCTL:-systemctl}"
NPM="${NPM_CMD:-npm}"
STATE="${STATE_DIR:-/var/lib/website-maintenance}"
LOG="${APPS_LOG:-/var/log/website-auto-update.log}"
BRANCH="${APPS_BRANCH:-main}"
REPOS_RE="${APPS_REPOS_RE:-chabadlamorinda/(chabad-crm|invitations)(\.git)?$}"
GH_BASE="${APPS_GITHUB_BASE:-https://github.com/chabadlamorinda}"
SETTLE="${SETTLE:-6}"
MODE="${1:-update}"
TOKEN=""
mkdir -p "$STATE" 2>/dev/null

say() { echo "$(date -Is) apps: $*"; }
redact() { sed -E 's#(//)[^/@ ]+@#\1***@#g'; }
g() { local d="$1"; shift; git -c safe.directory='*' -C "$d" "$@"; }
repo_for_unit() { case "$1" in *crm*) echo chabad-crm;; *invit*) echo invitations;; esac; }

# The read-only GitHub key saved in the Rabbi area is read from the website's database (decrypted by get-token.js) at most every 5 minutes.
load_token() {
  if [ -n "${GITHUB_APPS_TOKEN:-}" ]; then TOKEN="$GITHUB_APPS_TOKEN"; return; fi
  local file="$STATE/github-apps-token"
  if [ ! -f "$file" ] || [ -n "$(find "$file" -mmin +5 2>/dev/null)" ]; then
    ( umask 077; if node "$HERE/get-token.js" > "$file.tmp" 2>/dev/null; then mv "$file.tmp" "$file"; else rm -f "$file.tmp"; : > "$file"; fi )
  fi
  TOKEN="$(cat "$file" 2>/dev/null)"
}
# git with the key, when there is one (passed in the environment, not on the command line)
ga() {
  if [ -n "$TOKEN" ] && [[ "$GH_BASE" == https://github.com* ]]; then
    GIT_TERMINAL_PROMPT=0 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.https://github.com/.extraheader GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)" g "$@"
  else GIT_TERMINAL_PROMPT=0 g "$@"; fi
}

# The folders an app runs from: its WorkingDirectory, a path inside its start command (ExecStart), or its environment file's folder.
folders_of() { # unit file
  local f="$1" wd tok
  wd="$(grep -E '^WorkingDirectory=' "$f" | head -1 | cut -d= -f2- | sed 's/^-//')"
  [ -n "$wd" ] && echo "$wd"
  for tok in $(grep -E '^(ExecStart|ExecStartPre|EnvironmentFile)=' "$f" | sed -E 's/^[A-Za-z]+=//; s/^[-@+!]+//' | tr ' ' '\n' | grep '^/'); do
    [ -e "$tok" ] || continue
    [ -d "$tok" ] && echo "$tok" || dirname "$tok"
  done
}

# unit|folder|user|remote   (apps already linked to their GitHub repository)
discover() {
  local f wd root url user seen=""
  for f in "$UNITDIR"/*.service; do
    [ -f "$f" ] || continue
    while IFS= read -r wd; do
      [ -n "$wd" ] && [ -d "$wd" ] || continue
      root="$(g "$wd" rev-parse --show-toplevel 2>/dev/null)" || continue
      url="$(g "$root" remote get-url origin 2>/dev/null)" || continue
      echo "$url" | grep -qE "$REPOS_RE" || continue
      case "$seen" in *"|$f|"*) continue;; esac; seen="$seen|$f|"
      user="$(grep -E '^User=' "$f" | head -1 | cut -d= -f2-)"
      echo "$(basename "$f")|$root|$user|$url"
    done < <(folders_of "$f")
  done
}

# For the report: every service that looks like the CRM or Invitations, recognized or not, with what it runs and where.
candidates() {
  local f wd
  for f in "$UNITDIR"/*.service; do
    [ -f "$f" ] || continue
    echo "$(basename "$f")" | grep -qiE 'crm|invit' || continue
    echo "- $(basename "$f")"
    grep -E '^(User|WorkingDirectory|ExecStart|EnvironmentFile)=' "$f" | redact | sed 's/^/    /' | cut -c1-170
    while IFS= read -r wd; do
      [ -d "$wd" ] || continue
      echo "    folder $wd: $(ls -A "$wd" 2>/dev/null | head -14 | tr '\n' ' ')"
      echo "    git: $(g "$wd" rev-parse --show-toplevel 2>&1 | head -c 100); remote: $(g "$wd" remote get-url origin 2>&1 | redact | head -c 100)"
    done < <(folders_of "$f" | sort -u | head -3)
  done
}

# Warn about a problem at most once an hour (this runs every 10 seconds).
warn_once() { local mark="$STATE/apps-warned-$(echo "$1" | tr -c 'A-Za-z0-9' _)"; if [ ! -f "$mark" ] || [ -n "$(find "$mark" -mmin +60 2>/dev/null)" ]; then say "$2" >> "$LOG"; touch "$mark"; fi; }

install_packages() { # folder: only when package-lock.json changed
  local dir="$1" owner; owner="$(stat -c %U "$dir" 2>/dev/null || echo root)"
  if [ "$owner" = root ]; then (cd "$dir" && $NPM ci --omit=dev) >/dev/null 2>&1; else (cd "$dir" && sudo -u "$owner" $NPM ci --omit=dev) >/dev/null 2>&1; fi
}

# restart the service and see that it stays up
restart_ok() { $SYSTEMCTL restart "$1"; sleep "$SETTLE"; $SYSTEMCTL is-active --quiet "$1"; }

update_one() {
  local unit="$1" dir="$2" old oldlock newlock failed
  if ! ga "$dir" fetch --quiet origin "$BRANCH" 2>"$STATE/apps-fetch.err"; then
    warn_once "fetch-$dir" "$dir: cannot reach GitHub for updates ($(tr '\n' ' ' < "$STATE/apps-fetch.err" | redact | head -c 160)). To fix: save a read-only GitHub key in the Rabbi area (Keys and settings, 'GitHub key for the CRM and Invitations'). The app keeps running as it is."
    return 0
  fi
  [ "$(g "$dir" rev-parse HEAD)" = "$(g "$dir" rev-parse FETCH_HEAD)" ] && return 0
  failed="$STATE/apps-failed-$(echo "$dir" | tr -c 'A-Za-z0-9' _)"   # a version that did not start waits for a newer one
  [ "$(g "$dir" rev-parse FETCH_HEAD)" = "$(cat "$failed" 2>/dev/null)" ] && return 0
  old="$(g "$dir" rev-parse HEAD)"
  oldlock="$(sha256sum "$dir/package-lock.json" 2>/dev/null | cut -d' ' -f1)"
  {
    say "$dir: new version found: $(g "$dir" rev-parse --short FETCH_HEAD)"
    if ! g "$dir" merge --ff-only FETCH_HEAD >/dev/null 2>&1; then say "$dir: cannot be moved forward (changes on the server?): left as it is"; return 0; fi
    newlock="$(sha256sum "$dir/package-lock.json" 2>/dev/null | cut -d' ' -f1)"
    [ "$oldlock" != "$newlock" ] && install_packages "$dir"
    if restart_ok "$unit"; then say "$dir: updated and running"; rm -f "$failed"
    else
      say "$dir: the new version did not start: going back to $(echo "$old" | cut -c1-7) (not tried again until a newer version is published)"
      g "$dir" rev-parse FETCH_HEAD > "$failed"
      g "$dir" reset --hard "$old" >/dev/null 2>&1
      [ "$oldlock" != "$newlock" ] && install_packages "$dir"
      $SYSTEMCTL restart "$unit"
    fi
  } >> "$LOG" 2>&1
}

# A service named crm* / invit* whose code is a plain copy (not linked to GitHub): link it, with the key.
adopt_one() {
  local unit="$1" repo wd dir="" f="$UNITDIR/$1" old=""
  repo="$(repo_for_unit "$unit")"; [ -n "$repo" ] || return 0
  while IFS= read -r wd; do
    while [ -n "$wd" ] && [ "$wd" != / ]; do [ -f "$wd/package.json" ] && { dir="$wd"; break 2; }; wd="$(dirname "$wd")"; done
  done < <(folders_of "$f")
  [ -n "$dir" ] || { warn_once "nodir-$unit" "$unit: cannot tell which folder its code is in."; return 0; }
  [ -n "$TOKEN" ] || [[ "$GH_BASE" != https://github.com* ]] || { warn_once "adopt-$unit" "$unit runs from $dir, which is not linked to GitHub yet, so it cannot be updated by itself. To fix: save a read-only GitHub key in the Rabbi area (Keys and settings, 'GitHub key for the CRM and Invitations apps'); it is then linked within seconds."; return 0; }
  {
    say "$unit: linking $dir to GitHub ($repo)"
    g "$dir" rev-parse --git-dir >/dev/null 2>&1 && [ "$(g "$dir" rev-parse --show-toplevel 2>/dev/null)" = "$dir" ] || g "$dir" init -q
    g "$dir" remote remove origin >/dev/null 2>&1; g "$dir" remote add origin "$GH_BASE/$repo.git"
    if ! ga "$dir" fetch --quiet --depth 20 origin "$BRANCH" 2>"$STATE/apps-fetch.err"; then say "$dir: cannot download $repo ($(tr '\n' ' ' < "$STATE/apps-fetch.err" | redact | head -c 160)); is the key allowed to read it?"; return 0; fi
    g "$dir" reset --hard FETCH_HEAD >/dev/null 2>&1 && g "$dir" checkout -q -B "$BRANCH" 2>/dev/null
    install_packages "$dir"
    if restart_ok "$unit"; then say "$dir: linked to GitHub, updated to $(g "$dir" log --oneline -1 | cut -c1-80) and running"; else say "$dir: restarted after linking but the service is not active: check it ('apps-report')"; fi
  } >> "$LOG" 2>&1
}

if [ "$MODE" = report ]; then
  load_token
  echo "== GitHub key for the apps (Keys and settings): $([ -n "$TOKEN" ] && echo saved || echo 'not saved yet')"
  echo "== apps found (a service whose folder is a git clone of the CRM or Invitations)"
  found=0
  while IFS='|' read -r unit dir user url; do
    [ -n "$unit" ] || continue; found=1
    echo "- $unit: $dir (runs as ${user:-root}), from $(echo "$url" | redact)"
    echo "    version: $(g "$dir" log --oneline -1 2>&1 | cut -c1-110)"
    if ga "$dir" fetch --quiet origin "$BRANCH" 2>"$STATE/apps-fetch.err"; then
      echo "    GitHub: reachable; newest on $BRANCH: $(g "$dir" log --oneline -1 FETCH_HEAD 2>&1 | cut -c1-110)"
    else echo "    GitHub: NOT reachable from here: $(tr '\n' ' ' < "$STATE/apps-fetch.err" | redact | head -c 200)"; fi
    echo "    service: $($SYSTEMCTL is-active "$unit" 2>&1)"
  done < <(discover)
  [ "$found" = 1 ] || echo "(none linked to GitHub yet)"
  echo "== the CRM / Invitations services as the server has them"
  candidates
  echo "== web addresses served by Caddy"
  grep -E '^[A-Za-z0-9*].*\{|reverse_proxy' /etc/caddy/Caddyfile 2>/dev/null | tr -s '\t ' ' ' | head -20
  echo "== last app updates"
  grep ' apps: ' "$LOG" 2>/dev/null | tail -n 6 | redact
  exit 0
fi

load_token
linked=""
while IFS='|' read -r unit dir user url; do
  [ -n "$unit" ] || continue
  linked="$linked|$unit|"
  update_one "$unit" "$dir"
done < <(discover)
for f in "$UNITDIR"/*.service; do
  [ -f "$f" ] || continue
  u="$(basename "$f")"
  case "$u" in *crm*|*invit*) case "$linked" in *"|$u|"*) ;; *) adopt_one "$u";; esac;; esac
done
exit 0
