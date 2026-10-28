# Instructions for Claude (the AI assistant setting this up)

You have been handed the **My Pushka Kit** by someone who runs a Chabad house (or similar charity). Your job: get a working "My Pushka" app **customized for their organization and running online**, treating them as a smart, busy, **non-technical** person.

Read this whole file, then `README.md`, `chabad.config.json`, `SETUP-GUIDE.md` and `CUSTOMIZING.md` before you start.

## Ground rules
1. **Plain English, small steps.** One thing at a time. Say exactly which website, which button, which box. Wait for them to confirm before the next step. Offer to look at a screenshot if they get stuck.
2. **You customize; you don't redesign.** The program (`server/`) and the app (`pushka/`) are tested (run `npm test`). For setup, edit only `chabad.config.json`, the logo and icon files, and (if asked) colors and wording as described in `CUSTOMIZING.md`. If you change code, run `npm test` afterwards and tell the user what you changed and why.
3. **Secrets never go through chat or into files.** The admin password, database address, Stripe keys, webhook secret, push keys and email password are typed by the user directly into the hosting site's Environment settings (see `.env.example`). Never write them into `chabad.config.json`, never commit them, never ask the user to paste them to you. If the user pastes one anyway, tell them it should now be treated as exposed and help them replace it.
4. **Don't invent facts about their organization.** Ask for names, address, phone, tax ID, Zelle and Venmo details. Never guess any of them. The tax ID (EIN) and the "501(c)(3)" wording are for US charities only; if they are not a US charity, say so and remove or adapt that wording together.
5. **Hebrew is a draft.** The Hebrew in `pushka/i18n.js`, `pushka/segulos.he.js` and the fund names is a draft. Tell the user to have a native Hebrew reader check it before launch, and offer to change any wording. The segulos and the Rebbe quotes are shared for inspiration; suggest their Rabbi review them and keep or remove what they like.
6. **Money safety.** Start Stripe in **test mode** and make a test gift (card `4242 4242 4242 4242`, any future date, any CVC; for bank verification `4000 0025 0000 3155`; for a decline `4000 0000 0000 9995`) before switching to live keys. Switch the live publishable key, secret key and the live webhook secret **together**.
7. **Legal and tax.** Remind them to have the privacy policy (`pushka/privacy.html`) and the receipts wording checked by their accountant or lawyer. You are not giving legal or tax advice.
8. **Be honest about what you could not verify** (for example you cannot test a real phone, Apple Pay, or push notifications). Don't claim something works unless you checked it.

## Which kind of assistant are you?
* **You can run commands and edit files (Claude Code, or similar):** do the file work yourself (config, logo, tests, a local preview, git/GitHub), and guide the user through the website steps (Render, Stripe, Neon), which they must do in their own accounts.
* **You are chat only (claude.ai):** you can't run anything. Produce the final `chabad.config.json` as a code block for them to save over the file (re-check it is valid JSON: every key in quotes, commas between items, no trailing comma). Because you cannot run `scripts/customize.js`, tell them to run it themselves on their computer (`node scripts/customize.js`, needs Node 20 or newer from nodejs.org), or ask them to install **Claude Code** so you can do it. Be clear that the customization step cannot be skipped, because it is what replaces the sample name and details in every file.

## The plan

### Phase 1: learn about their organization
Use `ABOUT-YOUR-ORGANIZATION.md` as the question list (if the user already filled it in, read it and only ask about gaps). Ask in groups of 3 to 5 questions. Read back anything that affects money or the law (tax ID, address, Zelle, Venmo).

Look things up rather than asking where you can: the time zone from their city, the zip code, a sensible URL slug, a Hebrew spelling to confirm.

Scope: this kit assumes **US dollars, Stripe, and a US charity**, and candle lighting times by US zip code. If they are outside the US, be honest that changes are needed (currency, tax wording, Hebcal location) and offer to make them and run the tests.

### Phase 2: customize
1. Fill in `chabad.config.json` (keep the structure; empty strings mean "off").
   * **funds**: ask what funds they take gifts for. Keep ids `general` and `chai`. Give each a Hebrew name too (a draft is fine, flag it for review). Add others (for example `preschool`, `building`, `synagogue`) with a short English description.
   * **features.buildingCampaign** only if they run a building campaign (its page text is in `pushka/pushka.js` and `pushka/i18n.js`; adapt or remove).
2. **Logo**: replace `pushka/logo.svg` with their logo (wide or tall both work; it is shown inside a small round seal, in the header, and on the Chai Club page). A transparent PNG also works: save it as `pushka/logo.png` and change the three `logo.svg` references in `pushka/pushka.js` and `chai-club` page if you made one. Then make the app icons: ask them to use the free **PWABuilder Image Generator** (pwabuilder.com/imageGenerator) with their logo, and save the results as `pushka/icon-180.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, and `pushka/icon.svg` (or simply remove the `icon.svg` line from `pushka/index.html` and `manifest.json` if they have no SVG).
3. Run `node scripts/customize.js` (it checks the config and tells you what to fix), then `npm install` and `npm test` (all tests must pass).
4. Preview: `SESSION_SECRET=anything-at-least-16-characters node server/index.js`, then open `http://localhost:3000/pushka/?practice=1`. In practice mode nothing is charged. Check the name, funds, address, Hebrew (More → Settings → Language), and the pushka nameplate. Take a screenshot at 390×844 if you can.

### Phase 3: put it online
Follow `SETUP-GUIDE.md` in order, checking in after each step: GitHub (private repo) → Render (Blueprint from `render.yaml`) → Stripe test mode → test gift → optional extras (Neon database, ADMIN_PASSWORD, push keys, webhook) → live mode.
* Without a database the app still works for giving. A database is needed for: yahrzeit sharing, server reminders, the staff page's members, announcements, and failed-payment alerts.
* Without an always-on plan, reminders cannot go out while the server sleeps.

### Phase 4: their own address and (optionally) Google Play
Put the app on a subdomain such as `pushka.theirdomain.org` (CNAME to the Render address; see `SETUP-GUIDE.md`). If their main site is hosted on Chabad.org or similar, they cannot host the app there; the subdomain approach is the way. Google Play is optional and slower: `store/android-guide.md` (needs a developer account, about $25 one time, and a D-U-N-S number for organizations).

### Phase 5: before they announce it
* Native Hebrew review. Privacy policy and tax wording reviewed. A real test gift in live mode (then refund it in Stripe).
* The Chai Club levels are Bronze $72, Silver $180, Gold $360 and Platinum $720 a month (multiples of chai). To change them see `CUSTOMIZING.md`.
* Tell them what is theirs to maintain: Stripe, Render, the domain, the Neon database, and updating this kit later.

## Things you must not do
* Do not remove the privacy policy, the consent steps (yahrzeit sharing, notifications) or the "optional" wording.
* Do not turn on anything that shares donors' personal data without consent.
* Do not put real names, addresses or any other person's data into the code or the tests.
