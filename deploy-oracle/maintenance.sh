#!/usr/bin/env bash
# Maintenance requests: "ask Claude in chat, the server does it by itself". Claude adds a line to
# deploy-oracle/maintenance/requests.txt (id, then one action from the fixed list below) and pushes it to GitHub; within
# about 5 minutes auto-update.sh gets it and calls this script, which runs every request that has not run yet, once.
# (Actions: status-report, update-report, disk-report, restart-site, restart-caddy, update-os, backup-now, clean-disk, reboot.)
# Only the actions listed here can run (no free-form commands). What happened is written to /var/log/website-maintenance.log,
# which the Rabbi area shows under "Keys and settings" -> "Server care".
#   Run by hand:  sudo bash /opt/website-src/deploy-oracle/maintenance.sh
# Settings for testing: REQUESTS, STATE_DIR, MAINT_LOG, DRY_RUN=1 (say what would run, change nothing).
set -uo pipefail
SRC="${SRC:-/opt/website-src}"
REQ="${REQUESTS:-$SRC/deploy-oracle/maintenance/requests.txt}"
STATE="${STATE_DIR:-/var/lib/website-maintenance}"
LOG="${MAINT_LOG:-/var/log/website-maintenance.log}"
DRY="${DRY_RUN:-}"
[ -f "$REQ" ] || exit 0
mkdir -p "$STATE"; touch "$STATE/done" "$LOG"; chmod 644 "$LOG"

run() { if [ -n "$DRY" ]; then echo "would run: $*"; else "$@"; fi; }

do_action() {
  case "$1" in
    status-report) { echo "services:"; run systemctl is-active kiddush caddy postgresql; run uptime; run df -h /; run free -m; } ;;
    update-report) { echo "version on this server:"; git -C "$SRC" log --oneline -1 2>&1; echo "last lines of the automatic update log:"; tail -n 6 /var/log/website-auto-update.log 2>&1; } ;;
    disk-report) { run df -h /; run du -sh /var/backups/kiddush /var/log /opt/kiddush; } ;;
    restart-site) run systemctl restart kiddush && echo "the website was restarted" ;;
    restart-caddy) run systemctl restart caddy && echo "the web server (https) was restarted" ;;
    update-os) { run env DEBIAN_FRONTEND=noninteractive apt-get update -y; run env DEBIAN_FRONTEND=noninteractive apt-get -y -o Dpkg::Options::=--force-confold upgrade; echo "system updates installed (a restart of the server may still be needed: ask for 'reboot')"; } ;;
    backup-now) { run mkdir -p /var/backups/kiddush; if [ -n "$DRY" ]; then echo "would run: pg_dump into /var/backups/kiddush"; else sudo -u postgres pg_dump -Fc kiddush > "/var/backups/kiddush/manual-$(date +%F-%H%M).dump" && echo "backup saved in /var/backups/kiddush"; fi; } ;;
    clean-disk) { run apt-get clean; run journalctl --vacuum-time=14d; run find /var/backups/kiddush -name '*.dump' -mtime +30 -delete; echo "old logs, package files and backups older than 30 days were cleared"; } ;;
    reboot) { echo "the server restarts in one minute and the website comes back by itself"; run shutdown -r +1; } ;;
    *) echo "unknown action '$1': nothing was done" ;;
  esac
}

while IFS= read -r line || [ -n "$line" ]; do
  line="${line%%#*}"
  read -r id action _rest <<< "$line"
  [ -n "${id:-}" ] && [ -n "${action:-}" ] || continue
  [[ "$id" =~ ^[A-Za-z0-9._-]{1,60}$ ]] || continue
  grep -qxF -- "$id" "$STATE/done" && continue
  echo "$id" >> "$STATE/done"            # marked first, so a request never runs twice (a reboot must not loop)
  { echo "$(date -Is) request $id: $action"; do_action "$action" 2>&1; echo "$(date -Is) request $id finished"; } >> "$LOG"
done < "$REQ"
# keep the log short
if [ "$(wc -l < "$LOG")" -gt 400 ]; then tail -n 300 "$LOG" > "$LOG.tmp" && cat "$LOG.tmp" > "$LOG" && rm -f "$LOG.tmp"; fi
exit 0
