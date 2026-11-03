# Handoff: where things stand (updated Nov 3, 2026)

For the next Claude conversation about the Chabad of Lamorinda website. Read `CLAUDE.md` first (how the site works); this file is only what is in flight and what the Rabbi is waiting on.

## Branches and publishing
* Work on `ccr-0de97462-ofj90q`. Publish by merging `origin/claude/github-render-site-guide-94hral` into it, running the full `npm test` until `# fail 0`, then `git push origin HEAD:claude/github-render-site-guide-94hral`. Render deploys `chabad-lamorinda-app.onrender.com` (public address jewishlamorinda.com); `/healthz` opens the main pages before Render switches visitors over.
* Commit messages: plain English, ending with the two attribution lines the session shows.

## The Rabbi's standing directions
* Never invent local facts, dates, prices, names or quotes. Never state what Chabad of Lamorinda specifically does, holds or provides unless he confirmed it; write "call Rabbi Labkowski to hear what is planned" instead. Confirmed: every Jew is welcome, no membership is required, phone 925-384-7242 (Rebbetzin 925-384-7241).
* Guides are for everyday Jews of every background, Chabad.org style (general Judaism through Chabad teaching); no Chabad-insider topics unless asked. Every new page in English, Hebrew and Russian.
* Nothing that costs money without saying so. Lists sort by what people open most (`popular.js`). An email to the Rabbi for everything people do on the site (`notify.js`). Donation form ($360) only where giving fits (`GIVE_ON` in give.js).
* His usage limits run out fast (weekly limit resets Tuesdays 1 AM Pacific). He asked to use Fable (model `fable`) for heavy work, at most 3 agents at a time, and the lighter schedules above. The old conversation is very long and expensive: work in a fresh conversation ("read HANDOFF.md").

## Scheduled tasks: ALL PAUSED (the Rabbi said "Stop everything", Nov 3)
Nothing runs by itself. Turn one back on only when the Rabbi asks (update_trigger with enabled=true):
* `trig_01CKTQxhahKem5QBxUP37ojn` work block (weekdays 2:17 AM Pacific once a day; was every 4 hours): disabled.
* `trig_01Wh6kqgAqk7Mi2Fp65s4jJh` ideas list (Wednesdays 9:41 AM Pacific): disabled.
* `trig_01Ut9ZJYn4ipy2Abu66bt9Np` Monday draft of the Rabbi's word for the weekly email (`site/content/rabbi-words.json`, approved:false until he approves): disabled, so no new word is drafted until it is re-enabled.
* `trig_01LGVngEG9p3rmEHKKKL2ALR` regular to-do reminder: disabled.
* The jokes batch 7 agent (40 jokes, `write-7.json`) was stopped before writing anything.

## The Jewish stories and jokes corner (first batch LIVE on Nov 3)
* Live at /stories (+ /he, /ru): 105 items from the Rabbi's PDF "Compliation of Stories and Jokes" (952 items; Google Drive "Claude" folder, file id 112gMDBJZ5i1UteFRkwi9QztRwcD0bzyE): 60 jokes, 45 stories (rebbe 5, chassidic 7, inspirational 9, courage 8, parable 16). Code `server/site/stories.js`; content `site/content/stories.json` + `i18n/he|ru/stories.json`; see CLAUDE.md "Jewish stories and jokes".
* How it was done (repeat this for the next batches): 6 Fable sorters classified every item (`sorted-all.json`); writers tidied the best ones in our own words and translated (`write-rules.txt`); fact-checkers searched Chabad.org and other reputable sources for every true-story claim (`verify-rules.txt`: documented / traditional / legend / unclear); a fixer applied the verdicts (source + URL; legends moved to "parable" with "A well-known story; its details cannot be confirmed"; unclear dropped; details corrected to match the source). Work files are in the session scratchpad `/tmp/claude-0/-home-user-chabad/5183aa3f-8258-57c5-9c7e-03317f5cf95c/scratchpad/stories-src/` (may be gone in a new session: then re-download the PDF, `pdftotext`, and re-sort).
* Remaining from the collection: about 440 jokes and 100 stories marked keep=true but not yet written; do them in batches of ~60, same pipeline, at most 3 Fable agents at a time.
* 12 stories were dropped as unverifiable (e.g. Rabbi Steinsaltz and the professor, the Baal Shem Tov's seder tears, Der Yosemel's esrog, One Shabbos for the Rabbi's son, the cheerful Al Chet). If the Rabbi gives a source, check it and add them.
* Ideas not yet built: a story in the weekly email (email.js still uses jokes.json), stories on /kids, photos per story.

## Waiting on the Rabbi (also in store/rabbi-todo.md and store/content-to-confirm.md)
1. Email sending in Render (SMTP_URL, MAIL_FROM): until then no notification emails, no sign-in codes, no weekly backup email.
2. Render Auto-Deploy "After CI Checks Pass" (todo 22) and Neon history retention (todo 23).
3. Approve the Chayei Sarah word for the weekly email; is summer camp registration open.
4. Local plans the new guides avoid stating: Shavuot night learning, Lag BaOmer event, Megillah reading time/place and half-shekel coins, High Holiday seating, community sukkah, Eicha reading, how to send Mi Sheberach names.
5. The Chanukah event (date, time, place, photo): the events page is empty; the Chanukah event in events.json is a draft.
6. He has not said whether the Rebbetzin's private line should go to 925-384-7241.

## Recent work (all live as of Nov 2)
414 guides in 12 step-by-step series (`series.json`), each series with its own page; quiet giving form; Call/Text/WhatsApp on help, Kaddish, Tehillim and sponsor pages; Kaddish/prayer-list/private messages saved with phone and listed in the Rabbi area; emails to the Rabbi for everything; deep health check + graceful shutdown + GitHub tests; weekly backup (server/backup.js) and "Download a full backup" on the desk; security and speed fixes; Rabbi area reworked for phones; spam guard on forms; 148 FAQ entries.
