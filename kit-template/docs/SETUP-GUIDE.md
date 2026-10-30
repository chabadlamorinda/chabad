# Putting your app online (step by step)

Do these in order. Each step is done in **your own accounts**, so nobody else ever has your keys. Claude can guide you through all of it.

Cost: GitHub free · Render free to try, about **$7 a month** for the "Starter" plan (needed so reminders go out; a free service falls asleep) · Neon database free · Stripe charges per gift (about 2.9% + 30¢ for cards; Stripe discounts for nonprofits are available on request) · your own web address about $12 a year (optional).

## 1. Customize the kit
Fill in `chabad.config.json`, then run `node scripts/customize.js`, `npm install`, `npm test` (Claude does this for you if it can run commands).

## 2. GitHub (where your copy of the app is kept)
1. Create a free account at github.com.
2. New repository → name it (for example `pushka`) → **Private** → Create.
3. Upload this folder's files (on the repository page: Add file → Upload files; drag the folder's contents, not the folder itself, and not `node_modules`). Commit.

## 3. Render (where the app runs)
1. Create an account at render.com and connect your GitHub.
2. **New → Blueprint** → pick your repository → Render reads `render.yaml`.
3. Render asks for the settings marked "sync: false". Leave the Stripe ones empty for now. Choose the **Starter** plan for the service if you want reminders to work.
4. Wait for "Live". Open `https://<name>.onrender.com/pushka/`: your app. Add `?practice=1` to try it without real money.

## 4. Stripe (card gifts, no redirects)
Work in **test mode** first (switch on "Test mode" in the Stripe dashboard).
1. Developers → API keys: copy the **Publishable key** (`pk_test_…`) and **Secret key** (`sk_test_…`).
2. In Render → your service → Environment: add `STRIPE_PUBLISHABLE_KEY` and `STRIPE_SECRET_KEY`. Save (Render restarts, about a minute).
3. Open the app, drop a coin, tap Empty. Use card `4242 4242 4242 4242`, any future date, any CVC. You should see the gift in Stripe → Payments.
4. Webhook (failed-payment alerts): Developers → Webhooks → Add endpoint → `https://<your address>/api/stripe/webhook` → events `invoice.payment_failed`, `invoice.paid`, `payment_intent.payment_failed`, `payment_intent.succeeded`, `charge.refunded`, `customer.subscription.deleted` → copy the signing secret (`whsec_…`) into Render as `STRIPE_WEBHOOK_SECRET`.
5. Apple Pay (optional): Stripe → Settings → Payment methods → Apple Pay → add your domain → copy the file's text into Render as `APPLE_PAY_ASSOC` → Verify. Google Pay needs nothing.
6. **Going live:** finish Stripe's business verification, turn Test mode off, copy the **live** keys, and replace `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` **together** (the app refuses to start if the two keys mix test and live). Make one small real gift and refund it in Stripe.

## 5. The extras (all optional; each adds features)
| You want | Set in Render → Environment |
|---|---|
| Sign in with email so each person has their own pushka on all devices | `DATABASE_URL` as below, plus `SMTP_URL` and `MAIL_FROM` (an email account that can send the 6-digit code; a Gmail "App password" works: `smtps://you%40gmail.com:APPPASSWORD@smtp.gmail.com:465`). Share `https://your-site/pushka/?signin=1` |
| Yahrzeit sharing with the Rabbi, announcements, members, failed-payment alerts | `DATABASE_URL` (a free database from neon.com: create a project, copy the connection string; delete `channel_binding=require` if it appears) |
| Your private staff page at `/admin/` | `ADMIN_PASSWORD` (12 or more characters; also needs the database for most screens) |
| Reminders when the app is closed | `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (run `npx web-push generate-vapid-keys` once) and the Render **Starter** plan |
| Emails from the app (if you use the Kiddush board) | see `store/kiddush-setup.md` |
Details: `store/rabbi-setup.md`.

## 6. Your own address (optional but recommended)
Pick a subdomain such as `pushka.yourdomain.org`.
1. Render → your service → Settings → Custom Domains → add it. Render shows a value to point to.
2. At the company where your domain is registered, add a **CNAME** record: name `pushka`, value = what Render showed.
3. Wait (minutes to hours). Render makes the secure certificate automatically.
Your main website may be on Chabad.org or another site builder; that is fine, the app lives on the subdomain and your website just links to it.

## 7. Put the honor board on your website (optional)
`store/board-embed.md` has a copy-and-paste snippet.

## 8. Google Play (optional)
`store/android-guide.md`. You need to make your own screenshots and icon from your finished app.

## If something goes wrong
* The app says cards are "not set up yet": the Stripe keys are missing or wrong in Render. Check there are no spaces, and you saved.
* Reminders do not arrive: the Render service is on the free plan (it sleeps), or the push keys are missing.
* A test fails after you changed something: ask Claude to run `npm test` and read the first failure.
