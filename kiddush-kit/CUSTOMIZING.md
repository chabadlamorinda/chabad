# Customizing the Kiddush board

## 1. Everything about your Chabad: `chabad.config.json`
Open it in any text editor. Keep the quote marks and commas as they are. Anything left `""` is simply turned off. After editing, redeploy (on Render, pushing the change to GitHub does it automatically).

| Section | What it controls |
|---|---|
| `organization` | Your name in English and Hebrew, and the two short lines in the TV header (`headerLine1`/`headerLine2`) |
| `location` | Time zone, zip code (or `geonameid` outside the US) for candle lighting/Havdalah, and the minutes before sunset / after sunset |
| `contact` | Email and phone shown to sponsors (the "contact the Rabbi about a larger or deluxe Kiddush" line) |
| `publicUrl` | Your web address for the TV's QR code (optional; can also be set in the staff page) |
| `prices` | Shabbat, holiday and whole-board prices, and the line describing what a sponsorship includes (English and Hebrew) |
| `payments` | Cards on/off, "cover the card fee" offer, Zelle, Venmo, check payee and address, cash |
| `board` | Whether to include a Purim Kiddush; optional custom Mi Sheberach text (`blessing`, `blessingHe`) |
| `reminders` | Automatic reminder emails and after how many days |

**Config file vs. staff Settings page.** The config gives starting values. Later you can change prices, payment details, contact info and reminders from the staff page (Settings tab) and those saved values win from then on. The name, time zone, location and TV header lines come only from the config file.

## 2. Your logo
Replace `kiddush/img/logo.svg`. A logo about 300×190 pixels (wide) with a transparent background works best, in gold/brown tones for the light look. If your file is a PNG or JPG, put it in `kiddush/img/` and change the file name in `kiddush/index.html` and `kiddush/tv/index.html` (search for `logo.svg`).

## 3. Colors
* **Phone page:** the first line of `kiddush/sponsor.css` defines the palette (`--bg` background, `--ink` text, `--brown` headings, `--gold`/`--gold-d` accents, `--card1`/`--card2` tile gradient, `--line` borders).
* **TV (light look):** `kiddush/tv-light.css` uses the same colors written out (search for `#f8f0da`, `#5e2f1a`, `#c39a3a`, `#fdf6d9`, `#f1dc98`, `#8a6414`, `#7a3a22`). Replace them with your own colors; they appear in a handful of places.
* The "Upcoming events" box is blue in `kiddush/tv.css` (search for `.events`).
Ask Claude: "change the board's colors to navy and silver" and point it at these files.

## 4. Wording and Hebrew
All English text is in `kiddush/sponsor.js`, `kiddush/tv.js` and the HTML files. The Hebrew for each English sentence is in the dictionary at the top of `kiddush/i18n.js` (English text on the left, Hebrew on the right). If a sentence has no entry, it stays in English. The Hebrew was drafted by an AI and **should be reviewed by someone who reads Hebrew**.
The dedication choices (In honor of, In loving memory of, Refuah, Celebration, Merit) are in `server/kiddush.js` (`KINDS`) and `kiddush/i18n.js` (`KINDS_HE`).

## 5. Things the staff page already lets you do (no code)
* Enter a sponsor by hand, mark payments received, release a week, hide a week (for example when you are away), rename a week, change one week's price.
* **Add an event**: anything else people can sponsor (a Chanukah party, Lag BaOmer, a Shabbaton).
* **Calendar notes**: a yahrzeit, "Shiur Tuesday 8pm", any date-based note. It appears with that week's Kiddush and in the TV's "Upcoming events" box.
* Send, schedule or cancel reminders for pledges waiting for payment.
* Download a spreadsheet of every sponsorship.

## 6. Addresses and options
* TV: `/kiddush/tv/` (add `?theme=dark` for the dark wood look, `?lang=he` for Hebrew)
* Phone: `/kiddush/` (`?lang=he` for Hebrew; `?w=<week>` opens a particular week; the TV's QR code uses this)
* Staff: `/admin/kiddush/`

## 7. Not included / limits
* Communities **outside Israel** (two-day Yom Tov); US dollars.
* Only one Hebrew year is shown at a time; it flips at Rosh Hashanah automatically (override in Settings → "Year shown on the board").
