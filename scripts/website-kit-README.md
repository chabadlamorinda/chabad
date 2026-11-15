# Your Chabad's website

A complete, working Chabad website, in English, Hebrew and Russian, that you can make your own: events with RSVP and a printable flyer, Shabbat and holiday times that work themselves out, hundreds of guides to Judaism, a weekly email, giving (Stripe), a Rabbi area, and more. It was built by talking to Claude, and it is meant to be kept running the same way.

## What you need
* A computer with Node 20 or newer (https://nodejs.org), or just a free Render account (https://render.com) and a GitHub account.
* Claude Code (https://claude.com/claude-code) is the easiest way to run the site afterwards: open this folder and say what you want ("add our Purim party on March 3 with RSVP"). `CLAUDE.md` tells Claude how everything works.

## 1. Look at it first (5 minutes)
```
npm install
npm run dev
```
Open http://localhost:3000. The Rabbi area is at /admin, password `dev-password-123` (a throwaway database; emails are printed in the terminal).

## 2. Make it yours
1. `cp scripts/rebrand.example.json rebrand.json` and fill in your name, area, Rabbi and Rebbetzin, phone, email, address, web address and tax ID.
2. `node scripts/rebrand.js --dry` shows what would change; `node scripts/rebrand.js` does it everywhere (pages, guides, code, tests).
3. It prints what still mentions the old area (Lafayette, Moraga, Orinda and so on). To localize the rest, ask Claude: "Localize every guide and page to <your town>, keeping Chabad.org's teachings, and remove facts that are only true for Lamorinda."
4. Hebrew and Russian: add pairs to `"replacements"` in rebrand.json for your name in those languages, or ask Claude to update `site/content/i18n/he` and `ru`.
5. Edit `site/content/org.json` (address, geo coordinates, services, weekly classes, staff, social links) and `site/content/towns.json` (your towns).
6. Replace the photos you want in `site/media/` (the free atmosphere photos in `site/media/photos/` are credited in CREDITS.md), and replace our events in `site/content/events.json` (the Grand Chanukah Menorah Lighting is a sample of a finished event with flyer, RSVP and translations; keep it until your own first event is in, then delete it, and ask Claude to remove the links to it from the FAQ and guides).
7. Facts only the Rabbi can confirm (prices, times, programs): ask Claude to list every place in the content that states one, and check each.
8. `npm test`. About seven tests check our own address, phone, domain and the length of the Google Ads headlines, so after renaming they will fail until their expectations are updated. Ask Claude: "Fix the failing tests for our new name, address and domain." Everything must pass before you publish. Then commit.

## 3. Put it on the internet (about 30 minutes, free to start)
1. Put the folder on GitHub (a new private repository).
2. On Render: New, Web Service, connect the repository. It reads `render.yaml`.
3. In Render's Environment tab set: `ADMIN_PASSWORD` (12 or more characters; opens /admin), `DATABASE_URL` (a free Postgres from Render or https://neon.tech), `PUBLIC_URL` (your web address), `SMTP_URL` (an email account for sending: the weekly email and RSVP emails), `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` (Stripe account in the synagogue's name, for giving). Optional: `ANTHROPIC_API_KEY` (the website chat "Ask us"), `ADMIN_EMAIL` (where the Rabbi's notifications go).
4. Connect your own domain in Render (Settings, Custom Domains) and at your domain company.
5. In Render, set Auto-Deploy to "After CI Checks Pass", so nothing goes live unless the tests pass.

## 4. Running it
Say what you want to Claude: change a service time, add an event, put up a flyer, write a guide. It edits the files, runs the tests, and publishes. `CLAUDE.md` is the full manual (events, forms, giving funds, the weekly email, the Rabbi area).

## Notes
* Words and teachings in the guides are retold from Chabad.org in simple English; keep sources honest and check halacha with your own Rabbi.
* The photos in `site/media/photos` are free-to-use (see CREDITS.md). Add your own community photos; they always win over stock photos.
* Never commit passwords or API keys. They live only in Render's Environment tab.
* This copy came from Chabad of Lamorinda in Lafayette, California. Please keep that in mind when you see our names, towns or "Bay Kosher" in the guides; `rebrand.js` lists them.
