#!/usr/bin/env bash
# Restore a backup. Usage:
#   restore.sh <dump-file> [prod|staging]      replaces that instance's database (asks first, stops the app)
#   restore.sh <dump-file> scratch             restores into a throwaway database "baykosher_scratch" to look at it
. "$(dirname "$0")/lib.sh"
FILE="${1:?usage: restore.sh <dump-file> [prod|staging|scratch]}"; INST="${2:-prod}"
[ -r "$FILE" ] || { echo "cannot read $FILE" >&2; exit 1; }
if [ "$INST" = scratch ]; then load_env prod; TARGET=baykosher_scratch
else load_env "$INST"; TARGET="$(echo "$DATABASE_URL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')"; fi
ADMIN="$(admin_url)"
echo "This will REPLACE database '$TARGET' with $FILE"
if [ "$INST" != scratch ]; then
  if [ "${BK_YES:-}" != "$TARGET" ]; then
    read -r -p "Type the database name ($TARGET) to continue: " ans; [ "$ans" = "$TARGET" ] || { echo aborted; exit 1; }
  fi
  systemctl stop "baykosher@$INST" 2>/dev/null || true
fi
psql "$ADMIN" -v ON_ERROR_STOP=1 -qc "DROP DATABASE IF EXISTS \"$TARGET\" WITH (FORCE)" -c "CREATE DATABASE \"$TARGET\""
pg_restore --no-owner --exit-on-error --dbname="$(db_url_for "$TARGET")" "$FILE"
echo "restored into $TARGET"
if [ "$INST" != scratch ]; then systemctl start "baykosher@$INST" 2>/dev/null || true; fi
