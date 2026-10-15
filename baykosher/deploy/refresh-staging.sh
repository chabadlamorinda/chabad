#!/usr/bin/env bash
# Copy the live store into the test copy so you can try changes on real-looking data.
# Customer details are scrubbed and every payment/contact link is removed, so staging cannot charge or message anyone.
. "$(dirname "$0")/lib.sh"
dbname() { echo "$1" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#'; }
load_env prod; PROD_URL="$DATABASE_URL"
load_env staging
TARGET="$(dbname "$DATABASE_URL")"
[ "$TARGET" != "$(dbname "$PROD_URL")" ] || { echo "staging and prod use the same database, refusing" >&2; exit 1; }
systemctl stop baykosher@staging 2>/dev/null || true
ADMIN="$(admin_url)"
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
pg_dump --format=custom --no-owner --dbname="$PROD_URL" --file="$TMP"
psql "$ADMIN" -v ON_ERROR_STOP=1 -qc "DROP DATABASE IF EXISTS \"$TARGET\" WITH (FORCE)" -c "CREATE DATABASE \"$TARGET\""
pg_restore --no-owner --exit-on-error --dbname="$DATABASE_URL" "$TMP"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
UPDATE customers SET email = 'customer' || id || '@example.invalid', name = 'Test Customer ' || id, phone = '', stripe_customer_id = NULL,
  sms_ok = FALSE, email_ok = FALSE, password_hash = NULL, address = NULL;
UPDATE orders SET address = NULL, customer_ip = '', payment_intent_id = NULL, extra_charge_id = NULL, uber_delivery_id = NULL, uber_tracking_url = NULL;
TRUNCATE login_codes;
TRUNCATE carts CASCADE;
DELETE FROM settings WHERE key = 'clover_sales_cursor';
SQL
systemctl start baykosher@staging 2>/dev/null || true
echo "staging refreshed from prod (customer data scrubbed)"
