# Moving the whole website from Render to your own free Oracle server

**Why:** no monthly fee, and email works (Render's free plan blocks the website from sending email; Oracle allows it). **What you keep:** the same address (jewishlamorinda.com), the same Stripe, the same Google settings. **Safety:** Render keeps running the whole time. You switch the address only when the new server is checked, and you can switch back in a minute.

**What changes for you:** the website will live on a server that you (and Claude) look after. It updates itself from GitHub every 5 minutes, takes a nightly backup, and restarts if it stops. Please copy a backup off the server now and then (a backup on the same machine does not survive losing the machine). Oracle can reclaim a free server that sits completely idle for weeks; a busy website does not.

Plan: about 1.5 hours the first time. Do it on a computer. Claude walks you through each step and checks it.

## Part 1: create the server (Oracle Cloud, "Always Free")
1. Sign in at **cloud.oracle.com**.
2. Menu (three lines, top left) → **Compute** → **Instances** → **Create instance**.
3. Name: `website`. **Image:** *Change image* → **Ubuntu** → **Canonical Ubuntu 24.04** (ARM) → Select image.
4. **Shape:** *Change shape* → **Ampere** → **VM.Standard.A1.Flex** → **1 OCPU and 6 GB** memory. (It says "Always Free-eligible". If Ampere is "out of capacity", try again later or pick **VM.Standard.E2.1.Micro**.)
5. **Networking:** keep the defaults; make sure **Assign a public IPv4 address** is on.
6. **Add SSH keys:** choose **Generate a key pair for me** and click **Save private key** (a file ending in `.key`, keep it safe: it is your password to the server). Also save the public key.
7. Click **Create**. Wait until it says **Running**. Write down the **Public IP address**.
8. Make the IP permanent: Menu → **Networking** → **IP management** → **Reserved public IPs** → *Reserve public IP address*, name it `website`; then open the instance → **Attached VNICs** → the VNIC → **IPv4 Addresses** → ⋮ → **Edit** → *No public IP*, Update; then *Edit* again → **Reserved public IP** → choose `website`. (Claude can explain this one live.)
9. Open the ports: instance page → **Subnet** link → **Security Lists** → *Default Security List* → **Add Ingress Rules** twice: Source CIDR `0.0.0.0/0`, protocol **TCP**, destination port **80**; and again for **443**.

## Part 2: connect and install
1. On Windows, open **PowerShell**: `ssh -i C:\path\to\your-file.key ubuntu@PUBLIC-IP` (answer `yes`). On a Mac: Terminal, same command (first `chmod 600` the key file).
2. Fetch the website: `sudo apt-get update && sudo apt-get install -y git` then
   `sudo git clone https://github.com/chabadlamorinda/chabad /opt/website-src`
   (the repository is private: when it asks for a username, use your GitHub name; for the password, a **token**: github.com → Settings → Developer settings → Personal access tokens → *Fine-grained* → only this repository → **Contents: Read-only**.) Then: `cd /opt/website-src && sudo git checkout claude/github-render-site-guide-94hral`
3. Your settings from Render: in Render → **chabad-lamorinda-app** → **Environment** → the **Edit** button shows all settings as text (KEY=value lines): copy it. On the server: `sudo nano /root/render.env`, paste, press Ctrl+O, Enter, Ctrl+X. (This file has secrets: delete it at the end with `sudo shred -u /root/render.env`.)
4. Install (test address first: `129-146-1-1` below is your IP with dashes instead of dots):
   `sudo ENV_FROM_RENDER=/root/render.env KIDDUSH_HOST=129-146-1-1.sslip.io bash deploy-oracle/install.sh`
   It asks for a staff password (use your Rabbi-area password) and skips Stripe if you press Enter (the Render settings bring them).
5. Open `https://129-146-1-1.sslip.io` in your browser: the website should appear. Open `/admin` and sign in. Check: Setup checklist → **Email sending** is green (the server can reach Gmail), then Weekly email → **Send me a test**.

## Part 3: copy the database (sign-ups, RSVPs, gifts, campaigns, everything)
Neon has your data. On the server, with the Neon connection string (Neon console → **Connect**; delete `&channel_binding=require` if it is there):
```
sudo systemctl stop kiddush
sudo -u postgres dropdb kiddush && sudo -u postgres createdb -O kiddush kiddush
pg_dump --no-owner --no-privileges "NEON_CONNECTION_STRING" | sudo -u postgres psql kiddush
sudo -u postgres psql -d kiddush -c "REASSIGN OWNED BY postgres TO kiddush"
sudo systemctl start kiddush
```
(If `pg_dump` says "server version mismatch", tell Claude: a newer client is installed in one more step.) Open the Rabbi area again and check the sign-ups, RSVPs and finances are all there.

## Part 4: switch the address (a few minutes; Render stays on as the fallback)
1. Cloudflare → jewishlamorinda.com → **DNS**: change the two records (`@` and `www`) from the CNAME to **A** records with the server's IP, **DNS only (grey cloud)**. (Do the same for jewishlamorinda.org if it is connected.)
2. On the server, change the web address the website answers to (replace the test name): `sudo nano /etc/caddy/Caddyfile`, make the first line `jewishlamorinda.com, www.jewishlamorinda.com {`, save, then `sudo systemctl reload caddy`. Caddy gets the https certificate by itself within a minute.
3. Check https://jewishlamorinda.com is the new server: the Setup checklist shows green Email sending, and the Rabbi area works.
4. Stripe does not change (same address). Google Analytics and Search Console do not change.
5. After a few quiet days: in Render, **Settings → Suspend** the service (or delete it) and cancel any paid plan. Keep Neon until you are sure; then remove it too.

## Day to day
* Updates: automatic from GitHub every 5 minutes (log: `/var/log/website-auto-update.log`). Claude changes the website as always; it appears within about 5 minutes. If a new version fails to start, the old one is put back by itself.
* Is it running? `systemctl status kiddush`. Logs: `journalctl -u kiddush -n 100`.
* Backups: every night in `/var/backups/kiddush` (30 days). The website's own "Download a full backup" button and the Sunday backup email still work too.
* If something goes wrong on the day: set the two Cloudflare records back to the Render address (CNAME `chabad-lamorinda-app.onrender.com`, grey cloud) and the old site is back in a minute.
