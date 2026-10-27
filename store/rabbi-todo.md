# The Rabbi's to-do list (things only you can do, at a computer)

When you say "I'm at a computer", Claude goes through this list with you one item at a time, with every click explained from A to Z. Most items are copying a code from one website and pasting it into Render (where the website lives). Nothing here costs money unless it says so.

Tick an item off by telling Claude it's done; Claude will check it works.

## At a computer
1. **Database** (needed for sign-in, RSVPs, the Rabbi area lists and "Requests from the website"). Free at neon.tech; paste one code into Render as `DATABASE_URL`. Skip if already done; Claude will check.
2. **Password for the Rabbi area** (`ADMIN_PASSWORD` in Render). Skip if you already sign in at /admin.
3. **Email sending** (`SMTP_URL`, `MAIL_FROM`): sign-in codes, RSVP confirmations, and the emails to you about mezuzah / tefillin / giving / meeting requests. Uses your Google account (an "App Password").
4. **Where your notifications go** (`ADMIN_EMAIL` in Render): the email address that should receive requests and form submissions.
5. **AI answers in the chat** (`ANTHROPIC_API_KEY`), **costs money but little**: create a key at console.anthropic.com, add a payment method, and set a monthly spending limit there. Without it the chat stays free and answers from the website.
6. **Facebook and Instagram** (`FB_PAGE_ID`, `FB_PAGE_TOKEN`, `IG_USER_ID`): photos from your page on the website, and one-button posting of events.
7. **Google Business Profile**: claim or update the listing, point it to the new website, and add Lafayette, Moraga, Orinda, Pleasant Hill and Martinez as service areas.
8. **Google Analytics** (`GA_ID`), optional: see how many people visit and RSVP.
9. **Look over the preview and say "go ahead"**: https://chabad-lamorinda-app.onrender.com/
10. **Launch day** (after "go ahead"): connect chabadoflamorinda.com to the new site, then Google Search Console and Bing (so Google, ChatGPT and Copilot find it).
11. **Phone notifications for the app** (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`), optional: Claude generates the two keys for you; you paste them.

## Questions you can answer any time (no computer needed)
* Does 925-384-7242 receive texts and WhatsApp, or should those go to a different cell number?
* Should "Talk privately with the Rebbetzin" go to the Rebbetzin's own cell phone? If so, which number? (Right now it goes to 925-384-7242 with a message addressed to her.)
* Chanukah: date, time and place of the Grand Menorah Lighting, and any party, kids' event or Shabbat Chanukah dinner.
* Is there a Yud Tes Kislev farbrengen (Saturday night Nov 28 / Sunday Nov 29)?
* Kabbalat Shabbat: is "candle lighting rounded down to the quarter hour, never after 6:45" right? (It gives 4:30 PM in mid-November.)
* The rest of the open questions are in `store/content-to-confirm.md`.
