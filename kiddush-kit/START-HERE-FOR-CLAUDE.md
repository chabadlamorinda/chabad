# Instructions for Claude (the AI assistant setting this up)

You have been handed the **Kiddush Board Kit** by someone running a Chabad house. Your job is to get a working Kiddush board **customized for their Chabad, deployed online, and running on their TV**, while treating them as a smart, busy, **non-technical** person.

Read this whole file, then `README.md`, `chabad.config.json`, `SETUP-GUIDE.md` and `CUSTOMIZING.md` before you start.

## Ground rules

1. **Plain English, small steps.** One thing at a time. Say exactly which website, which button, which box. Wait for them to confirm before the next step. Offer to look at a screenshot if they get stuck.
2. **You customize; you don't redesign.** The program in `server/` and the pages in `kiddush/` are tested (22 tests). For setup you should only edit `chabad.config.json`, `kiddush/img/logo.svg` (their logo) and, if asked, colors/wording as described in `CUSTOMIZING.md`. If you change code, run `npm test` afterwards and tell the user what you changed and why.
3. **Secrets never go through chat or into files.** The admin password, database address, Stripe keys, webhook secret and email app-password are typed by the user directly into the hosting site's Environment settings (see `.env.example`). Never write them into `chabad.config.json`, commit them, or ask the user to paste them to you. If the user pastes one anyway, tell them it should now be treated as exposed and help them replace it (new password / new Stripe key / new database password).
4. **Don't invent facts about their Chabad.** Ask for names, prices, payment details and the Hebrew name. Never guess a Zelle address, address or price.
5. **Hebrew:** the Hebrew text in `kiddush/i18n.js` and the Mi Sheberach blessing are a draft. Tell the user to have a Hebrew reader check them, and offer to change any wording.
6. **Money safety:** start Stripe in **test mode** and make a test payment (card `4242 4242 4242 4242`, any future date, any CVC) before switching to live keys. Live keys and the live webhook secret must be switched **together**.
7. **Be honest about what you could not verify** (for example you cannot see their TV). Don't claim something works unless you checked it.

## Which kind of assistant are you?

* **You can run commands and edit files (Claude Code, or similar):** do the file work yourself (config, logo, tests, a local preview, git/GitHub), and guide the user through the website steps (Render, Neon, Stripe), which they must do in their own accounts.
* **You are chat only (claude.ai):** you can't run anything. Produce the final `chabad.config.json` as a code block for them to save over the file (re-check it is valid JSON: every key in quotes, commas between items, no trailing comma), explain how to upload the folder to GitHub (web "Add file → Upload files" works), and guide the rest. Skip the "run npm test" steps.

## The plan

### Phase 1: learn about their Chabad
Use `ABOUT-YOUR-CHABAD.md` as the question list (if the user already filled it in, read it and only ask about gaps). Ask in groups of 3 to 5 questions, not all 23 at once. Confirm anything that affects money (prices, Zelle, check payee) by reading it back.

Look up what you need rather than asking them to:
* **Time zone** from their city.
* **Zip code** or, outside the US, a **GeoNames id** (`location.geonameid`; geonames.org) for candle lighting times. Candle lighting is 18 minutes before sunset by Chabad custom, Havdalah 50 minutes after (`location` section). Jerusalem-style 40 minutes is a different custom; ask only if relevant.
* **Header lines** (`organization.headerLine1/2`): usually `CHABAD` and the city in capitals. Keep each under about 14 characters so it fits the TV.

Note the scope: this kit assumes a community **outside Israel** (two-day Yom Tov) and US dollars. If they are in Israel, tell them honestly that the calendar would need a small code change (`il: true` in `server/kiddush-calendar.js`) and the second days of holidays would disappear; offer to make that change and run the tests.

### Phase 2: customize
1. Fill in `chabad.config.json` (keep the structure; remove nothing you don't understand; empty strings are fine and mean "off").
2. Logo: replace `kiddush/img/logo.svg` with their logo. If they only have a PNG/JPG, save it as `kiddush/img/logo.png` and change the two `src="img/logo.svg"` / `src="../img/logo.svg"` references in `kiddush/index.html` and `kiddush/tv/index.html` (and the favicon `href`). A wide logo around 300×190 looks best. Without a logo the placeholder (a flame) stays; tell them.
3. (Optional) colors, see `CUSTOMIZING.md`.
4. If you can run code: `npm install`, `npm test` (expect `# pass 22`, `# fail 0`), then `SESSION_SECRET=anything-at-least-16-chars node server/index.js` and view `http://localhost:3000/kiddush/tv/` and `/kiddush/` (screenshots at 1920×1080 and 390×844 are ideal). Check their name, city, candle times and prices look right. With no `DATABASE_URL` the board shows the calendar but sponsoring is off; that is expected locally.

### Phase 3: put it online (they do this in their own accounts; you guide)
Follow `SETUP-GUIDE.md`, in this order, checking in after each:
1. GitHub account → new **private** repository → upload this folder (without `node_modules`).
2. Neon account → new project → copy the **connection string** (this becomes `DATABASE_URL`; if it contains `channel_binding=require`, delete that part).
3. Render account → **New → Blueprint** → pick the GitHub repo → it reads `render.yaml` → paste the environment values (`DATABASE_URL`, `ADMIN_PASSWORD` of 12+ characters; leave Stripe/email blank for now) → deploy. The address looks like `https://<name>.onrender.com`.
4. Open `<address>/kiddush/`, `<address>/kiddush/tv/` and `<address>/admin/kiddush/` and check each loads. Sign in to the staff page with the password they chose. In **Settings**, check the payment details and the "Web address for the QR code" field (set it to their address so the TV's QR code shows a clean web address).
5. Stripe: account → test-mode keys → add them to Render → webhook endpoint `<address>/api/stripe/webhook` with events `checkout.session.completed` and `checkout.session.expired` → signing secret to `STRIPE_WEBHOOK_SECRET`. Test payment. Then switch to live (keys and webhook secret together). Remind them to complete Stripe's business verification so payouts work.
6. Email reminders (optional): Gmail app-password steps in `SETUP-GUIDE.md` (`SMTP_URL`, `MAIL_FROM`).
7. Keeping it awake: a free Render service sleeps after 15 minutes. Recommend the $7/month plan, or the free UptimeRobot monitor on the TV address every 5 minutes.

### Phase 4: the TV
Walk them through `SETUP-GUIDE.md` "Showing it on the TV": open `<address>/kiddush/tv/` full screen; **Fully Kiosk Browser** (Android) is recommended: start URL = the TV address, keep screen on, screensaver off. If the TV browser forces dark colors, `<meta name="color-scheme" content="light only">` is already set; the Fully Kiosk/Android "force dark" setting may also need turning off. Optional `?theme=dark` for the dark wood look, `?lang=he` for Hebrew.

### Phase 5: hand over
Give them a short cheat sheet: the three addresses (TV, phone, staff), how to enter the staff page (also: on the phone page, tapping the bottom-left corner reveals a faint "Staff sign-in" link), the weekly routine (confirm payments in "Waiting for payment"), and who to ask for help. Show them how to add a calendar note and an event. Remind them to keep the admin password somewhere safe and to have the Hebrew reviewed.

## Where things are

* `chabad.config.json`: all organization-specific values (read by `server/config.js`).
* `server/kiddush.js`: the board logic, payments, reminders, staff API. `server/kiddush-calendar.js`: the Hebrew-year calendar (Hebcal). `server/kiddush-store.js`: database tables. `server/index.js`: the web server. `server/admin.js` + `server/admin/`: staff sign-in and page.
* `kiddush/`: `index.html` + `sponsor.js` + `sponsor.css` (phone), `tv/index.html` + `tv.js` + `tv.css` + `tv-light.css` (TV), `i18n.js` (English/Hebrew text), `fonts/`, `img/`.
* Settings the staff can change later without touching code: Staff page → Settings. `chabad.config.json` only gives the **starting** values; after someone saves Settings in the staff page, the saved values win. Name, time zone, location and header lines come only from the config file (changing them needs a redeploy).

## Troubleshooting quick list

* **Staff password rejected:** it must match `ADMIN_PASSWORD` in Render exactly (no trailing space). After changing it, the service restarts; wait a minute. Eight wrong tries locks sign-in for 15 minutes.
* **"Sponsoring is not set up yet":** `DATABASE_URL` is missing or wrong. Check Render → Logs for "Database connected."
* **Card option missing:** Stripe keys not set (or Settings → Accept cards is off).
* **TV slow to load first thing:** the free Render plan was asleep; see keep-awake.
* **Candle lighting times missing:** the location in the config (zip/geonameid) is empty or wrong, or the TV can't reach hebcal.com.
* **Invalid config on startup:** the log says `Could not read chabad.config.json`; fix the JSON (a missing comma or quote).
