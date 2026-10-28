# My Pushka: an app for your Chabad house

This kit lets a Chabad house (or any charity) have its own **"My Pushka" tzedakah app**: a digital charity box people fill with small coins every day, then empty with one tap into a real card donation, with no forms and no redirects.

It was built for Chabad of Lamorinda (California) and shared so other shluchim can use it for free.

## What your community gets
* A pushka that visibly fills with coins, a daily streak, reminders before Shabbat, achievements, a kids' mode, and undo for mistakes.
* One-tap giving from the saved card (Stripe): one-time or monthly, to the funds you choose, with a dedication and automatic receipts. Apple Pay and Google Pay appear automatically.
* **Chai Club:** monthly donors at Bronze, Silver, Gold and Platinum levels, shown on an honor board of brass nameplates (by name or anonymously). The board can be put on your website.
* Yahrzeit dates with reminders (a month, a week and a day before) and optional sharing with the Rabbi, birthdays and anniversaries, donate in honor or memory, the Maaser calculator, 40 segulos and prayers.
* English and Hebrew (right-to-left), works on any phone as an installable app, and can be published in Google Play.
* A private page for you: monthly donors, yahrzeits (only from people who chose to share), failed payments, announcements, and notifications to everyone.

## What is in this folder
| | |
|---|---|
| `chabad.config.json` | **The one file that makes it yours** (names, address, funds, payments). |
| `scripts/customize.js` | Applies that file to the whole app. Safe to run again any time. |
| `START-HERE-FOR-CLAUDE.md` | Instructions for the AI assistant that sets it up with you. |
| `PROMPT-TO-PASTE.txt` | The message to give Claude together with this folder. |
| `ABOUT-YOUR-ORGANIZATION.md` | The questions Claude will ask you (you can fill them in first). |
| `SETUP-GUIDE.md` | Putting it online: GitHub, Render, Stripe, database, your own address. |
| `CUSTOMIZING.md` | Changing colors, the logo, wording, funds and levels. |
| `pushka/` | The app people use. `server/` is the program behind it. `board/` is the honor board. |
| `kiddush/` | An optional Kiddush sponsorship board (has its own guide: `store/kiddush-setup.md`). |
| `store/` | Guides for the staff page, the website board, and Google Play. |

## Fastest way
1. Open Claude (claude.ai, or Claude Code if you have it) and attach this whole folder (or the zip).
2. Paste the text from `PROMPT-TO-PASTE.txt`.
3. Answer Claude's questions. It will do the technical parts and tell you exactly what to click for the rest.

You will need (Claude will walk you through each): a free GitHub account, a Render account (free to try, about $7/month so reminders work), a Stripe account in your organization's name, and, optionally, a free Neon database and your own web address.

## What this kit does NOT include
Your logo, your Stripe account, your passwords, your domain, your Google Play account, and a review of the Hebrew and legal wording by people you trust. These are yours to add. See `START-HERE-FOR-CLAUDE.md` for the list.
