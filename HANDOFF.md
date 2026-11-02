# Handoff: where things stand (written Nov 2, 2026)

For the next Claude conversation about the Chabad of Lamorinda website. Read `CLAUDE.md` first (how the site works); this file is only what is in flight and what the Rabbi is waiting on.

## Branches and publishing
* Work on `ccr-0de97462-ofj90q`. Publish by merging `origin/claude/github-render-site-guide-94hral` into it, running the full `npm test` until `# fail 0`, then `git push origin HEAD:claude/github-render-site-guide-94hral`. Render deploys `chabad-lamorinda-app.onrender.com` (public address jewishlamorinda.com); `/healthz` opens the main pages before Render switches visitors over.
* Commit messages: plain English, ending with the two attribution lines the session shows.

## The Rabbi's standing directions
* Never invent local facts, dates, prices, names or quotes. Never state what Chabad of Lamorinda specifically does, holds or provides unless he confirmed it; write "call Rabbi Labkowski to hear what is planned" instead. Confirmed: every Jew is welcome, no membership is required, phone 925-384-7242 (Rebbetzin 925-384-7241).
* Guides are for everyday Jews of every background, Chabad.org style (general Judaism through Chabad teaching); no Chabad-insider topics unless asked. Every new page in English, Hebrew and Russian.
* Nothing that costs money without saying so. Lists sort by what people open most (`popular.js`). An email to the Rabbi for everything people do on the site (`notify.js`). Donation form ($360) only where giving fits (`GIVE_ON` in give.js).
* He hit his usage limits (weekly 93%, Fable 82% on Nov 2). He asked to pause until Tuesday 1 AM Pacific and to use Fable (model `fable`) for heavy work, at most 3 agents at a time. This conversation is very long; use a fresh one for new tasks.

## Scheduled tasks (claude-code-remote triggers, bound to the old session)
* `trig_01CKTQxhahKem5QBxUP37ojn` work block (paused; a one-shot re-enables it Tue 1:05 AM on a lighter schedule: daily 2:17 AM weekdays).
* `trig_01Wh6kqgAqk7Mi2Fp65s4jJh` daily ideas (paused; same one-shot sets it to weekly, Wednesdays 9:41 AM).
* `trig_01Ut9ZJYn4ipy2Abu66bt9Np` Monday draft of the Rabbi's word for the weekly email (`site/content/rabbi-words.json`, approved:false until he approves).
* `trig_01LGVngEG9p3rmEHKKKL2ALR` regular to-do reminder; `trig_018QhBqtmkNWF4acvvF8U2Yw` one-shot reminder (Mon 10:12 AM).
* `trig_01E8EjJqJa6cKwZ5VPb2Mccm` one-shot Tue 1:30 AM: resume the stories and jokes corner (below).

## In flight: the Jewish stories and jokes corner
* Code is done and committed (not live): `server/site/stories.js` (/stories, /stories/<slug>, sections, joke of the day, search, source line, footer link, sitemap), content in `site/content/stories.json` + `i18n/he|ru/stories.json` (empty arrays so far), loader checks in content.js, strings in he.json/ru.json.
* Source: the Rabbi's PDF "Compliation of Stories and Jokes" (952 items) in his Google Drive "Claude" folder (file id 112gMDBJZ5i1UteFRkwi9QztRwcD0bzyE). Work files in the scratchpad `/tmp/claude-0/-home-user-chabad/5183aa3f-8258-57c5-9c7e-03317f5cf95c/scratchpad/stories-src/`: `items.json` (all items), `sorted-all.json` (every item classified: kind, section, keep, score, family, named, source, tags), `write-1..6.json` (first batch: 57 best stories, 60 best family jokes), `write-rules.txt` and `verify-rules.txt` (instructions for the writer and fact-checker agents), partial outputs `out-*-*.json`. If the scratchpad is gone, re-download the PDF, `pdftotext`, and redo the sort with 6 Fable agents using `sort-rules.txt` (same folder) or from CLAUDE.md's description.
* Rules the Rabbi gave: all stories must be true, from Chabad.org or other reputable Jewish sources. So: fact-check each story (verdicts documented / traditional / legend / unclear); documented and traditional go in their sections with "Source:" + URL; legends only as labeled parables or dropped; unclear dropped. Retell in our own words (never copy Chabad.org text), label parables as parables, "From Rabbi Labkowski's story collection" as the source line for his items.
* Known legends in the batch (not true events): "Paid in Full With One Glass of Milk" (Dr. Howard Kelly), "A Thousand Marbles", Brandeis-and-the-professor; "Shaya's Grand Slam" disputed.
* After the first batch: ~520 more suitable items remain (499 jokes, 144 stories in total).

## Waiting on the Rabbi (also in store/rabbi-todo.md and store/content-to-confirm.md)
1. Email sending in Render (SMTP_URL, MAIL_FROM): until then no notification emails, no sign-in codes, no weekly backup email.
2. Render Auto-Deploy "After CI Checks Pass" (todo 22) and Neon history retention (todo 23).
3. Approve the Chayei Sarah word for the weekly email; is summer camp registration open.
4. Local plans the new guides avoid stating: Shavuot night learning, Lag BaOmer event, Megillah reading time/place and half-shekel coins, High Holiday seating, community sukkah, Eicha reading, how to send Mi Sheberach names.
5. The Chanukah event (date, time, place, photo): the events page is empty; the Chanukah event in events.json is a draft.
6. He has not said whether the Rebbetzin's private line should go to 925-384-7241.

## Recent work (all live as of Nov 2)
414 guides in 12 step-by-step series (`series.json`), each series with its own page; quiet giving form; Call/Text/WhatsApp on help, Kaddish, Tehillim and sponsor pages; Kaddish/prayer-list/private messages saved with phone and listed in the Rabbi area; emails to the Rabbi for everything; deep health check + graceful shutdown + GitHub tests; weekly backup (server/backup.js) and "Download a full backup" on the desk; security and speed fixes; Rabbi area reworked for phones; spam guard on forms; 148 FAQ entries.
