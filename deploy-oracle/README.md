# Running the Kiddush board on your own Oracle server

Status: **prepared but not yet run on your server.** The scripts have only been syntax-checked, not run on your machine, so expect to adjust something on the first run (Claude can do that live once it has access to the server).

What the install does (Ubuntu 22.04/24.04): installs Node 22, Postgres (local only), and Caddy (automatic https); runs the app as a service that starts at boot; takes a nightly database backup (kept 30 days in `/var/backups/kiddush`); turns on a basic firewall.

## Before you start
1. In the Oracle Cloud console, open the server's network settings (its VCN "security list") and allow incoming **TCP ports 80 and 443** (and keep 22 for SSH). The install script only opens the server's own firewall.
2. Make sure the server has a **reserved public IP** (so the address doesn't change).
3. Decide on the web address:
   * the free name the script suggests (for example `129-146-1-1.sslip.io`), which works immediately; or
   * your own name such as `kiddush.chabadoflamorinda.com`: Chabad.org's support must add a DNS **A record** `kiddush` pointing to the server's IP. Do this first, wait until it works, then run the script.

## Install
```
git clone <your GitHub repository> kiddush-src && cd kiddush-src
sudo bash deploy-oracle/install.sh
```
The script asks for the web address, the staff password (12+ characters), and optionally the Stripe keys. Secrets are saved only in `/etc/kiddush.env`.

## Move your data from Neon (do this before switching the TV and QR code)
On the server, with your Neon connection string (Neon console, Connect; remove `&channel_binding=require` if it is there):
```
sudo -u postgres dropdb kiddush && sudo -u postgres createdb -O kiddush kiddush      # start from an empty database
pg_dump --no-owner --no-privileges "NEON_CONNECTION_STRING" | sudo -u postgres psql kiddush
sudo -u postgres psql -d kiddush -c "REASSIGN OWNED BY postgres TO kiddush" 
sudo systemctl restart kiddush
```
Then open the staff page and check the sponsors, notes and settings are all there. The Neon database must still allow connections (upgraded, or inside its allowance) while you copy.

## Switch over
1. Stripe → Developers → Webhooks: change the endpoint to `https://NEW-ADDRESS/api/stripe/webhook` (keep the same two events) and put the new signing secret in `/etc/kiddush.env` (`STRIPE_WEBHOOK_SECRET=`), then `sudo systemctl restart kiddush`.
2. Change the forward at Chabad.org (`chabadoflamorinda.com/kiddush`) to `https://NEW-ADDRESS/kiddush/`.
3. Change the TV (Fully Kiosk start URL) to `https://NEW-ADDRESS/kiddush/tv/`, and the UptimeRobot monitor if you keep it (useful as an alert if the server goes down).
4. Keep Render and Neon running for a few days as a fallback, then switch them off.

## Day to day
* Update after a change in the code: `sudo bash deploy-oracle/update.sh` (from the git checkout).
* Status: `systemctl status kiddush`; logs: `journalctl -u kiddush -n 100`.
* Restore a backup: `sudo -u postgres pg_restore -c -d kiddush /var/backups/kiddush/kiddush-YYYY-MM-DD.dump`.
* Copy backups somewhere off the server now and then (a laptop, Google Drive): a backup on the same machine does not survive losing the machine.
* Email reminders: add `SMTP_URL` and `MAIL_FROM` to `/etc/kiddush.env` (see `store/kiddush-setup.md`).
