// The "brain": turns a text / voice-note transcript / photo into CRM updates using Claude with tools.
//
// Claude never touches the database directly. It calls the tools below (search a person, record a
// donation, log a visit, ...) and this file runs them against db.js, then Claude writes a short reply.
'use strict';

const { ACTIVITY_TYPES, PERSON_FIELDS, fullName } = require('./db');

const MAX_STEPS = 15;

const SYSTEM = `You are the CRM assistant for Chabad of Lamorinda. The rabbi talks to you by text, voice notes (you get a transcript, which may have misheard names) and photos (checks, envelopes, business cards, handwritten notes, a mezuzah scroll, etc.).

Your job: keep an accurate record of
- people in the community (names, Hebrew names, family, contact info, notes),
- donations (amount, date, method, fund, check number),
- activities: visits, mezuzos (installed / checked / replaced; quantity = number of mezuzos), tefillin (put on with someone, sold, checked; quantity = number of times or pairs), Shabbat candles, kosher kitchens, holiday programs (shofar, lulav, matzah, menorah...), lifecycle events, classes, calls, and anything else,
and answer questions about all of it ("how much did the Cohens give this year?", "who haven't I visited since Pesach?", "how many mezuzos did we put up in 2026?").

How to work
- Before recording anything about a person, search for them. If exactly one plausible match exists, use it. If several match, ask which one (list them briefly with a distinguishing detail). If none match, create the person with what you know, and say so in your reply.
- Voice transcripts can misspell names: search by partial name / last name and pick the closest match when it is clearly the same family.
- One message often contains several things ("Visited the Levins, put up 3 mezuzos, Dave put on tefillin, they gave $180 check #1452"). Record every item separately: a visit, a mezuzah activity with quantity 3, a tefillin activity, a donation.
- Dates: "today", "yesterday", "last Sunday" are relative to the date given with each message. Store YYYY-MM-DD.
- Photos of checks: read payer name, amount, date, check number and memo. Photos of business cards: create/update the person. Do not invent details you cannot read; ask instead.
- When the rabbi says to follow up / remind / come back (e.g. "check their mezuzos again in a year"), set follow_up_date on the activity.
- "Undo that" / "that was wrong": fix or delete the record you just made (ids are in your earlier tool results; use find tools if needed).
- For questions, prefer year_summary, get_person and list tools; use run_query (read-only SQL over tables people, donations, activities) for anything else.
- Never record a donation or activity unless the message says it happened. Questions are not records.

Reply style: the rabbi reads replies on a phone. Be brief and plain text (no markdown tables, no headings). Confirm exactly what you saved, e.g. "Saved: $180 check #1452 from David Levin (Sep 3). Visit + 3 mezuzos logged." Use $ amounts with commas.`;

const str = (description) => ({ type: 'string', description });
const personProps = Object.fromEntries(PERSON_FIELDS.map((f) => [f, str({
  first_name: 'First name', last_name: 'Last (family) name', hebrew_name: 'Hebrew name, e.g. "Dovid ben Avraham"',
  phone: 'Phone', email: 'Email', address: 'Street address', city: 'City (Lafayette, Moraga, Orinda, ...)',
  spouse: 'Spouse name', children: 'Children names/ages, free text', birthday: 'Birthday (English and/or Hebrew)',
  yahrzeits: 'Yahrzeits to remember, free text', tags: 'Comma-separated tags, e.g. "board, preschool parent"',
  notes: 'Anything else worth remembering (replaces existing notes; include old notes you want to keep)',
}[f])]));

const TOOLS = [
  {
    name: 'search_people',
    description: 'Find people by any part of their name, Hebrew name, phone, email, spouse, children, city or tags. Returns up to 10 matches with ids.',
    input_schema: { type: 'object', properties: { query: str('Search words, e.g. "levin" or "dave lafayette"') }, required: ['query'] },
  },
  {
    name: 'get_person',
    description: "A person's full profile: details, every donation, every activity, totals by year.",
    input_schema: { type: 'object', properties: { person_id: { type: 'integer' } }, required: ['person_id'] },
  },
  {
    name: 'create_person',
    description: 'Add a new person to the CRM. Search first to avoid duplicates.',
    input_schema: { type: 'object', properties: personProps, required: [] },
  },
  {
    name: 'update_person',
    description: "Change a person's details. Only the fields you pass are changed.",
    input_schema: { type: 'object', properties: { person_id: { type: 'integer' }, ...personProps }, required: ['person_id'] },
  },
  {
    name: 'record_donation',
    description: 'Record a donation that was received.',
    input_schema: {
      type: 'object',
      properties: {
        person_id: { type: 'integer', description: 'Donor. Omit only for anonymous gifts.' },
        amount: { type: 'number', description: 'Dollars' },
        date: str('YYYY-MM-DD the gift was received (or check date)'),
        method: str('check, cash, zelle, venmo, card, paypal, daf, stock, wire, crypto, pledge-payment, other'),
        fund: str('What it is for, e.g. General, Building Campaign, Preschool, Yom Kippur appeal, Kiddush sponsorship'),
        check_number: str('Check number if any'),
        note: str('Memo / dedication / anything else'),
      },
      required: ['amount', 'date'],
    },
  },
  {
    name: 'record_activity',
    description: `Log something that happened with a person: ${ACTIVITY_TYPES.join(', ')}. Use one call per type (a visit where mezuzos went up is two calls: visit + mezuzah).`,
    input_schema: {
      type: 'object',
      properties: {
        person_id: { type: 'integer', description: 'Who it was with. Omit only if no specific person.' },
        type: { type: 'string', enum: ACTIVITY_TYPES },
        date: str('YYYY-MM-DD'),
        quantity: { type: 'integer', description: 'How many (mezuzos installed/checked, tefillin times or pairs, candles sets...). Default 1.' },
        details: str('What happened, e.g. "installed on front door and 2 bedrooms, kosher scrolls from Crown Heights", "checked 4, 1 posul replaced", "first time putting on tefillin"'),
        follow_up_date: str('YYYY-MM-DD to follow up, if any'),
      },
      required: ['type', 'date'],
    },
  },
  {
    name: 'update_record',
    description: 'Fix a donation or activity already saved (only the fields you pass change). For activities you can also mark a follow-up done with follow_up_done=true.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['donation', 'activity'] },
        id: { type: 'integer' },
        fields: { type: 'object', description: 'Fields to change, same names as record_donation / record_activity (plus receipt_sent, follow_up_done).' },
      },
      required: ['kind', 'id', 'fields'],
    },
  },
  {
    name: 'delete_record',
    description: 'Delete a donation, activity or person (e.g. after "undo that" or a duplicate). Deleting a person keeps their donations/activities but unlinks them.',
    input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['donation', 'activity', 'person'] }, id: { type: 'integer' } }, required: ['kind', 'id'] },
  },
  {
    name: 'list_records',
    description: 'List donations or activities, filtered by year, person and/or activity type.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['donations', 'activities'] },
        year: { type: 'integer' },
        person_id: { type: 'integer' },
        type: { type: 'string', enum: ACTIVITY_TYPES, description: 'Activities only' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'year_summary',
    description: 'Totals for a year: donations (total, donors, by fund, by month, top donors) and activity counts (visits, mezuzos, tefillin, ...).',
    input_schema: { type: 'object', properties: { year: { type: 'integer' } }, required: ['year'] },
  },
  {
    name: 'follow_ups',
    description: 'Follow-ups that are overdue or due in the next 14 days.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'run_query',
    description: 'Run one read-only SQLite SELECT for questions the other tools cannot answer. Tables: people(id, first_name, last_name, hebrew_name, phone, email, address, city, spouse, children, birthday, yahrzeits, tags, notes), donations(id, person_id, amount, date, method, fund, check_number, note, receipt_sent), activities(id, person_id, type, date, quantity, details, follow_up_date, follow_up_done). Dates are TEXT YYYY-MM-DD.',
    input_schema: { type: 'object', properties: { sql: str('A single SELECT statement') }, required: ['sql'] },
  },
];

const brief = (p) => p && ({ id: p.id, name: fullName(p), hebrew_name: p.hebrew_name || undefined, phone: p.phone || undefined, email: p.email || undefined, city: p.city || undefined, spouse: p.spouse || undefined });

function runTool(db, name, input, ctx) {
  switch (name) {
    case 'search_people': return db.searchPeople(input.query).map(brief);
    case 'get_person': return db.personProfile(input.person_id) || { error: 'not found' };
    case 'create_person': return db.createPerson(input);
    case 'update_person': { const { person_id, ...rest } = input; return db.updatePerson(person_id, rest); }
    case 'record_donation': return db.addDonation({ ...input, message_id: ctx.messageId });
    case 'record_activity': return db.addActivity({ ...input, message_id: ctx.messageId });
    case 'update_record':
      return input.kind === 'donation' ? db.updateDonation(input.id, input.fields || {}) : db.updateActivity(input.id, input.fields || {});
    case 'delete_record': {
      const fn = { donation: db.deleteDonation, activity: db.deleteActivity, person: db.deletePerson }[input.kind];
      if (!fn) throw new Error('kind must be donation, activity or person');
      return { deleted: fn(input.id) };
    }
    case 'list_records': {
      const rows = input.kind === 'donations' ? db.listDonations(input) : db.listActivities(input);
      return { count: rows.length, rows: rows.slice(0, 200), truncated: rows.length > 200 };
    }
    case 'year_summary': return db.yearSummary(input.year);
    case 'follow_ups': return db.followUps(ctx.today);
    case 'run_query': return db.readOnlyQuery(input.sql);
    default: throw new Error(`Unknown tool ${name}`);
  }
}

function describeTurn(m) {
  if (m.kind === 'voice') return `[voice note] ${m.transcript}`;
  if (m.kind === 'photo') return `[photo]${m.text ? ' ' + m.text : ''}`;
  return m.text;
}

/**
 * @param {object} opts
 * @param {import('@anthropic-ai/sdk').default} opts.client
 * @param {ReturnType<import('./db').openDb>} opts.db
 * @param {string} opts.model
 * @param {(msg: string) => void} [opts.log]
 */
function createAgent({ client, db, model, timeZone = 'America/Los_Angeles', log = () => {} }) {
  const todayIn = () => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const weekday = () => new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(new Date());

  /**
   * Handle one incoming message.
   * @param {{ messageId: number, chatId: string, channel: string, text?: string, transcript?: string, images?: { mime: string, base64: string }[] }} input
   * @returns {Promise<string>} the reply to send back
   */
  async function handle({ messageId, chatId, channel, text = '', transcript = '', images = [] }) {
    const today = todayIn();
    const history = [];
    for (const m of db.recentMessages(chatId, 8)) {
      if (m.id === messageId) continue;
      history.push({ role: 'user', content: describeTurn(m) || '(empty)' });
      history.push({ role: 'assistant', content: m.reply });
    }

    let body = `Today is ${weekday()}, ${today}. Message via ${channel}`;
    if (transcript) body += ` (voice note transcript):\n${transcript}`;
    if (text) body += transcript ? `\nTyped text / caption: ${text}` : `:\n${text}`;
    if (images.length && !text && !transcript) body += ' (photo, no caption): Record whatever this photo shows, or tell me what you see and ask what to do.';
    const content = [
      ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.base64 } })),
      { type: 'text', text: body },
    ];
    const messages = [...history, { role: 'user', content }];
    const ctx = { messageId, today };

    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' },
        system: SYSTEM,
        tools: TOOLS,
        messages,
      });

      if (res.stop_reason === 'refusal') return "Sorry, I couldn't process that message. Please try rephrasing it.";
      messages.push({ role: 'assistant', content: res.content });

      const calls = res.content.filter((b) => b.type === 'tool_use');
      if (res.stop_reason !== 'tool_use' || !calls.length) {
        const reply = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        if (res.stop_reason === 'max_tokens') return (reply ? reply + '\n' : '') + '(Reply cut off. Ask me to continue.)';
        return reply || 'Done.';
      }

      const results = calls.map((call) => {
        try {
          const out = runTool(db, call.name, call.input || {}, ctx);
          log(`tool ${call.name} ok`);
          return { type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out) };
        } catch (e) {
          log(`tool ${call.name} failed: ${e.message}`);
          return { type: 'tool_result', tool_use_id: call.id, content: e.message, is_error: true };
        }
      });
      messages.push({ role: 'user', content: results });
    }
    return 'That took too many steps. Please split it into smaller messages.';
  }

  return { handle };
}

module.exports = { createAgent, TOOLS, SYSTEM, runTool };
