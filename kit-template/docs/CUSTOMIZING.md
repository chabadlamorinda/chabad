# Changing things

Everything about your organization lives in `chabad.config.json`; run `node scripts/customize.js` after changing it (it is safe to run again and again).

## Logo and icons
* `pushka/logo.svg` is the logo shown in the app (header, nameplate seal). Replace it with yours. Use a transparent background; it appears on dark blue and inside a white circle.
* App icons: `pushka/icon-192.png`, `icon-512.png`, `icon-180.png`, `icon-maskable-512.png` (and `icon.svg`). Make them free at pwabuilder.com/imageGenerator.

## Colors and fonts
`pushka/pushka.css`, the block at the top (`:root`) holds the colors; the home screen's dark stage is the `#app.home` block. The fonts are Cormorant Garamond (headings) and Assistant (text), loaded in `pushka/index.html`.

## The pushka's look
The tin is drawn in `pushka/pushka.js` in the function `tin()` (colors, the gold nameplate). The nameplate text comes from your organization name.

## Funds
Edit `funds` in `chabad.config.json` (ids stay small letters; keep `general` and `chai`), then run the customize script. It updates the app, the server and the Hebrew names.

## Chai Club levels
Bronze $72, Silver $180, Gold $360, Platinum $720 a month. They are set in three places that must match: `server/index.js` (`CLUB_LEVELS`), `pushka/pushka.js` (`CLUB` and `CLUB_RANGE`) and `board/board.js` (`LEVELS`). Ask Claude to change them together and run `npm test`.

## Wording and Hebrew
Every sentence in the app is in `pushka/pushka.js` and its Hebrew is in `pushka/i18n.js`, looked up by the exact English sentence. If you change an English sentence in `pushka.js`, change the same sentence (the left side) in `i18n.js` or its Hebrew will disappear. The segulos are in `pushka/segulos.js` (English) and `pushka/segulos.he.js` (Hebrew).

## Reminders
The defaults (a Shabbat reminder on; yahrzeit reminders a month, a week and a day before) are in `pushka/pushka.js` (`def()`), and the messages sent by the server are in `server/scheduler.js`.

## Privacy policy and support page
`pushka/privacy.html` and `pushka/support.html`. Have them reviewed for your situation.

## Other countries
The kit assumes US dollars, Stripe, US tax wording and US-zip candle times (`server/scheduler.js`, `location.candleZip`). Elsewhere these need small code changes: ask Claude.
