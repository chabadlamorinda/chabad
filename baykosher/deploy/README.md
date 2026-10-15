# Running Bay Kosher on an Oracle Cloud server (Always Free)

You get **two copies** of the store on one small server:

| | Live store | Test copy ("dev system") |
|---|---|---|
| Address | test address now, `baykosher.com` at launch | `staging.<your domain>` (password-protected, hidden from Google) |
| Payments | real Stripe | fake, nothing is charged |
| Customer messages | real | none can be sent |
| Clover, Uber, Gmail | connected | **not** connected |
| Data | real | a copy of the live data with customer details scrubbed (`refresh-staging.sh`) |

Use the test copy to try new versions, bulk imports, price changes and invoice reading before doing it for real.

## Testing first, launching later
Nothing here touches `baykosher.com` or MyKosherGrocer. Run the new store on a **test address** until you are happy, then switch the name:
* Test address: any subdomain you control (e.g. `shop-test.chabadoflamorinda.com`, one DNS A record) or, with no domain at all, `<ip-with-dashes>.sslip.io` (e.g. `129-146-1-2.sslip.io`), which Caddy can get a real HTTPS certificate for.
* In `/etc/baykosher/prod.env` keep `NOINDEX=1` and set `PUBLIC_URL` to the test address. NOINDEX tells Google to ignore the test site (otherwise it could be indexed as a duplicate of baykosher.com and hurt the real ranking). Use Stripe **test** keys and Clover **sandbox** during this phase.
* Launch day: point `baykosher.com` DNS at the server, swap the name in `/etc/caddy/Caddyfile`, set `PUBLIC_URL=https://baykosher.com`, delete the `NOINDEX` line, switch to live Stripe/Clover keys, `systemctl restart baykosher@prod && systemctl reload caddy`. Add 301 redirects for the old product URLs the same day. Your data, orders and settings carry over untouched because they are in the same database.

## 1. Create the server (about 20 minutes, one time)
1. Oracle Cloud > Compute > Create instance. Image **Ubuntu 24.04**, shape **VM.Standard.A1.Flex** (Always Free: choose 2 OCPU and 12 GB, leaving room to spare). If it says "out of capacity", try again later or another availability domain.
2. Add your SSH key. Note the public IP.
3. In the instance's subnet **Security List**, add ingress rules for TCP **80** and **443** from `0.0.0.0/0`. (The script handles the server's own firewall; Oracle's console rules are separate.)
4. Point your domain's DNS **A records** (`baykosher.com`, `www`, `staging`) at the public IP. Reserve the IP first so it never changes.
5. The code lives in a private GitHub repository, so give the server read access: on the server run `sudo -u baykosher ssh-keygen -t ed25519` (as the user after step 6 below, or generate a key anywhere), and add the public key as a read-only **Deploy key** in the repository's settings.

## 2. Install (one command)
```
ssh ubuntu@<ip>
sudo git clone <repo-url> /tmp/bk && cd /tmp/bk/baykosher/deploy      # or copy this folder up with scp
sudo REPO_URL=<repo-url> BRANCH=main bash setup.sh
```
It installs Node 22, Postgres, Caddy (automatic HTTPS) and rclone, creates both databases, creates the live and test copies, starts them, switches on nightly backups and the weekly restore test, and prints the admin password for each copy (also saved in `/etc/baykosher/*.env`).

Then:
* `sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile`, edit the names (and make the staging password with `caddy hash-password`), `sudo systemctl reload caddy`.
* Put the real keys (Stripe, Resend, Twilio, Clover, Uber, `ANTHROPIC_API_KEY`, `INBOXES`) into `/etc/baykosher/prod.env`, then `sudo systemctl restart baykosher@prod`. The comments in `env.prod.example` explain each one. Do **not** put them in `staging.env`.
* Visit `https://baykosher.com/healthz`: it should say `ok`.

## 3. Backups (set this up the same day)
What runs by itself:
* **Every night at 3:15am** (`baykosher-backup.timer`): dumps the database, checks the file reads back, keeps 14 daily + 8 weekly + 12 monthly copies in `/var/backups/baykosher/prod/`, and copies them off the server.
* **Every Sunday** (`baykosher-verify.timer`): restores the newest backup into a scratch database and compares row counts with the live one. A backup you have never restored is a hope, not a backup.

**Off-server copy is the part that actually protects you** (a dead server or a closed Oracle account takes local backups with it). Free options: Google Drive, Backblaze B2 (10 GB free), or any S3.
```
sudo -u baykosher rclone config          # create a remote called e.g. "gdrive" (Google Drive) and log in
sudo nano /etc/baykosher/prod.env        # BACKUP_REMOTE=gdrive:BayKosherBackups
sudo -u baykosher /opt/baykosher/prod/baykosher/deploy/backup.sh prod    # run once now and look for "uploaded"
```
Also create a free check at healthchecks.io (period 1 day, grace 3 hours) and paste its URL as `BACKUP_PING_URL`. It emails you if a backup ever fails to happen, which is the only way a silent failure is noticed.

Look at the state any time: `systemctl list-timers 'baykosher-*'`, `journalctl -u baykosher-backup -n 30`, `ls -lh /var/backups/baykosher/prod/daily`.

### Restoring (practice this once on the test copy)
```
# look at a backup without touching anything
sudo -u baykosher deploy/restore.sh /var/backups/baykosher/prod/daily/<file>.dump scratch
# replace the live database (stops the app, asks you to type the database name, restarts)
sudo deploy/restore.sh /var/backups/baykosher/prod/daily/<file>.dump prod
```
If the whole server is lost: make a new server (step 1 and 2), `rclone copy gdrive:BayKosherBackups/prod /var/backups/baykosher/prod`, then restore the newest file. You lose at most one night of orders; Stripe and Clover still hold their own records for reconciliation.

## 4. Day to day
* **Try a change first:** `sudo deploy/update.sh staging <branch>` then use the test site. `sudo deploy/refresh-staging.sh` re-copies today's live data into it (scrubbed).
* **Go live with it:** `sudo deploy/update.sh prod` (backs up first, installs, restarts, checks `/healthz`, and puts the previous version back automatically if the new one does not start).
* **Logs:** `journalctl -u baykosher@prod -f`.
* **Security updates:** `sudo apt install unattended-upgrades` keeps the operating system patched.

## 5. Honest limits
* One server: if it is down, the store is down until it is fixed or restored. Fine at this size, not highly available.
* Oracle can reclaim "idle" Always Free instances and has closed free accounts without much notice. That is why the off-server backup is not optional. Upgrading the account to Pay As You Go (still free when you stay inside the free limits) lowers the risk.
* Outbound port 25 is blocked by Oracle, which is why email goes through Resend's API.
* These scripts were tested here against a real Postgres 16 (backup, retention, restore, disaster restore, scrubbed staging copy, app start on the restored data). `setup.sh`, the systemd units, Caddy and rclone uploads have not been run on a real Oracle server yet; expect to fix a small thing or two on first run, and tell me what you see.
