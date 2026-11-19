# Getting to number 1 for Jewish and Chabad searches in Lafayette, Moraga and Orinda

## Already done in the website (nothing to do)
* Every page in English, Hebrew and Russian, with the right language tags, a sitemap with pictures, and a plain-text summary for AI assistants (/llms.txt).
* Events, guides, FAQs and the organization carry Google's structured data (events with date and place, FAQ answers, the synagogue with Lafayette, Moraga and Orinda as its area).
* Titles and descriptions mention Lafayette, Moraga and Orinda; 278 guide titles no longer show stray quotation marks.
* 928 guides, each linked to related guides and to the step-by-step series; local pages for each town; Shabbat times for each town.
* IndexNow (Bing and others): set `INDEXNOW_KEY` in Render (any 20 letters and numbers), then run `INDEXNOW_KEY=... node scripts/indexnow.js` after publishing.

## Only you can do these (about 1 hour; each takes minutes)
1. **Google Search Console** (https://search.google.com/search-console): add jewishlamorinda.com, verify (Render: DNS record or HTML tag; Claude can add the tag), then Sitemaps → add `sitemap.xml`. Then URL inspection → "Request indexing" for the 10 most important addresses: `/`, `/events/chanukah-grand-menorah-lighting-2026`, `/holidays/chanukah`, `/jewish-lafayette`, `/jewish-moraga`, `/jewish-orinda`, `/shabbat`, `/programs/hebrew-school`, `/legacy`, `/help/help-for-seniors-and-families`.
2. **Google Business Profile** for Chabad of Lamorinda: correct name, category "Synagogue" and "Jewish organization", address, phone, hours, website jewishlamorinda.com, 10 or more photos, services (Shabbat, Hebrew school, preschool), and a weekly post (store/chanukah-2026-posts.md has the Chanukah one). Ask 10 families for a Google review; answer each one. This matters most for "near me" searches.
3. **Apple Maps and Bing Places**: claim the same listing (https://businessconnect.apple.com and https://www.bingplaces.com).
4. **Links from others** (the strongest ranking signal): ask these to link to jewishlamorinda.com: Chabad.org's "Find a Chabad" listing (your shliach page), the preschool and Hebrew school directories, Lafayette, Moraga and Orinda chambers of commerce and city event calendars, Lamorinda Weekly, Patch, Nextdoor, local schools' community pages, J. Weekly community calendar, Jewish Federation of the East Bay events calendar. Email template: "Hello, Chabad of Lamorinda (3477 Golden Gate Way, Lafayette) holds the Grand Chanukah Menorah Lighting on Sunday, Dec. 6 at 4 PM at Lafayette Plaza Park, free for everyone. Details: https://jewishlamorinda.com/menorah-lighting. We would be grateful if you would list it in your community calendar."
5. **Facebook and Instagram**: publish the ready posts in the Rabbi area (Social drafts) and put the website address in your profile.
6. **Weekly email**: set SMTP (rabbi-todo 3) so the email goes out; email gets people back to the site, which helps.
7. In 4 to 6 weeks: open Search Console → Performance → Queries and send the list to Claude; the guides that rank on page 2 get improved and more guides are written for the searches that find nothing.
