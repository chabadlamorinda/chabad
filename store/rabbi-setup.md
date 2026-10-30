# Turning on yahrzeits, reminders, the Rabbi area and payment alerts

Everything below is **optional**. The app and card payments work without it; these steps switch on the extra features. Do them in order. Each step is done in your own accounts (Render, Stripe), so I cannot do them for you.

## 1. A database (required for everything below)
Yahrzeits shared with you, reminders and payment alerts need somewhere to be stored.

- **Easiest free option: Neon** (neon.tech) → create a project → copy the *connection string* (starts with `postgres://`).
- **Or Render Postgres** (about $6/month, in your Render dashboard → New → PostgreSQL → copy *Internal Database URL*).

In Render → your service **chabad-lamorinda-app** → **Environment** → add `DATABASE_URL` = that string → Save. The app creates its tables by itself.

## 2. Your private Rabbi page
In Render → Environment add `ADMIN_PASSWORD` = a long password (12+ characters, e.g. four random words). Then open `https://<your-app-address>/admin/` and sign in.
There you will see:
- **Yahrzeits** in the next 60 days from people who chose to share, with their name/email/phone, a place for your follow-up note, a "Followed up" tick, and a CSV download. Dates that need a ruling (Adar in a leap year, the 30th of a short month) are flagged.
- **Members**, **Payment issues** (failed gifts) and **Send a message** (a notification to everyone who turned notifications on).

If `ADMIN_PASSWORD` is not set (or is shorter than 12 characters) the page does not exist.

## 3. Notifications on closed apps (needs an always-on server)
1. On your computer run `npx web-push generate-vapid-keys` (or ask me to give you a pair). It prints a **Public** and a **Private** key.
2. Render → Environment: `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.
3. Change the service plan from **Free** to **Starter** (about $7/month). The free plan falls asleep, and a sleeping server cannot send reminders at 8 am or before candle lighting.

## 4. Failed-payment alerts (Stripe webhook)
Stripe → **Developers → Webhooks → Add endpoint**:
- Endpoint URL: `https://<your-app-address>/api/stripe/webhook`
- Events: `invoice.payment_failed`, `invoice.paid`, `payment_intent.payment_failed`, `payment_intent.succeeded`, `charge.refunded`, `customer.subscription.deleted`, and for the Kiddush board `checkout.session.completed`, `checkout.session.expired`
- After saving, copy the **Signing secret** (`whsec_…`) into Render as `STRIPE_WEBHOOK_SECRET`.

Donors whose card fails then see "We couldn't charge your card — Update card" in the app, and it appears on your Payment issues tab. Do this once for test mode and once again for live mode.

## 5. Apple Pay and Google Pay (optional)
- **Google Pay** needs nothing: it appears automatically on Android/Chrome when the donor has a card in Google Pay.
- **Apple Pay**: Stripe → Settings → Payment methods → Apple Pay → **Add new domain** → enter your app's domain → Stripe gives you a file; open it in a text editor, copy everything and paste it into Render as `APPLE_PAY_ASSOC`. Back in Stripe press **Verify**.

## Sign-in: "your own pushka" for everyone (optional)
This lets anyone you send the link to sign in with their email and have **their own pushka for Chabad of Lamorinda** that follows them to every phone or computer. Money still goes to Chabad of Lamorinda. No one needs an account: it is only offered.
It needs two things in Render → Environment:
1. `DATABASE_URL` (step above).
2. Email, so the 6-digit code can be sent: `SMTP_URL` and `MAIL_FROM`. Easiest is a Gmail address with an **App password** (Google Account → Security → 2-Step Verification → App passwords): `SMTP_URL` = `smtps://yourname%40gmail.com:APPPASSWORD@smtp.gmail.com:465` (write `@` as `%40`), `MAIL_FROM` = `My Pushka <yourname@gmail.com>`. A mail service such as Resend or Brevo also works.
When both are set, the app shows **Sign in** by itself. Send people **https://your-site/pushka/?signin=1**, which opens the sign-in right away; the plain link works too, and they can also "Install the app" from More → Profile. Until both are set, the app works exactly as before on one device.

## Privacy
Sharing is **off by default** and only the people who switch it on appear on your page. The privacy policy inside the app already says this. If you later change what you collect, update `pushka/privacy.html` and the Google Play "Data safety" form.

## Cost summary
Free: Neon database, Apple/Google Pay, webhooks. About $7/month: always-on Render server (needed only for push reminders).
