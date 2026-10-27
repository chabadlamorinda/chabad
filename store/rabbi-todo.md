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

## Ideas you liked (a few minutes each)
12. **Google review link:** in Google Business Profile, tap "Ask for reviews" and send Claude the link. After every event, the thank-you email will ask happy guests for a review (the #1 thing for "synagogue near me" and Google Maps).
13. **Nextdoor:** join Nextdoor as Chabad of Lamorinda (or with your own account). Then for each event, Rabbi area → Social drafts → "Copy & open Nextdoor" and paste.
14. **Local calendars:** for each event, "Copy for local calendars" and paste it into the community calendar forms of Lamorinda Weekly and Patch (Claude will find the links with you).
15. **A 60-second Shabbat thought on video,** filmed on your phone each week. Send it to Claude; it becomes a page, goes in the weekly email and on Facebook and Instagram.
16. **New-homeowner mezuzah offer:** tell Claude what to offer Jewish families who just moved in (a free mezuzah check? a mezuzah at cost, put up by you?). Claude builds the page and a welcome note for realtors.
17. **Holiday kits to order online** (Chanukah menorah kit, Purim baskets, shmurah matzah): tell Claude what you offer and the prices.
18. **WhatsApp announcements group:** create a WhatsApp Community or announcements group and send Claude the invite link; a "Join" button goes on every page and email.
19. **Partners:** Saint Mary's College in Moraga (Jewish students), local senior communities, school parent groups, and realtors. Tell Claude which to start with and Claude drafts the first emails for you.

## Questions you can answer any time (no computer needed)
* Should "Talk privately with the Rebbetzin" go to the Rebbetzin's own cell phone? If so, which number? (Right now it goes to 925-384-7242 with a message addressed to her.)
* Chanukah: date, time and place of the Grand Menorah Lighting, and any party, kids' event or Shabbat Chanukah dinner.
* Yud Tes Kislev farbrengen (you said yes): what day, time and place, and is there an RSVP?
* The rest of the open questions are in `store/content-to-confirm.md`.
