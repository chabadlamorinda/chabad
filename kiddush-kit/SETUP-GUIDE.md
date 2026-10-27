# Setup guide (plain English, no coding)

Plan on about an hour. You will make a few free accounts. **Write down every password** somewhere safe. If you are working with Claude, it will walk you through this; this page is the same list in one place.

You will end up with three web addresses (using your own Render address):

* TV: `https://YOUR-NAME.onrender.com/kiddush/tv/`
* Phone page (the QR code opens this): `https://YOUR-NAME.onrender.com/kiddush/`
* Staff page, just for you: `https://YOUR-NAME.onrender.com/admin/kiddush/`

## Step 1. Fill in your details
Open `chabad.config.json` in any text editor (Notepad, TextEdit) and fill in your Chabad's name, city, contact, prices and payment details (the file explains each line; `ABOUT-YOUR-CHABAD.md` is a fill-in sheet that makes this easy, and Claude can do it for you). Put your logo in `kiddush/img/logo.svg`.

## Step 2. Put the files on GitHub (so Render can read them)
1. Make a free account at **github.com**.
2. Click **+ → New repository**. Name it, for example, `kiddush-board`. Choose **Private**. Create it.
3. Click **uploading an existing file**, drag in everything from this folder (the folders `kiddush` and `server`, and all the files), and click **Commit changes**. (Do not upload a folder named `node_modules` if you have one.)

## Step 3. Make the database (free) at Neon
Sponsors are saved in a database so nothing is lost.
1. Go to **neon.tech**, sign up, **Create project** (any name, pick the region closest to you).
2. On the project page click **Connect** and copy the **connection string** (it starts with `postgresql://`). Keep it private. This is your `DATABASE_URL`.
3. If the string contains `&channel_binding=require`, delete that bit.

## Step 4. Put it online at Render
1. Go to **render.com**, sign up (with your GitHub account is easiest).
2. Click **New → Blueprint**, choose your `kiddush-board` repository, and continue. Render reads the settings from the file `render.yaml`.
3. It asks for a few secret values. Fill in:
   * **DATABASE_URL**: the Neon connection string from Step 3.
   * **ADMIN_PASSWORD**: choose a password of **12 or more characters** (this opens the staff page).
   * Leave the Stripe and email boxes empty for now.
4. Click **Apply / Deploy**. After a few minutes you get an address like `https://kiddush-board-xxxx.onrender.com`.
5. Open `…/kiddush/tv/` and `…/kiddush/`. You should see your Chabad's name and the whole year. Open `…/admin/kiddush/` and sign in with your admin password.
6. In the staff page open **Settings** and check your payment details. Set **"Web address for the QR code"** to your Render address (for example `https://kiddush-board-xxxx.onrender.com`) so the QR code on the TV shows a clean address.

## Step 5. Card payments with Stripe
Sponsors can pay by card, Apple Pay and Google Pay. (Zelle, Venmo, check and cash already work without Stripe.)
1. Make an account at **stripe.com** in your organization's name. Stay in **Test mode** (switch at the top) for now.
2. **Developers → API keys**: copy the **Publishable key** (`pk_test_…`) and **Secret key** (`sk_test_…`).
3. In Render open your service → **Environment** and add `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` with those values. Save (Render restarts).
4. In Stripe **Developers → Webhooks → Add endpoint**:
   * Endpoint URL: `https://YOUR-NAME.onrender.com/api/stripe/webhook`
   * Events: tick **`checkout.session.completed`** and **`checkout.session.expired`**.
   * After saving, copy the **Signing secret** (`whsec_…`) into Render as `STRIPE_WEBHOOK_SECRET`.
5. **Test it:** on the phone page, sponsor a week with the test card `4242 4242 4242 4242`, any future date, any 3-digit code. The name should appear on the board. Then in the staff page you can remove the test sponsorship ("Release").
6. **Going live:** finish Stripe's business verification (so money can be paid out to your bank), switch Stripe to **Live mode**, copy the **live** keys and create a **live** webhook the same way, and replace **all three** values in Render (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`) at the same time. Do one real small payment to check, then refund it in Stripe.

## Step 6 (optional). Automatic reminder emails
Without this, "Send reminder" in the staff page opens a ready-to-send email in your own mail app. To have the program send reminders by itself (using Gmail):
1. In your Google account turn on **2-step verification**, then create an **App password** (Google Account → Security → App passwords).
2. In Render → Environment add:
   * `SMTP_URL` = `smtps://YOUR-ADDRESS%40gmail.com:APP-PASSWORD@smtp.gmail.com:465` (write `@` in your address as `%40`; the app password without spaces)
   * `MAIL_FROM` = `Chabad of Anytown <your-address@gmail.com>`
3. Save. The staff page's **Settings → Payment reminders** controls the timing.

## Step 7. Keep it awake (important on the free plan)
A free Render service goes to sleep after 15 minutes without visitors, and the first visit then takes about a minute. Two fixes:
* **Best: upgrade the service to the paid "Starter" plan** (about $7/month): Render → your service → Settings → Instance type.
* **Free alternative:** make a free account at **uptimerobot.com**, add a new **HTTP(s) monitor** for your TV address (`https://YOUR-NAME.onrender.com/kiddush/tv/`) checking **every 5 minutes**. That keeps it awake. (The TV itself also refreshes every minute while it is on.)

## Step 8. Showing it on the TV
* **Simplest:** open the TV address in the TV's web browser, or in a browser on a laptop / Fire Stick / Chromecast plugged into the TV, and make it full screen (F11 on a computer). It refreshes itself every minute and keeps showing the last board if the wifi drops.
* **Recommended: Fully Kiosk Browser** (an Android app, a few dollars once; works on Android TVs, Fire TV and tablets). Set the **Start URL** to your TV address, turn on **Keep Screen On**, turn the **Screensaver** off, and optionally turn on "Launch on boot". Menu names vary a little by version.
* If the TV shows the board in **dark colors** when it should be cream/gold, the browser or TV is forcing dark mode: turn off "Force dark"/"Dark mode for web content" in the browser's settings (in Fully Kiosk, look under Web Content Settings), and check the TV's picture mode.
* Want the dark wood look? Add `?theme=dark` to the TV address. Hebrew? Add `?lang=he` (or use the small עברית button in the corner).

## Step 9. Everyday use
* Put the QR code on the TV to work: people scan it and land on the right week.
* **Staff page → Waiting for payment:** when a Zelle/Venmo/check/cash payment arrives, press **Confirm payment**; only then does the name appear on the TV and phone page. Card payments appear by themselves.
* Remind someone, schedule a reminder for a time you choose, or cancel reminders, on the same tab.
* **Add an event** for anything extra people can sponsor; **Calendar notes** for a yahrzeit or an event this week. They show on the TV (the "Upcoming events" box) and the phone page.
* The staff link is hidden on the phone page: tap the bottom-left corner of the screen and a faint "Staff sign-in" appears.
* The year changes by itself at Rosh Hashanah.

## If something goes wrong
* **Staff page says wrong password:** it must match `ADMIN_PASSWORD` in Render exactly, with no space at the end. After you change it, wait a minute for the restart. Eight wrong tries locks the page for 15 minutes.
* **Page says "Sponsorships are not set up yet":** `DATABASE_URL` is missing or wrong. In Render open **Logs** and look for "Database connected."
* **No card option on the phone page:** the Stripe keys are not set yet (Step 5), or "Accept cards" is off in Settings.
* **Candle lighting times missing on the TV:** check the `location` part of `chabad.config.json` (zip code), then redeploy.
* **Slow first load:** the free plan was asleep (Step 7).
* **Changed `chabad.config.json` but nothing changed:** if it is a price or payment detail that was already saved in the staff page's Settings, change it there instead. Name/city/time zone changes need a redeploy (pushing to GitHub does it automatically).
