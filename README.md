# Chabad of Lamorinda: website and My Pushka app

* `index.html`, `styles.css`: the main website.
* `pushka/`: the **My Pushka** app (English and Hebrew), installable on a phone's home screen.
* `server/`: a small Node server that serves the site and handles **Stripe card payments** for the app.
* `render.yaml`: tells Render how to host everything.

## How giving works
1. A donor drops coins into their pushka (it only tracks the pledge; nothing is charged yet).
2. When they empty it (or tap Donate / Give), the app saves their card with **Stripe** the first time, then charges that card automatically. No redirect to another website.
3. Stripe emails the receipt. Monthly gifts are Stripe subscriptions the donor can cancel in the app.

Card numbers never touch this server; Stripe.js collects them and Stripe stores them.

## Giving options (mirrors chabadoflamorinda.com/4970020)
Funds, preset amounts ($180 to $7,200), one-time or monthly, dedication or note, the optional 3.5% processing fee, Building Campaign levels, sponsorships, and Zelle / Venmo / DAF / check / wire / stock / crypto instructions all follow the website. Edit them at the top of `pushka/pushka.js` (`FUNDS`, `GIVE_AMTS`, `LEVELS`, `SPONSORS`).
Set `ZELLE_EMAIL` there to show the Zelle address in the app (until then the app points donors to the donation page for it). Card gifts are capped at $10,000 each; larger gifts are directed to the office.

## Turning on card payments (one time)
1. Create a Stripe account for Chabad of Lamorinda and finish its business and bank details.
2. In Stripe, turn on **Test mode**, then **Developers → API keys**. Copy the **Publishable key** (`pk_test_…`) and **Secret key** (`sk_test_…`).
3. In Render, open the **chabad-lamorinda-app** service → **Environment** and add:
   * `STRIPE_PUBLISHABLE_KEY` = the `pk_test_…` key
   * `STRIPE_SECRET_KEY` = the `sk_test_…` key
   (`SESSION_SECRET` is generated automatically.)
4. In Stripe: **Settings → Customer emails**, turn on **Successful payments** so donors receive receipts.
5. Open the app on the new service's address and try a gift with the test card `4242 4242 4242 4242` (any future date, any CVC). More test cards: `4000 0025 0000 3155` (bank verification), `4000 0000 0000 9995` (declined).
6. When it all works, replace both keys with the **live** ones (`pk_live_…`, `sk_live_…`) from Stripe with Test mode switched off.

Without these keys the app still works: it falls back to sending the donor to the website's donation page.

## Developing
```
npm install
npm test            # server tests (a fake Stripe, no network)
SESSION_SECRET=any-long-random-string npm start
```
