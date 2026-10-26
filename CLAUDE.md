# Running the Chabad of Lamorinda website by conversation

The Rabbi runs this website by talking to Claude. When he asks for something ("add the Chanukah party on Dec 6 at 4:30 with RSVP", "change Shabbat services to 9:30", "put up this flyer"), make the change in the content files below, run `npm test`, commit, and push. Render redeploys automatically.

## Where things live
| What | File |
| --- | --- |
| Name, address, phone, email, staff, service times, weekly classes, social links | `site/content/org.json` |
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
| Design | `site/assets/site.css` |
| Server code | `server/site/` |

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
* Translations: add `"he": { "title", "summary", "details", "price" }` and `"ru": { ... }` to every event (the site is in English, Hebrew and Russian).
* Images: save flyers/photos into `site/media/` (JPG/PNG/PDF, keep images under ~400 KB; resize first).
* Past events drop off the site automatically; leave them in the file.

## After every change
1. `npm test` (checks every content file; a bad date or a typo in a slug fails with a clear message).
2. Commit with a plain-English message ("Add Chanukah celebration on Dec 6"), push.
3. Tell the Rabbi in one or two sentences what changed and the page address.

## Facts and wording
* Only publish facts the Rabbi gave or that already appear in the content. Never invent dates, prices, names or quotes; ask.
* The Rabbi is **Rabbi Yisroel Labkowski**; the Rebbetzin is **Tzipora Labkowski**. Phone 925-384-7242.
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
Each guide has front matter (title, description under 155 characters, category, related, local) and ends with `## Common questions` and `### Question?` entries, which become Google FAQ markup. Write in simple English, from a warm Chabad perspective; for case-by-case halacha say "ask the Rabbi". Add a guide whenever people ask about a topic that has none.

## Automatic pages (nothing to type)
* `/shabbat-times` (Lafayette) and `/shabbat-times/<town>`: candle lighting and Havdalah for 12 months, for every town in towns.json.
* `/jewish-holidays-<year>` (this year and next): every holiday with date, Hebrew date and candle lighting; `/jewish-holidays` goes to this year.
* `/this-week`: Shabbat times for every town, the parsha, events, Jewish dates and the guide of the week (every other week a local guide).
All three come from the calendar and events.json (`server/site/yearly.js`).

## Accounts: what families can save
Hebrew names, birthdays, anniversary, family members (with allergies or dietary needs, shown to the Rabbi with RSVPs and pre-filled in kids' forms), yahrzeits, and the dates mezuzahs and tefillin were last checked. From these the site sends yahrzeit, Hebrew birthday, Bar/Bat Mitzvah (18 months ahead) and checking reminders (`server/site/reminders.js`), and gives each family a private calendar link of their Jewish dates.

## Google Ads (Ad Grants)
Campaigns live in `store/google-ads/campaigns.json`; `node scripts/google-ads.js` builds `ads.csv` and `keywords.csv` for Google Ads Editor. `npm test` checks Google's character limits and that every ad lands on a working page.

## Facebook, Instagram and Google
New events automatically appear as ready posts in the Rabbi area (`/admin/community`, "Social drafts"); the Rabbi publishes with one button. Give every event an `image` (or an image `flyer`) so posts are eye-catching and can go to Instagram. `npm run facebook:post -- <event-slug>` does the same from the command line.

## Community submissions
Mazal Tovs, announcements, shiva notices, ideas and resources sent through `/community` wait in the Rabbi area for approval. When the Rabbi approves a resource or idea, add it to the right content file.

## Do not
* Do not edit `kiddush-kit/` (a separate shareable copy) when changing the website.
* Do not commit secrets. Settings live in Render's Environment tab (see `store/website-setup.md`).
