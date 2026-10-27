# Kiddush Board Kit

A ready-made **Kiddush sponsorship system for a Chabad house**, built for Chabad of Lamorinda and packaged so any other Chabad can have its own.

**What you get**

| | |
|---|---|
| **TV board** (`/kiddush/tv/`) | Every Shabbat and Yom Tov of the Hebrew year on one screen, this week's Kiddush and its sponsor in the middle (or "Open for sponsorship" with a QR code), candle lighting and Havdalah times, molad on the Shabbat that blesses the new month, an "Upcoming events" box. Light look by default (`?theme=dark` for a dark wood look). The year flips by itself at Rosh Hashanah. |
| **Phone page** (`/kiddush/`) | Scan the QR code, pick a week (past weeks too), dedicate it in honor/memory of someone, pay. Scrolls to this week; the current week floats at the top. |
| **Payments** | Card, Apple Pay, Google Pay (Stripe), or Zelle, Venmo, check, cash. Non-card pledges stay off the board until you press "Confirm payment". Reminders (automatic or scheduled by you) for unpaid pledges. |
| **Staff page** (`/admin/kiddush/`) | Enter sponsors by hand, confirm payments, send/schedule/cancel reminders, add extra events people can sponsor, add calendar notes (yahrzeits, events), change prices and payment details, download a spreadsheet. |
| **Hebrew toggle** | One button flips the phone page and the TV to Hebrew (right-to-left). |

**Everything specific to your Chabad is in one file: [`chabad.config.json`](chabad.config.json)** (name, Hebrew name, city/time zone, contact details, prices, Zelle/Venmo/check details), plus your logo (`kiddush/img/logo.svg`). Secrets (passwords, Stripe keys) are never in files; they are settings on your hosting service.

## How to use this kit

* **You are a Rabbi / administrator, not a programmer?** Open [`PROMPT-TO-PASTE.txt`](PROMPT-TO-PASTE.txt), paste it into Claude (claude.ai or Claude Code) together with this whole folder (or the .zip), and Claude will interview you and set everything up with you step by step. Fill in [`ABOUT-YOUR-CHABAD.md`](ABOUT-YOUR-CHABAD.md) first if you like; it makes the interview faster.
* **Doing it yourself?** Follow [`SETUP-GUIDE.md`](SETUP-GUIDE.md) (about an hour, no coding).
* **Claude reading this?** Start with [`START-HERE-FOR-CLAUDE.md`](START-HERE-FOR-CLAUDE.md).
* **Want to change how it looks or add things later?** See [`CUSTOMIZING.md`](CUSTOMIZING.md).

## Costs (approximate, check current prices)

* Hosting on Render: free (the app goes to sleep when idle) or about $7/month (always on).
* Database on Neon: free tier is plenty.
* Stripe: no monthly fee; about 2.9% + 30¢ per card payment (sponsors can be offered to cover the fee).
* Optional: UptimeRobot (free) keeps a free Render app awake; Fully Kiosk Browser (a few dollars, one time) is a good way to run the TV.

## Good to know

* Built for communities **outside Israel** (two-day Yom Tov: Rosh Hashanah days 1 and 2, Sukkot days 1 and 2, Pesach days 1/2 and 7/8, Shavuos days 1 and 2). Prices are in US dollars.
* The calendar (parshiyos, holidays, molad, Hebrew dates) is generated automatically with the free Hebcal library, so there is no yearly maintenance.
* The Hebrew wording on the pages is a draft. Please have someone who reads Hebrew look it over.
* See [`NOTICE.md`](NOTICE.md) for licenses (the calendar library is GPL; fonts are open-licensed).

## Folder map

```
chabad.config.json     <- YOUR details (edit this)
kiddush/               <- the pages people see (TV, phone) and their images/fonts
  img/logo.svg         <- replace with your logo
server/                <- the program (you normally never edit this)
  admin/               <- the staff page
render.yaml            <- hosting settings for Render
.env.example           <- the secret settings you will enter on Render
```

Run the built-in checks with `npm install` then `npm test` (22 tests; needs nothing else).
