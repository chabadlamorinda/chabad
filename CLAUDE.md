# Running the Chabad of Lamorinda website by conversation

The Rabbi runs this website by talking to Claude. When he asks for something ("add the Chanukah party on Dec 6 at 4:30 with RSVP", "change Shabbat services to 9:30", "put up this flyer"), make the change in the content files below, run `npm test`, commit, and push. Render redeploys automatically.

## Where things live
| What | File |
| --- | --- |
| Name, address, phone, email, staff, service times, weekly classes, social links | `site/content/org.json` |
| Home page: big banners, smaller banners, accomplishments (and numbers) | `site/content/home.json` |
| Events (one-time) | `site/content/events.json` |
| Programs (preschool, Hebrew school, classes...) | `site/content/programs.json` |
| Questions & answers (also shown to Google/AI as FAQ) | `site/content/faq.json` |
| "Everything Jewish in Lamorinda" guide | `site/content/directory.json` |
| Town pages (`/jewish-moraga`...): Lafayette, Moraga, Orinda first, then nearby towns | `site/content/towns.json` |
| Guides to Jewish topics (`/learn/mezuzah`...) | `site/content/learn/*.md` |
| Old chabadoflamorinda.com addresses -> new pages | `site/content/redirects.json` |
| Pages: about, contact, privacy... (`/about` = `pages/about.md`) | `site/content/pages/*.md` |
| Holiday guides (`/holidays/chanukah`...) | `site/content/holidays/*.md` |
| Flyers, photos, PDFs (served at `/media/...`) | `site/media/` |
| Free atmosphere photos (Shabbat, challah, menorah, Torah, kids...) and which page shows each | `site/media/photos/` (CREDITS.md), `PHOTOS` in `server/site/art.js` |
| Design | `site/assets/site.css` |
| Server code | `server/site/` |

**Kabbalat Shabbat time** is worked out every week: candle lighting in Lafayette rounded down to the quarter hour, never later than 6:45 PM (so it never starts after sunset). The rule is in `org.json` (`"kabbalatShabbat": { "latest": "18:45", "dates": {} }`); to set one Friday by hand, add it to `dates` (`"2026-11-13": "17:00"`). Every page, guide and FAQ that says `{kabbalat-shabbat}` shows this week's time in all three languages; when writing about Friday night, use `{kabbalat-shabbat}` instead of typing a time. Friday-night events in events.json still need their own start time.

Shabbat times, holiday dates, the Hebrew date and parsha are computed automatically (`server/site/zmanim.js`); never type them in by hand.

## Adding an event
Add an object to `site/content/events.json`:
```json
{
  "slug": "chanukah-celebration-2026",
  "title": "Chanukah Community Celebration",
  "start": "2026-12-06T16:30",
  "end": "2026-12-06T18:30",
  "category": "holiday",
  "holiday": "chanukah",
  "location": { "name": "Lafayette Plaza Park", "address": "Mt Diablo Blvd & Moraga Rd, Lafayette, CA" },
  "summary": "One sentence that sells it (shown on cards, Google and Facebook).",
  "details": "Markdown: more detail, schedule, what to bring.",
  "price": "Free",
  "image": "/media/chanukah-2026.jpg",
  "flyer": "/media/chanukah-2026.pdf",
  "rsvp": { "capacity": 150 }
}
```
* `slug`: lowercase-with-dashes, unique, include the year. Never change a slug once published (links and RSVPs use it).
* Times are Lafayette local time, `YYYY-MM-DDTHH:MM`. Omit `location` for events at the center.
* `category`: shabbat, holiday, class, kids, teens, women, men, community, seniors, family.
* `holiday` (a file name in `holidays/`) and `program` (a slug in `programs.json`) link the event onto those pages.
* `rsvp`: `{}` for unlimited, `{ "capacity": N }` to cap it, `"kids": false` to hide the children counter. Leave `rsvp` out for no RSVP.
* `"status": "draft"` hides an event until it is ready. Remove it to publish.
* `"featured": true` makes it a large banner at the top of the home page (holiday events are large automatically, within 60 days); other events show as smaller banners. A big banner looks best with an `image` (a wide photo or flyer, 1600x700 or so).
* After the event: `"album": "https://www.facebook.com/media/set/?set=..."` adds a "See all the photos" button, and `"photos": ["/media/chanukah-2026-1.jpg", ...]` shows a few pictures on the page (save them in `site/media/`, under ~400 KB each).
* Translations: add `"he": { "title", "summary", "details", "price" }` and `"ru": { ... }` to every event (the site is in English, Hebrew and Russian).
* Images: save flyers/photos into `site/media/` (JPG/PNG/PDF, keep images under ~400 KB; resize first).
* Past events drop off the site automatically; leave them in the file.

## The Rabbi's to-do list
Things only the Rabbi can do (Render settings, accounts, launch) are in `store/rabbi-todo.md`. When he says he is at a computer, take him through it one item at a time with every click explained from A to Z (use `store/website-setup.md` and `store/rabbi-setup.md` for the details), and check each step works before the next. Add new items there instead of only mentioning them in chat.

## After every change
0. To see a change in the browser: `npm run dev` (http://localhost:3000, Rabbi area password `dev-password-123`, throwaway database, emails printed in the terminal).
1. `npm test` (checks every content file; a bad date or a typo in a slug fails with a clear message).
2. Commit with a plain-English message ("Add Chanukah celebration on Dec 6"), push.
3. Tell the Rabbi in one or two sentences what changed and the page address.

## Look and feel
Warm and personal, not corporate: cream paper colors, Lora headings, small handwritten touches in Caveat (`.hand`, eyebrows), and real photos everywhere. Free photos (Pexels, see `site/media/photos/CREDITS.md`) are only for atmosphere and are never captioned as our community; real community photos come from Facebook or the Rabbi and always win. Fun things to play live in `server/site/fun.js` (`/dreidel`).

## Facts and wording
* Only publish facts the Rabbi gave or that already appear in the content. Never invent dates, prices, names or quotes; ask.
* The Rabbi is **Rabbi Yisroel Labkowski**; the Rebbetzin is **Tzipora Labkowski**. Phone 925-384-7242 (the Rebbetzin: 925-384-7241). Women in Lamorinda generally use the Chabad mikvah in Berkeley, arranged with the Rebbetzin.
* Write warmly and simply. Every Jew is welcome; no membership is required.
* Keep `faq.json` growing: questions people actually type into Google or ask an AI ("Where can I hear the shofar in Lafayette?"). Answers should name the place, day and time.

## Hebrew and Russian
The whole site is in English, Hebrew (/he/...) and Russian (/ru/...); visitors get their phone's language automatically and can switch in the header.
* Every content change needs the same change in `site/content/i18n/he/` and `site/content/i18n/ru/` (same file names; JSON files keep the same structure with text translated; Markdown keeps the same front matter keys).
* New interface words in the code (`t('...')`): run `node scripts/i18n-strings.js` to refresh the list, then `node scripts/i18n-strings.js he` and `... ru` to see what is missing, and add those to `site/content/i18n/he.json` / `ru.json`.
* `npm test` fails if a Hebrew or Russian translation is missing on the main pages.

## Local focus
The site's area is Lafayette, Moraga and Orinda first (`"tier": "home"` in towns.json), then nearby towns (`"tier": "near"`). When writing any page, FAQ or event, name the towns ("for families in Lafayette, Moraga and Orinda"). To add a town, add it to towns.json with real facts only (neighborhoods, landmarks); its page, Shabbat times and questions are generated.

## Guides (learn/)
Every page leads with what the reader came for (the quick answer, and for mezuzah, tefillin, giving or a meeting the Call/Text/WhatsApp buttons right under the title), then the guide, its questions, and one "Read next" card (the first entry in `related`, so put the most inviting next guide first).
Where new guides go (so pages never get cluttered): only in the Learn library under their category, and as the second entry in `related` of 2 to 4 closely related existing guides (in all three languages; the first entry stays, so each page's "Read next" does not change). Holiday guides also appear by themselves at the end of their holiday page. Never add guides to the home page or the top of other pages; the chat and search find them.
Each guide has front matter (title, description under 155 characters, category, related, local) and ends with `## Common questions` and `### Question?` entries, which become Google FAQ markup. Write in simple English, from a warm Chabad perspective; for case-by-case halacha say "ask the Rabbi". Add a guide whenever people ask about a topic that has none.

## Automatic pages (nothing to type)
* `/shabbat-times` (Lafayette) and `/shabbat-times/<town>`: candle lighting and Havdalah for 12 months, for every town in towns.json.
* `/jewish-holidays-<year>` (this year and next): every holiday with date, Hebrew date and candle lighting; `/jewish-holidays` goes to this year.
* `/this-week`: Shabbat times for every town, the parsha, events, Jewish dates and the guide of the week (every other week a local guide).
All three come from the calendar and events.json (`server/site/yearly.js`).

## Accounts: what families can save
Hebrew names, birthdays, anniversary, family members (with allergies or dietary needs, shown to the Rabbi with RSVPs and pre-filled in kids' forms), yahrzeits, and the dates mezuzahs and tefillin were last checked. From these the site sends yahrzeit, Hebrew birthday, Bar/Bat Mitzvah (18 months ahead) and checking reminders (`server/site/reminders.js`), and gives each family a private calendar link of their Jewish dates. Families can also choose their town and get a Friday candle-lighting email, keep a prayer list (Tehillim names they can renew), and see each child's Bar/Bat Mitzvah Torah portion; a Get started checklist on /account and a nudge after guest RSVPs and forms invite people to set up their account.

## Google Ads (Ad Grants)
Campaigns live in `store/google-ads/campaigns.json`; `node scripts/google-ads.js` builds `ads.csv` and `keywords.csv` for Google Ads Editor. `npm test` checks Google's character limits and that every ad lands on a working page.

## Facebook, Instagram and Google
New events automatically appear as ready posts in the Rabbi area (`/admin/community`, "Social drafts"); the Rabbi publishes with one button. Give every event an `image` (or an image `flyer`) so posts are eye-catching and can go to Instagram. `npm run facebook:post -- <event-slug>` does the same from the command line.

## Call / Text / WhatsApp the Rabbi (requests)
Mezuzah, tefillin, giving and meeting pages (and the chat, whenever someone asks about these) show Call, Text and WhatsApp buttons with a ready message (`server/site/leads.js`; which pages: `PAGE_TOPICS`). Texts and WhatsApp go to `org.json` `"mobile"` if set, otherwise `"phone"`. Conflict, family and help pages show "Talk privately with the Rabbi or the Rebbetzin" (Rebbetzin: `"rebbetzinMobile"` if set), and every other guide a one-line version. Every tap and every such chat conversation is emailed to the Rabbi (ADMIN_EMAIL, or the org email) and listed in the Rabbi area under "Requests from the website".

## Visitors and their interests
`server/site/visitors.js`: every visitor gets an anonymous id (cookie `cl_vid`, set by site.js unless the browser sends Global Privacy Control / Do Not Track); each page view is noted once a day (`visitor_views`, kept 3 years; no IP addresses). Any successful POST to `/api/site/...` that carries a name and email links that id to the person (`visitor_people`). Pages map to interests (`INTERESTS`); when a known person views an "alert" interest (giving, Bar/Bat Mitzvah, mezuzah, tefillin, weddings, mourning, conversion, kids' education, a new baby, a hard time), the Rabbi is emailed once a week per person and interest. The Rabbi area shows them under "Visitors". Every morning at 9 AM the Rabbi gets one summary email of the last 24 hours (requests, people looking at important topics, sign-ups, RSVPs, approvals, chat questions; `server/site/digest.js`), skipped on a quiet day. The privacy page says all this; keep it accurate if this changes.

## Giving on the website
Donations, the Chai Club and Kiddush sponsorships happen on the website itself, never by sending people to the My Pushka app: `/donate` (giving form, once or monthly, any fund; link to it filled in with `/donate?fund=general&amt=180&ded=...#give`), `/chai-club` (monthly partners and the honor board) and `/sponsor-a-kiddush` (the Kiddush calendar inside the website, in all three languages). Paying is on Stripe's secure checkout page (`POST /api/give/checkout` in `server/index.js`; `server/site/give.js`, `server/site/kiddush-page.js`). Link to these pages, not to `/pushka/` or `/kiddush/`.

## The Rabbi area (admin)
`/admin` (Rabbi's desk, `server/admin/admin.js`) and `/admin/community` (website: requests, people to reach out to, social drafts, weekly email, approvals, sign-ups, chat questions, Ask the Rabbi, RSVPs, birthdays; `server/admin/community.js`). Both share `server/admin/admin.css`. In community.js each block is `section(title, note, shortName)`; call `.count(n, waiting)` on it to show a count in the sticky menu (and open it when something waits for the Rabbi). Keep it phone-first: big buttons, short words. The "Setup checklist" section (`/admin/api/site/setup` in `server/site/index.js`) shows which settings are in place; keep it in step with `store/rabbi-todo.md`.

## Community submissions
Mazal Tovs, announcements, shiva notices, ideas and resources sent through `/community` wait in the Rabbi area for approval. When the Rabbi approves a resource or idea, add it to the right content file.

## Website address
The site runs at PUBLIC_URL (set in Render; the main address is https://jewishlamorinda.com). Website addresses written in content as "chabadoflamorinda.com/..." are shown with the real domain automatically (email addresses are not touched). Extra domains in FORWARD_DOMAINS (default `jewishlamorinda.org`) forward to the main address, keeping the page.

## Do not
* Do not edit `kiddush-kit/` (a separate shareable copy) when changing the website.
* Do not commit secrets. Settings live in Render's Environment tab (see `store/website-setup.md`).
