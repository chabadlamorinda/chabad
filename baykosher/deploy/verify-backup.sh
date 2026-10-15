#!/usr/bin/env bash
# A backup you never restored is a hope, not a backup. Restores the newest dump into a scratch database,
# checks the data is really there, and drops it. Run weekly by the timer.
. "$(dirname "$0")/lib.sh"
INST="${1:-prod}"; load_env "$INST"
DIR="${BACKUP_DIR:-/var/backups/baykosher}/$INST/daily"
FILE="$(ls -1t "$DIR"/*.dump 2>/dev/null | head -1 || true)"; [ -n "$FILE" ] || { echo "no backups in $DIR" >&2; exit 1; }
AGE=$(( ( $(date +%s) - $(stat -c %Y "$FILE") ) / 3600 ))
[ "$AGE" -le 30 ] || { echo "newest backup is $AGE hours old: $FILE" >&2; exit 1; }
SCRATCH=baykosher_verify
ADMIN="$(admin_url)"
psql "$ADMIN" -v ON_ERROR_STOP=1 -qc "DROP DATABASE IF EXISTS $SCRATCH WITH (FORCE)" -c "CREATE DATABASE $SCRATCH"
trap 'psql "$ADMIN" -qc "DROP DATABASE IF EXISTS $SCRATCH WITH (FORCE)" >/dev/null 2>&1 || true' EXIT
pg_restore --no-owner --exit-on-error --dbname="$(db_url_for $SCRATCH)" "$FILE"
for t in products orders customers settings; do
  n=$(psql "$(db_url_for $SCRATCH)" -Atc "SELECT count(*) FROM $t")
  live=$(psql "$DATABASE_URL" -Atc "SELECT count(*) FROM $t")
  echo "$t: backup=$n live=$live"
  [ "$n" -ge $(( live * 9 / 10 )) ] || { echo "backup of $t looks incomplete" >&2; exit 1; }
done
echo "verify ok: $FILE restores cleanly (age ${AGE}h)"
