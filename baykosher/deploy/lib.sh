# shared helpers for the deploy scripts
set -euo pipefail
ENV_DIR="${BK_ENV_DIR:-/etc/baykosher}"
load_env() { # load_env prod|staging
  local f="$ENV_DIR/$1.env"
  [ -r "$f" ] || { echo "missing $f" >&2; exit 1; }
  set -a; . "$f"; set +a
}
# URL with the database name swapped, for scratch databases
db_url_for() { # db_url_for NAME
  echo "$DATABASE_URL" | sed -E "s#/[^/?]+(\\?|\$)#/$1\\1#"
}
admin_url() { db_url_for postgres; }
