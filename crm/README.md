# Chabad CRM

A CRM for Chabad of Lamorinda that you talk to like a person. Send it a **text**, a **voice note** or a **photo** (from Telegram, WhatsApp/SMS, or the web dashboard) and it updates the records for you:

> 🎙 "Visited the Levins this afternoon, put up 3 mezuzos, Dave put on tefillin for the first time, they gave a check for $180. Remind me to check the mezuzos next Elul."
>
> **CRM:** Saved: $180 check from David Levin (Oct 12). Visit, 3 mezuzos and tefillin logged. Follow-up set for Aug 2027.

It keeps track of:

* **People**: names, Hebrew names, spouse and children, phone, email, address, birthdays, yahrzeits, tags, notes.
* **Donations**: amount, date, method (check #, cash, Zelle, Venmo, card, DAF, stock…), fund, memo. Year totals, by fund, by month, top donors, and a **CSV export** for year-end receipts.
* **Mitzvos & visits**: visits, mezuzos (installed / checked / replaced, with how many), tefillin, Shabbos candles, kosher kitchens, holiday programs (shofar, lulav, matzah, menorah), lifecycle events, classes, calls, with **follow-up reminders**.

It also answers questions: *"How much did we raise this year?"*, *"What has Sarah Cohen given since 2024?"*, *"Who did I put tefillin on with in September?"*, *"How many mezuzos did we put up this year?"*, *"Who haven't I visited since Pesach?"*

Photos work too: snap a **check** or envelope (it reads the payer, amount, check number and memo), a **business card** (it adds the person), or a handwritten list.

## How it works

```
Telegram / WhatsApp / SMS / web dashboard
        │  text, voice note, photo
        ▼
   inbox ── voice note ──► speech-to-text (OpenAI)
        │
        ▼
   Claude (claude-opus-5-5) with CRM tools:
   search_people, create_person, record_donation, record_activity,
   update_record, delete_record, year_summary, follow_ups, run_query (read-only) …
        │
        ▼
   SQLite database (people, donations, activities, messages, photos)
```

* `src/agent.js`: the instructions and tools Claude uses. Edit the instructions at the top to change how it behaves.
* `src/db.js`: the database (Node's built-in SQLite, nothing extra to install).
* `src/telegram.js`, `src/twilio.js`: the messaging connectors. `src/inbox.js` is the pipeline they share.
* `public/`: the dashboard (Talk, Overview, People, Donations, Mitzvos & visits). You can add it to your phone's home screen.

Every message, voice note and photo is kept, and every donation or activity remembers which message it came from. "Undo that" or "that was $360, not $180" fixes the last record.

## Setting it up

### 1. Keys you need
| What | Where | Needed for |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys | understanding messages and photos (required) |
| `OPENAI_API_KEY` | platform.openai.com → API keys | voice notes (Claude reads text and images, not audio, so voice notes are transcribed first) |
| `ADMIN_PASSWORD` | you choose | logging in to the dashboard |

### 2. Host it (Render)
1. Put this folder in its own GitHub repository (see "Moving to its own repository" below).
2. In Render: **New → Blueprint**, pick the repository. It reads `render.yaml`.
3. Fill in the environment variables it asks for. `PUBLIC_URL` is the address Render gives the service (e.g. `https://chabad-crm.onrender.com`).
4. The blueprint uses the **Starter** plan with a 1 GB disk, because the database must survive restarts. (Render's free plan has no disk, so the data would be lost.)

### 3. Connect Telegram (recommended: free, handles text, voice notes and photos)
1. In Telegram, message **@BotFather** → `/newbot` → pick a name. Copy the token into `TELEGRAM_BOT_TOKEN`.
2. Redeploy. The server registers its webhook with Telegram when it starts.
3. Send your bot any message. It replies with your Telegram id. Put that id in `TELEGRAM_ALLOWED_USER_IDS` (comma-separate several, e.g. to add the Rebbetzin) and redeploy.
4. Now just talk to it: type, hold the mic button for a voice note, or send a photo.

### 4. WhatsApp or SMS (optional, through Twilio; costs per message)
1. Get a Twilio number (SMS) or set up a WhatsApp sender.
2. Set "A message comes in" to `POST https://<PUBLIC_URL>/twilio/webhook`.
3. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `ALLOWED_PHONE_NUMBERS` (your cell, like `+19255551234`). Messages from other numbers are ignored.

### 5. The dashboard
Open `PUBLIC_URL` and log in with `ADMIN_PASSWORD`. The **Talk** tab works like a chat app (📷 photo, 🎙 voice, or type). The other tabs show totals, people, donations (with CSV download) and mitzvos.

## Running on your computer
```
cp .env.example .env     # fill in the keys
npm install
npm start                # http://localhost:3000
npm test                 # tests use a fake Claude, no keys or network needed
```
Needs Node 22.13 or newer.

## Moving to its own repository
This folder is self-contained. To give it its own GitHub repository:
1. On GitHub, create an empty private repository, e.g. `chabadlamorinda/chabad-crm`.
2. From the parent repository: `git subtree split --prefix crm -b crm-only && git push https://github.com/chabadlamorinda/chabad-crm.git crm-only:main`

## Privacy
Donor data is sensitive. Keep the repository private, use a strong `ADMIN_PASSWORD`, and only add your own Telegram id / phone numbers to the allow-lists. Messages and photos are sent to Anthropic (and voice notes to OpenAI) to be processed. Back up `DATA_DIR` (the `crm.db` file and the `uploads/` folder) regularly.
