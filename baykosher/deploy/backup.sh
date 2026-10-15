#!/usr/bin/env bash
# Nightly database backup. Usage: backup.sh [prod|staging]   (default prod)
# - dumps the database to a compressed file, checks the file is readable
# - keeps 14 daily + 8 weekly (Sunday) + 12 monthly (1st) copies on this machine
# - copies it OFF this machine with rclone when BACKUP_REMOTE is set (Google Drive, Backblaze, S3, ...)
# - pings BACKUP_PING_URL after success (healthchecks.io) so a silent failure gets noticed
. "$(dirname "$0")/lib.sh"
INST="${1:-prod}"; load_env "$INST"
DEST="${BACKUP_DIR:-/var/backups/baykosher}/$INST"
mkdir -p "$DEST"/{daily,weekly,monthly}
STAMP="$(date -u +%Y%m%d-%H%M%S)"
FILE="$DEST/daily/baykosher-$INST-$STAMP.dump"

trap 'rm -f "$FILE.part"' EXIT
pg_dump --format=custom --compress=6 --no-owner --dbname="$DATABASE_URL" --file="$FILE.part"
pg_restore --list "$FILE.part" > /dev/null          # proves the file is a readable archive
mv "$FILE.part" "$FILE"
SIZE=$(du -h "$FILE" | cut -f1)

[ "$(date -u +%u)" = 7 ] && cp "$FILE" "$DEST/weekly/"
[ "$(date -u +%d)" = 01 ] && cp "$FILE" "$DEST/monthly/"
prune() { { ls -1t "$1"/*.dump 2>/dev/null || true; } | tail -n +"$(( $2 + 1 ))" | xargs -r rm -f; }
prune "$DEST/daily" 14; prune "$DEST/weekly" 8; prune "$DEST/monthly" 12

if [ -n "${BACKUP_REMOTE:-}" ]; then
  # sync keeps the remote identical to the local retention set; a failed upload fails the whole backup
  rclone sync "$DEST" "$BACKUP_REMOTE/$INST" --transfers 2 --retries 3
  echo "uploaded to $BACKUP_REMOTE/$INST"
else
  echo "WARNING: BACKUP_REMOTE not set. This backup lives only on this machine and will not survive losing it." >&2
fi
if [ -n "${BACKUP_PING_URL:-}" ]; then curl -fsS -m 15 --retry 3 "$BACKUP_PING_URL" > /dev/null || true; fi
echo "backup ok: $FILE ($SIZE)"
