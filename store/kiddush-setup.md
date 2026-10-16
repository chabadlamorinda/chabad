# Kiddush board: TV display, sponsor page and your admin page

Three addresses on the same server as the pushka app (replace `<your-app-address>` with your Render address):

| What | Address | For |
|---|---|---|
| **TV display** | `https://<your-app-address>/kiddush/tv/` | The big screen at shul |
| **Sponsor page** | `https://<your-app-address>/kiddush/` | Phones: pick a week, dedicate it, pay. The TV's QR code opens it. |
| **Your admin page** | `https://<your-app-address>/admin/kiddush/` | Enter sponsors, mark payments received, settings |

## One-time setup
1. **Database.** Sponsorships are stored in the same Postgres as the Rabbi area. If you already did step 1 of [`rabbi-setup.md`](rabbi-setup.md) (`DATABASE_URL`) and step 2 (`ADMIN_PASSWORD`), you are done. The tables are created automatically. Without a database the TV still shows the calendar, but nobody can sponsor.
2. **Stripe (cards, Apple Pay, Google Pay).** Uses the same `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` as the pushka. In the Stripe webhook (Developers → Webhooks) also tick **`checkout.session.completed`** and **`checkout.session.expired`**. The page still confirms payments when the donor returns from Stripe, but the webhook covers donors who close their browser right after paying. In Stripe → Settings → Payment methods, turn on Apple Pay / Google Pay / Link if you want them offered.
3. **Admin page → Settings.** Enter your **Zelle email or phone** (Zelle stays hidden until you do), check the Venmo name, mailing address, and set the **prices** (both start at $180). Optional: the "Donated by" line on the TV.

## On the TV
(The TV has a light look by default, matching the sponsor page. To use the dark wood board instead, add `?theme=dark` to the TV address, e.g. `/kiddush/tv/?theme=dark`. No prices are shown on the TV.)

**Hebrew:** both the sponsor page and the TV have a small **עברית / English** button (top corner on phones; faint bottom-left corner on the TV). The choice is remembered, and you can force it with `?lang=he`. The Hebrew wording is a draft: review it, and edit the Hebrew blessing and the Hebrew "standard Kiddush" line under Staff → Settings.

Open the TV address in the TV's web browser (or a laptop / Chromecast / Fire Stick plugged into it) and press **F11** for full screen. It refreshes itself every minute, keeps showing the last board if the wifi drops, and switches to the new year at Rosh Hashanah by itself. The center plate always shows the **next upcoming Kiddush**: who sponsored it and why, or "Open for sponsorship" with a QR code that goes straight to that week.

## Payments: nothing appears on the board until you confirm it
* **Card (Stripe)** payments confirm themselves and the name appears right away.
* **Zelle, Venmo, check and cash** pledges are held in **Waiting for payment** and do **not** appear on the TV or the phone page until you press **Confirm payment**. The sponsor sees instructions on how to send the payment and a thank-you saying their name will appear once the payment is confirmed.
* **Reminders:** a pledge unconfirmed after **3 days** is flagged in red in that tab, and you can press **Send reminder** at any time. With email set up (below) the reminder goes out automatically after 3 days, then every 3 days, up to 3 times, and a thank-you email goes out when you confirm. Without email set up, **Send reminder** opens a ready-to-send email in your own mail app.
* **Past weeks** that had no sponsor can still be sponsored afterwards, in honor or in memory of someone. They show on the board once confirmed.

### Turning on automatic emails (optional, uses your Gmail)
1. In your Google account turn on 2-step verification, then create an **App password** (Google Account → Security → App passwords).
2. In Render → Environment add:
   * `SMTP_URL` = `smtps://chabadlamorinda%40gmail.com:YOUR_APP_PASSWORD@smtp.gmail.com:465` (use your own address with `@` written as `%40`, and the app password without spaces)
   * `MAIL_FROM` = `Chabad Lamorinda <chabadlamorinda@gmail.com>`
3. Save. Settings → Payment reminders lets you switch automatic reminders off or change the 3 days.

## What the Rabbi does
* **The board** tab: the whole year. Tap any row to add a sponsor by hand (someone who handed you a check), edit one, mark it paid, remove it, rename a week, change its price, or **hide** it (for example a week you are away).
* **Waiting for payment** tab: people who pledged with Zelle, Venmo, check or cash. Tap **Confirm payment** when the money arrives; only then does their name show on the TV and phone page. **Send reminder** nudges them.
* **Add an event**: anything else people can sponsor (a Chanukah party, Lag BaOmer, a Shabbaton).
* **Download spreadsheet**: every sponsorship with contact details, for thank-you notes and records.

## How a week is held
* A card checkout holds the week for up to 35 minutes; if the donor never pays, it opens again by itself.
* Zelle / Venmo / check / cash reservations stay until you mark them paid or remove them (the tab shows how many days each has waited).
* Two people can never sponsor the same week, even if they tap at the same moment.

## What's on the board
Every Shabbat (by parshah, combined parshiyos included, with Shabbat Shuva / Shekalim / Zachor… noted), Rosh Hashanah days 1 and 2, Yom Kippur break-fast, Sukkot days 1 and 2, Shabbos Chol Hamoed (Sukkot and Pesach), Shemini Atzeret, Simchat Torah, Pesach days 1, 2, 7 and 8, Shavuos days 1 and 2, and Purim. The board shows **one year at a time and changes automatically**: 5787 now (Sep 2026 to Sep 2027), then 5788 once the last 5787 Kiddush has passed, and so on every year, with no work from you. (Settings has an optional override if you ever want to force a specific year.)

## A nicer address (optional)
Add a custom domain such as `kiddush.chabadoflamorinda.com` in Render (same steps as in the main README). An address starting with `kiddush.` opens the sponsor page directly. Then put it in Settings → "Web address for the QR code" so the TV's QR code and web address use it.

## Notes on the old board
The calendar is generated, so it differs from the printed 5786 board in three places: Yom Kippur is **Oct 2** (10 Tishrei), not Oct 1; **Haazinu** (Oct 4) is included; and Behar-Bechukotai appears once.
