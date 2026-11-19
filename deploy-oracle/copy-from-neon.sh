#!/usr/bin/env bash
# Copies the whole website database from Neon onto this server (replacing what is here), then starts the website again.
# Safe to run more than once: run it again right before switching the address, so nothing that arrived in between is lost.
#   sudo bash /opt/website-src/deploy-oracle/copy-from-neon.sh
# It reads the Neon address from /root/render.env (the settings copied from Render); nothing secret is printed.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Please run with sudo."; exit 1; }
ENVF="${RENDER_ENV:-/root/render.env}"
[ -f "$ENVF" ] || { echo "Cannot find $ENVF"; exit 1; }
NEON="$(grep '^DATABASE_URL=' "$ENVF" | cut -d= -f2- | tr -d '"' | sed 's/&channel_binding=require//')"
[ -n "$NEON" ] || { echo "No DATABASE_URL in $ENVF"; exit 1; }
PGDUMP=/usr/lib/postgresql/18/bin/pg_dump
[ -x "$PGDUMP" ] || PGDUMP=pg_dump
OUT=/root/neon-copy.sql

echo "1/4  Reading everything from Neon..."
"$PGDUMP" --no-owner --no-privileges "$NEON" | sed '/^SET transaction_timeout/d' > "$OUT"
SIZE="$(stat -c %s "$OUT")"
[ "$SIZE" -gt 20000 ] || { echo "The copy is only $SIZE bytes: something is wrong. Nothing was changed."; exit 1; }
echo "     copied $((SIZE / 1024)) KB"

echo "2/4  Stopping the website for a moment and loading the copy..."
systemctl stop kiddush
sudo -u postgres dropdb --if-exists kiddush
sudo -u postgres createdb -O kiddush kiddush
sudo -u postgres psql -q -d kiddush -f "$OUT" >/dev/null 2>&1 || true

echo "3/4  Giving the tables to the website's database user..."
for t in $(sudo -u postgres psql -d kiddush -Atc "select tablename from pg_tables where schemaname='public'"); do
  sudo -u postgres psql -d kiddush -qc "ALTER TABLE public.\"$t\" OWNER TO kiddush"
done
for s in $(sudo -u postgres psql -d kiddush -Atc "select sequencename from pg_sequences where schemaname='public'"); do
  sudo -u postgres psql -d kiddush -qc "ALTER SEQUENCE public.\"$s\" OWNER TO kiddush"
done

echo "4/4  Starting the website..."
systemctl start kiddush
for i in $(seq 1 20); do
  sleep 2
  if curl -fsS --max-time 10 http://127.0.0.1:3000/healthz 2>/dev/null | grep -q ok; then echo "Done: the website is running with a fresh copy of the data."; shred -u "$OUT"; exit 0; fi
done
echo "The website did not answer yet. Check:  journalctl -u kiddush -n 30 --no-pager"; exit 1
