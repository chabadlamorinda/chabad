# The new website: setup and launch

The new site runs on the same Render service as My Pushka and the Kiddush board (`chabad-lamorinda-app`), so one database holds members, families, yahrzeits, donations and RSVPs.

**Preview address (before launch):** https://chabad-lamorinda-app.onrender.com/
The preview tells Google and AI crawlers to stay away until launch day, so it cannot compete with the current site.

Everything below is done once, in Render → **chabad-lamorinda-app** → **Environment**, unless noted.

## 1. Accounts and RSVPs (needed)
* **DATABASE_URL**: already used by the Rabbi area. Without it the site works but sign-in and RSVP are off.
* **SMTP_URL** and **MAIL_FROM**: sign-in codes and RSVP confirmations are emailed. For Gmail / Google Workspace:
  `SMTP_URL = smtps://info%40chabadoflamorinda.com:APP_PASSWORD@smtp.gmail.com:465` (an App Password from Google Account → Security → App passwords) and
  `MAIL_FROM = Chabad of Lamorinda <info@chabadoflamorinda.com>`.

## 2. Facebook (photos in, events out)
1. Go to developers.facebook.com → **My Apps → Create App** → type **Business**.
2. Add the product **Facebook Login for Business**, then open **Tools → Graph API Explorer**.
3. Choose your app, then **Get Page Access Token**, tick the Chabad of Lamorinda page, and grant `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.
4. Exchange it for a **long-lived** token (Access Token Debugger → *Extend Access Token*), then request `/me/accounts` in the Explorer: copy the page's `id` and `access_token`.
5. In Render add **FB_PAGE_ID** and **FB_PAGE_TOKEN**.

6. **Instagram (optional):** connect the Instagram account to the Facebook page (Instagram must be a Business or Creator account), add the permissions `instagram_basic` and `instagram_content_publish`, request `/{page-id}?fields=instagram_business_account` in the Explorer and put that id in **IG_USER_ID**.

What it does:
* Photos from the page fill the top of the home page and appear on `/photos` (refreshed hourly).
* **Social drafts** (Rabbi area → *Website: RSVPs & birthdays*): every event you add to the website automatically appears there as a ready-made post with the flyer or photo, date, place, RSVP link and local hashtags. Edit the words if you like and press **Publish**: it goes to the Facebook page (and Instagram) in one step. The list shows what has already been posted.
* Facebook no longer lets outside apps create Facebook *Events*. Each draft therefore also has **Copy & open Facebook Events**, which copies the text and opens Facebook's event form if you want a real Facebook Event too.
Boosting a post (paid promotion) is done in Facebook's Meta Business Suite.

## 3. Google
* **Google Search Console** (search.google.com/search-console): on launch day add `chabadoflamorinda.com`. Verify with the *HTML tag* option: copy only the code inside `content="..."` into **GOOGLE_SITE_VERIFICATION**. Then submit `https://www.chabadoflamorinda.com/sitemap.xml`.
* **Bing Webmaster Tools** (bing.com/webmasters): Bing's index powers ChatGPT search and Microsoft Copilot. Import from Google Search Console in one click, or put the meta tag code in **BING_SITE_VERIFICATION**. **INDEXNOW_KEY** (already generated) tells Bing about new pages every time the site updates.
* **Google Calendar**: every event page has *Add to Google Calendar*; the Social drafts screen has the same link.
* **Google Business Profile** (business.google.com): claim or update "Chabad of Lamorinda", category *Synagogue* (add *Preschool* and *Jewish school* as extra categories). Set the website to the new address, add Lafayette, Moraga, Orinda, Pleasant Hill and Martinez as *service areas*, and post events there: the Social drafts screen has a **Copy Google Business post** button for each event. This is the biggest lever for "synagogue near me" and Maps. (Google only gives automatic posting to large companies, so this one is copy and paste.)
* **Google Analytics / Google Ads**: create a GA4 property (or an Ads conversion tag) and put its id (`G-...` or `AW-...`) in **GA_ID**. RSVPs are recorded as an `rsvp` event so ads can be measured.
* **Google Ad Grants** ($10,000/month of free search ads, which you already have): the full campaign plan, with keywords and the page for each, is in [`store/google-ad-grants.md`](google-ad-grants.md).
* Events already carry Google's Event markup, so they can appear in Google's event listings once the site is indexed.

## 4. The "Ask us" chat
The chat box ("Ask us", bottom corner of every page) answers in English, Hebrew or Russian, suggests follow-up questions to tap, knows which page the visitor is reading, and can send the conversation to you ("Send to the Rabbi").

* **Free by default:** without a key it answers from the website itself (the best matching question and answer, guides and pages, plus your phone number).
* **Claude answers (not free, but cheap):** in Render → Environment add **ANTHROPIC_API_KEY** (create it at console.anthropic.com → API keys, and add a payment method or prepaid credits there; this is billed separately from any Claude subscription). It always uses Claude Haiku 5.5, the cheapest and fastest model. Each question sends the website's core facts (cached, so they are billed at a reduced rate) plus only the 3 to 4 guides that match, and answers are kept short.
* **Spending cap:** at most **300 Claude answers a day** (change with **CHAT_DAILY_LIMIT**); after that the free answers take over until the next day. You can also set a monthly spend limit in the Anthropic console.
* **Walled off:** the chat has no access to the database, accounts, family details, forms, donations, drafts or the Rabbi area. It only sees published website content and what the visitor types. Visitors' questions (only the question text) are listed for you in the Rabbi area so you can see what people ask.

## 4b. Connect jewishlamorinda.com (bought at Cloudflare)
About 15 minutes. Free. jewishlamorinda.com is the main address; jewishlamorinda.org forwards to it.

**In Render** (dashboard.render.com)
1. Open the service **chabad-lamorinda-app** -> **Settings** -> scroll to **Custom Domains** -> **+ Add Custom Domain**.
2. Type `jewishlamorinda.com`, click **Save**. Render adds `www.jewishlamorinda.com` by itself.
3. Do the same for `jewishlamorinda.org` (and `www.jewishlamorinda.org` if it is not added by itself).
4. Leave this page open: each domain shows "DNS update needed" and the record Render wants.

**In Cloudflare** (dash.cloudflare.com)
5. Click **jewishlamorinda.com** -> **DNS** -> **Records**. Delete any old A, AAAA or CNAME records for `@` and `www` (Cloudflare sometimes adds "parking" ones).
6. **+ Add record**: Type **CNAME**, Name `@`, Target `chabad-lamorinda-app.onrender.com`, **Proxy status: OFF (grey cloud, "DNS only")**. Save.
7. **+ Add record**: Type **CNAME**, Name `www`, Target `chabad-lamorinda-app.onrender.com`, **grey cloud**. Save.
8. Go back to the Cloudflare home, click **jewishlamorinda.org**, and repeat steps 5-7 there.
9. **SSL/TLS** (left menu) for each domain: set to **Full**. (With the grey cloud this does not matter, but it avoids trouble later.)

**Back in Render**
10. Next to each domain click **Verify**. Usually green within a few minutes (up to an hour). Render then makes the free https certificate by itself.
11. **Environment** tab -> **+ Add Environment Variable**: `PUBLIC_URL` = `https://jewishlamorinda.com` -> **Save Changes**. Render restarts (about 2 minutes).
12. Check: open https://jewishlamorinda.com (the new site), https://jewishlamorinda.org/learn/mezuzah (should jump to jewishlamorinda.com/learn/mezuzah), and https://jewishlamorinda.com/robots.txt (should list the sitemap: Google may now list the site).
13. Then Google Search Console (section 3) with the address `https://jewishlamorinda.com`.

Why the grey cloud: Render makes the security certificate itself; Cloudflare's orange cloud would get in the way of that.

## 5. Launch day (moving chabadoflamorinda.com over)
Do this only when everything above is working and the content is approved.
1. Render → chabad-lamorinda-app → **Settings → Custom Domains**: add `www.chabadoflamorinda.com` and `chabadoflamorinda.com`.
2. At the domain's DNS (ask Chabad.org if they manage it): point `www` (CNAME) and the root (A/ALIAS) to the targets Render shows. Email (MX records) is not touched.
3. In Environment set **PUBLIC_URL** = `https://www.chabadoflamorinda.com` (Google may then list the site automatically; **SITE_INDEXABLE** = `0` would hide it).
4. Ask Claude to add redirects from the old Chabad.org page addresses (for example `/3186196` → `/programs/hebrew-school`) so old links and Google results keep working.
5. Submit the sitemap in Search Console and update the website link on Facebook, Instagram and the Google Business Profile.
