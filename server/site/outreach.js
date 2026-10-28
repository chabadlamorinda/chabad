// Personal outreach for the Rabbi, built from what families share on the website (no paid services):
//  * "People to reach out to": a yahrzeit next week, a Hebrew birthday, a Bar/Bat Mitzvah to start planning, someone who
//    read about a loss or an illness, a new family, someone we have not seen in a while. Each with a reason and a
//    ready, personal message to send on WhatsApp (wa.me link, free), by text, email or a call.
//  * "Who to invite" for each event: the families it fits (children's ages, events they came to, pages they read).
//  * "For your family" for signed-in members: upcoming events that fit them.
// Signed-in members' page views (guides, holidays, programs, events, help) are noted, once a day per page, only if
// they leave "Suggest things for my family" on in My account (it is on by default and explained on the privacy page).
'use strict';
const express = require('express');
const H = require('../../pushka/hebdate.js');
const Z = require('./zmanim.js');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS member_activity (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE, path TEXT NOT NULL, day DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (member_id, path, day)
);
CREATE TABLE IF NOT EXISTS outreach_done (member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE, key TEXT NOT NULL, done_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (member_id, key));
ALTER TABLE members ADD COLUMN IF NOT EXISTS personalize BOOLEAN NOT NULL DEFAULT TRUE;
`;
const TRACKED = /^\/(learn|help|programs|holidays|events|forms)\/[a-z0-9-]+$|^\/kaddish$/;
// Pages that suggest someone is going through something hard: a gentle check-in, never a sales pitch.
const SENSITIVE = { '/help/someone-passed-away': 'a loss in the family', '/help/planning-a-jewish-funeral': 'planning a funeral', '/help/end-of-life': 'a loved one near the end of life', '/help/someone-is-sick': 'someone who is ill', '/help/shalom-bayit': 'marriage and family', '/help/disputes': 'a family or business dispute', '/kaddish': 'saying Kaddish' };

const first = (name) => String(name || '').trim().split(/\s+/)[0] || '';
const digits = (phone) => { const d = String(phone || '').replace(/\D/g, ''); return d.length === 10 ? '1' + d : d.length >= 11 ? d : ''; };
const ageOn = (birthday, ymd) => { if (!birthday) return null; const b = String(birthday).slice(0, 10); let a = +ymd.slice(0, 4) - +b.slice(0, 4); if (ymd.slice(5) < b.slice(5)) a--; return a; };
const d10 = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : '');

// Short, warm messages from the Rabbi, in the family's language.
const MSG = {
  en: {
    invite: 'Hi {first}! {event} is coming up on {when}, and I think {who} would really enjoy it. Would love to see you there! RSVP in one tap: {url}',
    yahrzeit: 'Hi {first}, I am thinking of you as the yahrzeit of {name} comes up on {date}. Would you like to say Kaddish with us, have an aliyah, or sponsor the Kiddush in their memory? {url}',
    hebrewBirthday: 'Mazal Tov, {first}! {name} has a Hebrew birthday on {date}: a special day for a little extra tzedakah, Torah and joy. Wishing you a wonderful year!',
    mitzvah: 'Hi {first}! {name}\'s {kind} is on {date} by the Jewish calendar. Mazal Tov! It would be a pleasure to help you plan something meaningful. When is a good time to talk?',
    checkin: 'Hi {first}, I just wanted to check in and see how you and the family are doing. I am here for anything you need, any time.',
    welcome: 'Hi {first}, welcome to Chabad of Lamorinda! It is great to have you. We would love to have you for Shabbat dinner one of these weeks. {url}',
    missYou: 'Hi {first}, we have missed you! {event} is on {when} and it would be wonderful to see you. {url}',
    sign: 'Rabbi Yisroel Labkowski',
  },
  he: {
    invite: 'שלום {first}! {event} ב{when}, ואני בטוח ש{who} ייהנו מאוד. נשמח לראותכם! אישור הגעה בלחיצה: {url}',
    yahrzeit: 'שלום {first}, אני חושב עליך לקראת היארצייט של {name} ב{date}. האם תרצה לומר קדיש איתנו, לעלות לתורה או לתרום את הקידוש לעילוי נשמתו? {url}',
    hebrewBirthday: 'מזל טוב {first}! ל{name} יום הולדת עברי ב{date}: יום מיוחד לעוד קצת צדקה, תורה ושמחה. שנה נפלאה!',
    mitzvah: 'שלום {first}! ה{kind} של {name} חל ב{date} לפי הלוח העברי. מזל טוב! אשמח לעזור לתכנן משהו משמעותי. מתי נוח לדבר?',
    checkin: 'שלום {first}, רציתי רק לשאול מה שלומך ושלום המשפחה. אני כאן לכל דבר, בכל זמן.',
    welcome: 'שלום {first}, ברוכים הבאים לחב״ד למורינדה! שמחים שאתם איתנו. נשמח לארח אתכם לארוחת שבת באחד השבועות. {url}',
    missYou: 'שלום {first}, התגעגענו! {event} ב{when}, ונשמח מאוד לראותכם. {url}',
    sign: 'הרב ישראל לבקובסקי',
  },
  ru: {
    invite: 'Здравствуйте, {first}! {event}: {when}. Думаю, {who} очень понравится. Будем рады вас видеть! Записаться в одно касание: {url}',
    yahrzeit: 'Здравствуйте, {first}! Думаю о вас: приближается йорцайт {name}, {date}. Хотите прочитать с нами Кадиш, получить алию или спонсировать кидуш в память? {url}',
    hebrewBirthday: 'Мазл тов, {first}! У {name} еврейский день рождения {date}: особый день для цдаки, Торы и радости. Прекрасного года!',
    mitzvah: 'Здравствуйте, {first}! {kind} ({name}) по еврейскому календарю: {date}. Мазл тов! С радостью помогу спланировать что-то значимое. Когда удобно поговорить?',
    checkin: 'Здравствуйте, {first}! Хотел узнать, как вы и ваша семья. Я рядом, если что-то нужно, в любое время.',
    welcome: 'Здравствуйте, {first}! Добро пожаловать в Хабад Ламоринды! Очень рады вам. Приглашаем на субботний ужин в одну из ближайших недель. {url}',
    missYou: 'Здравствуйте, {first}! Мы скучали! {event}: {when}. Будем очень рады вас видеть. {url}',
    sign: 'Раввин Исроэль Лабковский',
  },
};
const WHO = { en: { family: 'your family', kids: 'your kids', you: 'you' }, he: { family: 'כל המשפחה', kids: 'הילדים', you: 'אתם' }, ru: { family: 'вашей семье', kids: 'вашим детям', you: 'вам' } };
const KIND = { en: { bar: 'Bar Mitzvah', bat: 'Bat Mitzvah' }, he: { bar: 'בר המצווה', bat: 'בת המצווה' }, ru: { bar: 'Бар-мицва', bat: 'Бат-мицва' } };
// Dates in the family's language: "Saturday, October 31".
const nice = (ymd, lang) => (/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? new Date(ymd + 'T12:00:00Z').toLocaleDateString({ he: 'he-IL', ru: 'ru-RU' }[lang] || 'en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }) : ymd);
function message(lang, kind, v) {
  const L = MSG[lang] ? lang : 'en';
  if (v.date) v = { ...v, date: nice(v.date, L) };
  return MSG[L][kind].replace(/\{(\w+)\}/g, (m, k) => (v[k] == null ? '' : v[k])) + '\n' + MSG[L].sign;
}
// Links the Rabbi taps: WhatsApp with the message ready, a text message, an email, a call.
function contact(m, text, subject) {
  const wa = digits(m.phone);
  return {
    whatsapp: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}` : '',
    sms: m.phone ? `sms:${String(m.phone).replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(text)}` : '',
    email: m.email ? `mailto:${m.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}` : '',
    call: m.phone ? `tel:${String(m.phone).replace(/[^\d+]/g, '')}` : '',
  };
}

function mountOutreach(app, { store, readMember, content, base, ctxOf, upcoming }) {
  const pool = store && store.pool;
  if (!pool) return { mountAdmin() {} };
  const q = (t, p) => pool.query(t, p).then((r) => r.rows);
  const today = () => Z.ymd(Z.todayLocal());
  const linkFor = (lang, p) => base + (lang === 'he' || lang === 'ru' ? '/' + lang : '') + p;
  const whenOf = (lang, e) => ctxOf({ lang: ['he', 'ru'].includes(lang) ? lang : 'en', method: 'GET', originalUrl: '/', query: {}, get: () => '' }).when(e);
  const localized = (lang, e) => (e[lang] && e[lang].title) || e.title;

  // Note a page a signed-in member looked at (once a day per page).
  app.post('/api/site/seen', express.json({ limit: '2kb' }), async (req, res) => {
    if (req.get('x-site') !== '1') return res.status(403).end();
    const path = String((req.body && req.body.path) || '').replace(/^\/(he|ru)(?=\/)/, '').split(/[?#]/)[0];
    try {
      const m = TRACKED.test(path) && await readMember(req);
      if (m && m.personalize !== false) await pool.query('INSERT INTO member_activity (member_id, path) VALUES ($1,$2) ON CONFLICT DO NOTHING', [m.id, path]);
    } catch (e) { /* never break a page view */ }
    res.status(204).end();
  });

  // Everything we know that helps match a family to events, for many members at once.
  async function profiles(ids) {
    const where = ids ? 'WHERE m.id = ANY($1)' : '', args = ids ? [ids] : [];
    const members = await q(`SELECT m.id, m.name, m.email, m.phone, m.lang, m.personalize, m.share_yahrzeits, m.created_at, m.last_login, to_char(m.birthday,'YYYY-MM-DD') AS birthday, m.birth_after_sunset, to_char(m.anniversary,'YYYY-MM-DD') AS anniversary FROM members m ${where}`, args);
    const ids2 = members.map((m) => m.id), by = (rows) => { const o = {}; for (const r of rows) (o[r.member_id] = o[r.member_id] || []).push(r); return o; };
    const [fam, rs, act, forms, yz, done] = await Promise.all([
      q("SELECT member_id, name, relation, gender, to_char(birthday,'YYYY-MM-DD') AS birthday, birth_after_sunset FROM family WHERE member_id = ANY($1)", [ids2]),
      q("SELECT COALESCE(r.member_id, m.id) AS member_id, r.event_slug, r.created_at FROM rsvps r LEFT JOIN members m ON r.member_id IS NULL AND lower(m.email)=lower(r.email) WHERE COALESCE(r.member_id, m.id) = ANY($1)", [ids2]),
      q("SELECT member_id, path, to_char(day,'YYYY-MM-DD') AS day FROM member_activity WHERE member_id = ANY($1) AND day > CURRENT_DATE - 120", [ids2]),
      q('SELECT COALESCE(f.member_id, m.id) AS member_id, f.form_id, f.created_at FROM form_responses f LEFT JOIN members m ON f.member_id IS NULL AND lower(m.email)=lower(f.email) WHERE COALESCE(f.member_id, m.id) = ANY($1)', [ids2]),
      q('SELECT y.* FROM yahrzeits y JOIN members m ON m.id=y.member_id WHERE y.member_id = ANY($1) AND m.share_yahrzeits', [ids2]),
      q('SELECT member_id, key FROM outreach_done WHERE member_id = ANY($1) AND done_at > now() - interval \'120 days\'', [ids2]),
    ]);
    const F = by(fam), R = by(rs), A = by(act), Fo = by(forms), Y = by(yz), D = by(done);
    return members.map((m) => ({ ...m, family: F[m.id] || [], rsvps: R[m.id] || [], views: m.personalize === false ? [] : (A[m.id] || []), forms: Fo[m.id] || [], yahrzeits: Y[m.id] || [], done: new Set((D[m.id] || []).map((x) => x.key)) }));
  }

  // How well an event fits a family, and why (in plain words for the Rabbi).
  function fit(p, e, C) {
    const date = e.start.slice(0, 10), reasons = [];
    let score = 0;
    if (p.rsvps.some((r) => r.event_slug === e.slug)) return null;
    const kids = p.family.filter((f) => f.relation === 'child' || f.relation === 'grandchild').map((f) => ({ name: f.name, age: ageOn(f.birthday, date) })).filter((k) => k.age != null);
    const young = kids.filter((k) => k.age >= 2 && k.age <= 12), teens = kids.filter((k) => k.age >= 12 && k.age <= 18);
    if (['kids', 'family'].includes(e.category) && young.length) { score += 3; reasons.push('children ' + young.map((k) => `${k.name} (${k.age})`).join(', ')); }
    if (e.category === 'teens' && teens.length) { score += 3; reasons.push('teens ' + teens.map((k) => `${k.name} (${k.age})`).join(', ')); }
    const past = p.rsvps.map((r) => C.events.find((x) => x.slug === r.event_slug)).filter(Boolean);
    const sameCat = past.filter((x) => x.category === e.category).length, sameProg = e.program && past.filter((x) => x.program === e.program).length, sameHol = e.holiday && past.filter((x) => x.holiday === e.holiday).length;
    if (sameCat) { score += Math.min(sameCat, 2) * 2; reasons.push(`came to ${sameCat} ${e.category} event${sameCat > 1 ? 's' : ''}`); }
    if (sameProg) { score += 3; reasons.push('came to this program before'); }
    if (sameHol) { score += 2; reasons.push('came for this holiday before'); }
    const viewed = (p2) => p.views.some((v) => v.path === p2);
    if (e.program && viewed('/programs/' + e.program)) { score += 2; reasons.push('looked at the program page'); }
    if (e.holiday && viewed('/holidays/' + e.holiday)) { score += 2; reasons.push('read about ' + e.holiday.replace(/-/g, ' ')); }
    if (viewed('/events/' + e.slug)) { score += 3; reasons.push('looked at this event'); }
    if (e.program && p.forms.some((f) => f.form_id === e.program || (e.program === 'hebrew-school' && f.form_id === 'hebrew-school') || (e.program === 'jewish-preschool' && f.form_id === 'preschool'))) { score += 3; reasons.push('signed up for the program'); }
    if (['shabbat', 'community', 'holiday'].includes(e.category) && past.length) { score += 1; reasons.push(`has come to ${past.length} event${past.length > 1 ? 's' : ''}`); }
    const who = ['kids', 'family'].includes(e.category) && young.length ? 'kids' : kids.length || p.family.some((f) => f.relation === 'spouse') ? 'family' : 'you';
    return score >= 2 ? { score, reasons, who } : null;
  }
  const invite = (p, e, f, kind = 'invite') => {
    const L = p.lang || 'en', url = linkFor(L, '/events/' + e.slug), text = message(L, kind, { first: first(p.name), event: localized(L, e), when: whenOf(L, e), who: (WHO[L] || WHO.en)[f.who], url });
    return { memberId: p.id, name: p.name, phone: p.phone, email: p.email, lang: L, event: e.slug, score: f.score, reasons: f.reasons, text, ...contact(p, text, localized(L, e)) };
  };

  // The Rabbi's list: who to call or message this week, and why.
  async function suggestions() {
    const C = content(), t0 = today(), people = await profiles(null), out = [];
    const soon = upcoming(new Date(), C).filter((e) => H.daysBetween(t0, e.start.slice(0, 10)) <= 21);
    const add = (p, key, kind, priority, reason, text, subject) => { if (!p.done.has(key)) out.push({ key, kind, priority, memberId: p.id, name: p.name, phone: p.phone, email: p.email, lang: p.lang || 'en', reason, text, ...contact(p, text, subject) }); };
    for (const p of people) {
      const L = p.lang || 'en', f1 = first(p.name);
      for (const y of p.yahrzeits) {
        const n = H.next({ day: y.h_day, month: y.h_month, year: y.h_year }, t0); if (!n) continue;
        const left = H.daysBetween(t0, n.date);
        if (left >= 0 && left <= 10) add(p, `yahrzeit:${y.id}:${n.date}`, 'yahrzeit', 1, `Yahrzeit of ${y.name}${y.relation ? ' (' + y.relation + ')' : ''} on ${nice(n.date)}`, message(L, 'yahrzeit', { first: f1, name: y.name, date: n.date, url: linkFor(L, '/kaddish') }), 'Yahrzeit');
      }
      const people2 = [{ name: p.name, birthday: p.birthday, night: p.birth_after_sunset, relation: 'self' }, ...p.family.map((f) => ({ ...f, night: f.birth_after_sunset }))];
      for (const x of people2) {
        if (!x.birthday) continue;
        const hp = H.hebrewOf(x.birthday, x.night), n = H.next({ day: hp.day, month: hp.month }, t0);
        if (n && H.daysBetween(t0, n.date) <= 3) add(p, `hb:${x.name}:${n.date}`, 'hebrew-birthday', 3, `${x.name}${x.relation !== 'self' ? ' (' + x.relation + ')' : ''}: Hebrew birthday on ${nice(n.date)}`, message(L, 'hebrewBirthday', { first: f1, name: x.relation === 'self' ? f1 : x.name, date: n.date }), 'Mazal Tov');
        if (x.relation === 'child' && (x.gender === 'm' || x.gender === 'f')) {
          const [yy, mo, dd] = x.birthday.split('-').map(Number), md = await Z.mitzvahDate(new Date(yy, mo - 1, dd), x.night, x.gender === 'f'), left = H.daysBetween(t0, md.date);
          const kind = (KIND[L] || KIND.en)[x.gender === 'f' ? 'bat' : 'bar'];
          if (left > 0 && left <= 548) add(p, `mitzvah:${x.name}`, 'mitzvah', 2, `${x.name}: ${x.gender === 'f' ? 'Bat' : 'Bar'} Mitzvah on ${nice(md.date)} (in ${Math.round(left / 30)} months): offer to start planning`, message(L, 'mitzvah', { first: f1, name: x.name, kind, date: md.date }), kind);
        }
      }
      const hard = [...new Set(p.views.filter((v) => SENSITIVE[v.path] && H.daysBetween(v.day, t0) <= 14).map((v) => SENSITIVE[v.path]))];
      if (hard.length) add(p, 'checkin:' + t0.slice(0, 7), 'check-in', 1, `Read about ${hard.join(' and ')} in the last two weeks: a gentle, personal check-in`, message(L, 'checkin', { first: f1 }), 'Thinking of you');
      if (p.last_login && H.daysBetween(d10(p.created_at), t0) <= 14) add(p, 'welcome', 'welcome', 2, `New: joined on ${nice(d10(p.created_at))}`, message(L, 'welcome', { first: f1, url: linkFor(L, '/forms/shabbat-meal') }), 'Welcome');
      const lastRsvp = p.rsvps.map((r) => d10(r.created_at)).sort().pop();
      if (p.rsvps.length >= 2 && lastRsvp && H.daysBetween(lastRsvp, t0) > 90) {
        const e = soon.map((ev) => [ev, fit(p, ev, C) || { score: 0, reasons: [], who: 'you' }]).sort((a, b) => b[1].score - a[1].score)[0];
        if (e) add(p, 'missyou:' + t0.slice(0, 7), 'miss-you', 3, `Came to ${p.rsvps.length} events, last RSVP ${lastRsvp}: invite back to ${e[0].title}`, message(L, 'missYou', { first: f1, event: localized(L, e[0]), when: whenOf(L, e[0]), url: linkFor(L, '/events/' + e[0].slug) }), localized(L, e[0]));
      }
    }
    // The best few invitations for each event in the next three weeks.
    const invites = [];
    for (const e of soon) {
      const list = people.map((p) => [p, fit(p, e, C)]).filter(([, f]) => f).sort((a, b) => b[1].score - a[1].score).slice(0, 8);
      for (const [p, f] of list) if (!p.done.has('invite:' + e.slug)) invites.push({ key: 'invite:' + e.slug, kind: 'invite', priority: 4, reason: `Invite to ${e.title} (${e.start.slice(0, 10)}): ${f.reasons.join('; ')}`, ...invite(p, e, f) });
    }
    return [...out, ...invites].sort((a, b) => a.priority - b.priority);
  }

  // For a signed-in member: upcoming events that fit their family.
  app.get('/api/site/for-you', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const m = await readMember(req); if (!m) return res.json({ items: [] });
      const C = content(), [p] = await profiles([m.id]);
      const items = upcoming(new Date(), C).map((e) => [e, fit(p, e, C)]).filter(([, f]) => f).sort((a, b) => b[1].score - a[1].score).slice(0, 3);
      const L = ['he', 'ru'].includes(req.get('x-lang')) ? req.get('x-lang') : 'en';
      res.json({ items: items.map(([e]) => ({ slug: e.slug, title: localized(L, e), when: whenOf(L, e), image: e.image || '' })) });
    } catch (e) { res.json({ items: [] }); }
  });

  return {
    suggestions, profiles, fit,
    mountAdmin(r2, { authed, wrap }) {
      r2.get('/api/site/outreach', authed, wrap(async (req, res) => res.json({ items: await suggestions() })));
      r2.get('/api/site/outreach/event/:slug', authed, wrap(async (req, res) => {
        const C = content(), e = C.events.find((x) => x.slug === req.params.slug);
        if (!e) return res.status(404).json({ error: 'No such event.' });
        const people = await profiles(null);
        res.json({ items: people.map((p) => [p, fit(p, e, C)]).filter(([, f]) => f).sort((a, b) => b[1].score - a[1].score).slice(0, 40).map(([p, f]) => invite(p, e, f)) });
      }));
      r2.post('/api/site/outreach/done', authed, express.json({ limit: '4kb' }), wrap(async (req, res) => {
        const b = req.body || {}, id = String(b.memberId || ''), key = String(b.key || '').slice(0, 200);
        if (!id || !key) return res.status(400).json({ error: 'Missing member or key.' });
        try { await pool.query('INSERT INTO outreach_done (member_id, key) VALUES ($1,$2) ON CONFLICT (member_id, key) DO UPDATE SET done_at=now()', [id, key]); } catch (e) { return res.status(400).json({ error: 'Unknown member.' }); }
        res.json({ ok: true });
      }));
    },
  };
}
module.exports = { mountOutreach, SCHEMA, message, contact, digits };
