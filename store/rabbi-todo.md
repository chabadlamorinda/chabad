# The Rabbi's to-do list (things only you can do, at a computer)

## The website now runs on your own free Oracle server (moved Nov 19)
Done: server `website` (152.70.118.32, Oracle Always Free), jewishlamorinda.com switched at Cloudflare (A records, grey cloud), email works, data copied from Neon, Render suspended. Still to do: in Stripe turn OFF Settings → Customer emails → Successful payments; check the Stripe webhook shows 200; test gift of $5 (refund it). Every few weeks copy a backup off the server (Rabbi's desk → Download a full backup).

Phone-only upkeep: Rabbi area → Website and app → **Keys and settings** (change a key; server care), and ask Claude in chat for a restart, updates, disk clean-up or a backup (it runs within about 30 seconds).

**GitHub key for the CRM and Invitations apps (made Nov 19, 2026, expires in one year: about Nov 19, 2027).** A read-only fine-grained token (only chabad-crm and invitations, Contents: Read-only) saved in Keys and settings so the server can keep those two apps updated by itself. GitHub emails a warning before it expires. To renew: make a new one the same way (github.com/settings/personal-access-tokens/new) and paste it over the old one in Keys and settings. If updates ever stop, Keys and settings → Server care says "cannot reach GitHub".

Original plan:
Decision: no monthly fee, and email works there (Render's free plan blocks it). The full step-by-step is `deploy-oracle/MOVE-THE-WHOLE-WEBSITE.md` (create the server, install with one command carrying over the Render settings, copy the database from Neon, switch the address at Cloudflare; Render stays on as the fallback). Automatic updates from GitHub every 5 minutes. Claude walks through it when you say "I'm at a computer"; first you need an Oracle Cloud account (cloud.oracle.com, free, needs a card for identity only).

## Why few people come to the new website (Nov 20) — the most important items now
Google does not show jewishlamorinda.com yet: every search, the Google Business Profile, J. Weekly, Chabad.org's directory and years of old links still lead to the OLD site, chabadoflamorinda.com, which is still live. The new site is ready for Google (no blocks, sitemap of 4,300 pages, Analytics on). In this order:
1. **Send the old address to the new site** (the biggest step; every old page already has its new page): tell Claude "switch the old domain". Claude asks the server to accept chabadoflamorinda.com (maintenance action `old-domain`), then you change the DNS of chabadoflamorinda.com to the server (A record 152.70.118.32, wherever the domain is managed; if Chabad.org manages it, ask them to point it there). From then on, every old link and Google result opens the new site.
2. **Google Business Profile**: website = https://jewishlamorinda.com (the link people tap on Google Maps).
3. **Google Search Console** → URL inspection → "Request indexing" for the home page, /programs/hebrew-school, /shabbat and /events; check "Pages" for anything not indexed and send Claude a screenshot.
4. **Bing Webmaster Tools**: "Import from Google Search Console" (Bing feeds ChatGPT and Copilot).
5. Update the link on Facebook, Instagram, WhatsApp groups, email signature, J. Weekly's resource guide and the Chabad.org directory.

## Where we are (Nov 16)
Done: jewishlamorinda.com is connected and live (www jumps to it); Google Search Console verified and the sitemap sent; Google Analytics counting (G-N4642YEZXW). The old site chabadoflamorinda.com is untouched.
**Next, in this order (each about 5 minutes):**
1. Look the new site over on your phone with `store/launch-checklist.md`, and tell Claude what to fix.
2. In Render, set **Auto-Deploy** to "After CI Checks Pass" (item 22) and check the plan: on a free plan the site falls asleep when nobody visits and the first visitor waits; the cheapest paid plan (about $7 a month) keeps it awake. Worth it now that people will find it through Google.
3. Open the Rabbi area (jewishlamorinda.com/admin) → Setup checklist and tell Claude which lines are not green (email sending, database, Stripe, Facebook).
3b. **Stripe (so donations really arrive):** in Render → Environment look for `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` and tell Claude only "live", "test" or "missing" (never paste the keys). Then in Stripe: account activated with the bank account added, and the webhook `/api/stripe/webhook` (steps in `store/rabbi-setup.md`). Then a $5 test gift with your own card, refunded in Stripe.
4. Bing Webmaster Tools (bing.com/webmasters): "Import from Google Search Console". Bing feeds ChatGPT search and Copilot.
5. When happy: change the website link on the Google Business Profile to jewishlamorinda.com (do not make a second listing); then Claude moves the Google Ads grant to the new addresses (Google for Nonprofits and Ad Grants must list the new website: check with Google).
6. Connect jewishlamorinda.org (two CNAME records at Cloudflare, grey cloud, then Render → Custom Domains); it forwards to the .com.
7. Last, only when you decide: point chabadoflamorinda.com to the new site (old addresses already map to new pages).

When you say "I'm at a computer", Claude goes through this list with you one item at a time, with every click explained from A to Z. Most items are copying a code from one website and pasting it into Render (where the website lives). Nothing here costs money unless it says so.

Tick an item off by telling Claude it's done; Claude will check it works.

## Next time you're at a computer (asked for Oct 28)
**First: turn on real answers in the chat** (item 5). About 7 minutes: console.anthropic.com (account, $10 prepaid credit, a $10 monthly limit, Create Key) then Render, chabad-lamorinda-app, Environment, add `ANTHROPIC_API_KEY`, Save. Then Claude tests the chat on the live site.

## At a computer
1. **Database** (needed for sign-in, RSVPs, the Rabbi area lists and "Requests from the website"). Free at neon.tech; paste one code into Render as `DATABASE_URL`. Skip if already done; Claude will check.
2. **Password for the Rabbi area** (`ADMIN_PASSWORD` in Render). Skip if you already sign in at /admin.
3. **Email sending** (`SMTP_URL`, `MAIL_FROM`): sign-in codes, RSVP confirmations, the emails to you about mezuzah / tefillin / giving / meeting requests, and **the weekly email** (everyone who signs up on the website). Uses your Google account (an "App Password"). A regular Gmail account can send about 500 emails a day, Google Workspace about 2,000; when the list grows past that, Claude will move it to a free-tier email service. After this is set up: Rabbi area → Website → Weekly email → "Ask the unconfirmed again" (people who signed up before sending worked), "Send me a test", and turn on "Send it by itself every week" if you like.
4. **Where your notifications go** (`ADMIN_EMAIL` in Render): the email address that should receive requests and form submissions.
5. **AI answers in the chat** (`ANTHROPIC_API_KEY`), **costs money but little**: create a key at console.anthropic.com, add a payment method, and set a monthly spending limit there. Without it the chat stays free and answers from the website.
6. **Facebook and Instagram** (`FB_PAGE_ID`, `FB_PAGE_TOKEN`, `IG_USER_ID`): photos from your page on the website, and one-button posting of events.
7. **Google Business Profile**: claim or update the listing, point it to the new website, and add Lafayette, Moraga, Orinda, Pleasant Hill and Martinez as service areas.
8. **Google Analytics** (`GA_ID`), optional: see how many people visit and RSVP.
9. **Look over the preview and say "go ahead"**: https://chabad-lamorinda-app.onrender.com/
10. **Launch day** (after "go ahead"): connect chabadoflamorinda.com to the new site, then Google Search Console and Bing (so Google, ChatGPT and Copilot find it).
11. **Phone notifications for the app** (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`), optional: Claude generates the two keys for you; you paste them.

## Website address
20. ✓ Bought (Oct 28). **Connect jewishlamorinda.com and jewishlamorinda.org** (both looked available on Oct 28; .com is the main address, .org forwards to it): Bought at Cloudflare. Turn on auto-renew. Then, at a computer, Claude walks you through connecting it to Render (about 15 minutes, steps in `store/website-setup.md` section 4b) and switches the site's address. For now jewishlamorinda.com is the **test address** (Oct 28: "see if it gets any traffic"); you can pick the final domain later, and a 301 forward keeps Google rankings if you switch. Google and Bing may list the site automatically as soon as PUBLIC_URL is jewishlamorinda.com (you said yes on Oct 28; nothing to set). Then add the site to Google Search Console (item on launch). Registrar: **Cloudflare**.

## Ideas you liked (a few minutes each)
12. **Google review link:** in Google Business Profile, tap "Ask for reviews" and send Claude the link. After every event, the thank-you email will ask happy guests for a review (the #1 thing for "synagogue near me" and Google Maps).
13. **Nextdoor:** join Nextdoor as Chabad of Lamorinda (or with your own account). Then for each event, Rabbi area → Social drafts → "Copy & open Nextdoor" and paste.
14. **Local calendars:** for each event, "Copy for local calendars" and paste it into the community calendar forms of Lamorinda Weekly and Patch (Claude will find the links with you).
15. **A 60-second Shabbat thought on video,** filmed on your phone each week. Send it to Claude; it becomes a page, goes in the weekly email and on Facebook and Instagram.
16. **New-homeowner mezuzah offer:** tell Claude what to offer Jewish families who just moved in (a free mezuzah check? a mezuzah at cost, put up by you?). Claude builds the page and a welcome note for realtors.
17. **Holiday kits to order online** (Chanukah menorah kit, Purim baskets, shmurah matzah): tell Claude what you offer and the prices.
18. **WhatsApp announcements group:** create a WhatsApp Community or announcements group and send Claude the invite link; a "Join" button goes on every page and email.
19. **Partners:** Saint Mary's College in Moraga (Jewish students), local senior communities, school parent groups, and realtors. Tell Claude which to start with and Claude drafts the first emails for you.

20. **More ways to pay in campaigns (5 minutes, free to switch on):** in Stripe, Settings → Payment methods, switch on **ACH Direct Debit (bank account)**, which costs far less than a card for large gifts (0.8%, at most $5), and **Link**, **Cash App Pay** and any others you like. They then appear by themselves on the secure payment page of every campaign and of /donate. Apple Pay and Google Pay are already on.

21. **Finances, first look (10 minutes):** open the Rabbi's desk → Finances → "Bring in online gifts now". Every online gift since the website started comes in. Then add this year's checks and the main expenses (rent, utilities...), and set a budget under Reports. If it says Stripe refused, the Stripe key in Render needs permission to read balance transactions (Claude will walk you through it).

22. **Updates can never break the site (2 minutes, free):** in Render → chabad-lamorinda-app → Settings → Build & Deploy → **Auto-Deploy**, choose **"After CI Checks Pass"**. From then on, every update is tested on GitHub first and goes live only if every test passes. (The site also checks its own main pages before Render switches visitors to a new version, so a broken update stays offline and the working version keeps running.)

23. **Backups (5 minutes, free):** a full copy of the database is emailed to you every Sunday once email sending works (item 3), and the Rabbi's desk has **"Download a full backup"** any time. In Neon (where the database lives), also check that **"History retention"** is on (Neon keeps a restorable history; on the free plan it is short), so a mistake from today can be undone.

## Questions you can answer any time (no computer needed)
* Should "Talk privately with the Rebbetzin" go to the Rebbetzin's own cell phone? If so, which number? (Right now it goes to 925-384-7242 with a message addressed to her.)
* Chanukah: date, time and place of the Grand Menorah Lighting, and any party, kids' event or Shabbat Chanukah dinner.
* Yud Tes Kislev farbrengen (you said yes): what day, time and place, and is there an RSVP?
* The rest of the open questions are in `store/content-to-confirm.md`.

## Record the Chanukah blessings (audio)
The guide /learn/chanukah-menorah plays Chabad.org's video and links to its audio of the blessings. To have your own voice on the page: record about a minute on your phone (the three blessings, Haneirot Halalu, Maoz Tzur), send it to Claude in the chat, and it goes on the page as a play button (`audio:` line in the guide).

## Bandwidth (Render email, Nov 18)
Render warned that 70% of the 5 GB monthly bandwidth is used. Going over costs $15 per 100 GB (15 cents a GB), so it is small money, and it resets each month. The site already compresses pages and keeps pictures in browsers (photos for a year since Nov 18). To cut it more: put Cloudflare in front (turn the cloud ORANGE on the two jewishlamorinda.com DNS records and set SSL/TLS to "Full (strict)"; Cloudflare then serves pictures and styles from its own copies), or move up a Render plan. Do the Cloudflare step after Chanukah, with Claude.

24. **My Pushka sign-in and gift emails (15 minutes):** Rabbi area → Website and app → Keys and settings: make sure `SMTP_URL` and `MAIL_FROM` are saved (sign-in codes and gift emails need them). In Stripe → Developers → Webhooks, the endpoint must be `https://jewishlamorinda.com/api/stripe/webhook`. Then open `https://jewishlamorinda.com/pushka/?signin=1`, sign in, and make a $1 test gift in Stripe test mode. The install page for phones is `https://jewishlamorinda.com/app`. (Claude is reminding you on Nov 20.)
