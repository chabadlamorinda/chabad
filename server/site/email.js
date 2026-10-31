// The weekly email (and holiday and personal-message editions), written from the website in the reader's language.
// compose() returns { subject, preheader, html, text } for one language; weekly.js sends it, one copy per subscriber,
// with that person's tracking and unsubscribe links filled in ({{open}}, {{unsub}}, {{prefs}} and tracked clicks).
//
// A weekly email, top to bottom (the Rabbi's order):
//  1. A word from the Rabbi (Claude's weekly draft in rabbi-words.json, approved by him; or his own words).
//  2. Holidays from four weeks before until they end: dates, times, events with RSVP, registration forms (seats,
//     lulav, matzah...), sponsoring the holiday, and guides.
//  3. This week at Chabad: the weekly schedule (classes, Hebrew school, services) and this week's events.
//  4. Join us for Shabbat: Kabbalat Shabbat on Friday evening, Shabbat morning services and the Kiddush that follows,
//     every service time, candle lighting for Lafayette, Moraga and Orinda, and this Shabbat's Kiddush (sponsored, or
//     open to sponsor).
//  5. Sign up: preschool, Hebrew school, afterschool and camp registration.
//  6. The Torah portion. 7. Coming up later (pictures, RSVP). 8. Three guides with photos.
//  9. Question of the week, a mitzvah, the joke of the week.
// 10. The partners who make everything possible: a live campaign, the Chai Club honor board and joining it, sponsoring
//     a Kiddush, donating, and a legacy gift. Then sharing and the footer.
'use strict';
const { esc, md, plain } = require('./md.js');
const Z = require('./zmanim.js');
const { portionsOf } = require('./parsha.js');
const { fmtClock } = require('./content.js');
const { guideOfWeek, holidayTimes, holidaysOf } = require('./yearly.js');
const { guidesForDays, guidesFor } = require('./links.js');
const { guidePhotos } = require('./art.js');
const { MITZVAHS } = require('./mitzvah.js');
const { isLive } = require('../campaign.js');

// Colors of the website (cream paper, navy, gold).
const C_BG = '#f6f1e7', C_CARD = '#ffffff', C_INK = '#1f2433', C_MUTED = '#5f6470', C_NAVY = '#14284b', C_GOLD = '#c99a2e', C_GOLD_INK = '#85600f', C_LINE = '#e8dfcc';
const SERIF = "Georgia, 'Times New Roman', serif", SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
// The week number (the same all week, Sunday to Shabbat), so each week brings a new joke, question and mitzvah.
const weekNo = (d = Z.todayLocal()) => Math.floor((d.getTime() / 864e5 + 4) / 7);
const pick = (list, n, salt = 0) => (list && list.length ? list[(n * 7 + salt) % list.length] : null);

// Building blocks (tables and inline styles: the only layout every email program shows the same).
const btn = (href, label, gold = true) => `<a href="${esc(href)}" style="display:inline-block;padding:11px 20px;border-radius:999px;font:600 15px ${SANS};text-decoration:none;${gold ? `background:${C_GOLD};color:#1b1405` : `background:#fff;color:${C_NAVY};border:1px solid ${C_NAVY}`}">${esc(label)}</a>`;
const h2 = (s) => `<h2 style="margin:0 0 10px;font:600 21px/1.25 ${SERIF};color:${C_NAVY}">${esc(s)}</h2>`;
const eyebrow = (s) => `<p style="margin:0 0 4px;font:600 12px ${SANS};letter-spacing:.08em;text-transform:uppercase;color:${C_GOLD_INK}">${esc(s)}</p>`;
const p = (html, style = '') => `<p style="margin:0 0 12px;font:16px/1.55 ${SANS};color:${C_INK};${style}">${html}</p>`;
const card = (inner, extra = '') => `<tr><td style="padding:0 16px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C_CARD};border:1px solid ${C_LINE};border-radius:14px;${extra}"><tr><td style="padding:22px 22px 12px">${inner}</td></tr></table></td></tr>`;

async function compose(X, { base, kind = 'auto', word = null, joke = '', subject: subj = '', message = '', upcoming = () => [], giving = {}, now = new Date() }) {
  const { t, C } = X, L = X.lang, dir = L === 'he' ? 'rtl' : 'ltr', align = L === 'he' ? 'right' : 'left', far = L === 'he' ? 'left' : 'right';
  const url = (path) => base + X.path(path);
  const tx = []; // the plain-text version, built alongside
  const today = Z.todayLocal(now), todayYmd = Z.ymd(today), week = weekNo(today), end = new Date(today); end.setDate(end.getDate() + 7);
  const weekEnd = Z.ymd(end), field = (e, k) => (e[L] && e[L][k]) || e[k];
  const dayDiff = (ymd) => Math.round((new Date(ymd + 'T12:00:00') - new Date(todayYmd + 'T12:00:00')) / 864e5);
  const link = (href, label) => `<a href="${esc(href)}" style="color:${C_NAVY};font-weight:600">${esc(label)}</a>`;
  const allEvents = upcoming(C).slice().sort((a, b) => a.start.localeCompare(b.start)), shownEvents = new Set();

  // Holidays: from four weeks before until the last day (Chanukah all eight days), up to two at a time.
  const yr = Number(todayYmd.slice(0, 4)), hlist = [...await holidaysOf(yr).catch(() => []), ...await holidaysOf(yr + 1).catch(() => [])];
  const hols = [];
  for (const h of hlist) {
    const page = h.page && C.holidays.find((x) => x.slug === h.page);
    if (!page || hols.some((x) => x.page.slug === page.slug) || (h.end || h.date) < todayYmd || dayDiff(h.date) > (kind === 'holiday' ? 75 : 28)) continue;
    hols.push({ ...h, page, daysTo: dayDiff(h.date) });
    if (hols.length === 2) break;
  }
  const hol = hols[0];
  const edition = kind === 'message' ? 'message' : kind === 'holiday' || (kind === 'auto' && hol && hol.daysTo <= 8) ? 'holiday' : 'shabbat';
  // This week's Shabbat; from Shabbat day itself, the coming one (an email written on Shabbat is for next week).
  let sh = await Z.thisShabbat(now); if (sh.parsha && sh.parsha.date <= todayYmd) sh = await Z.thisShabbat(new Date(now.getTime() + 864e5));
  const ps = sh.parsha ? portionsOf(sh.parsha.title) : [];
  const ks = C.org.kabbalatShabbat ? Z.kabbalatFor(C.org.kabbalatShabbat, sh.candles) : null;
  const parshaName = sh.parsha ? X.hc(sh.parsha) : '';
  const holName = hol ? hol.page.title : '';

  const subject = subj.trim() || (edition === 'message' ? C.org.name
    : edition === 'holiday' && holName ? t('{holiday} at Chabad of Lamorinda', { holiday: holName })
      : sh.parsha ? t('Shabbat {parsha}: candle lighting {time}', { parsha: parshaName, time: sh.candles ? X.tm(sh.candles) : '' }) : t('This week at Chabad of Lamorinda'));
  const greeting = edition === 'holiday' ? t('Chag Sameach!') : t('Shabbat Shalom!');
  const preheader = edition === 'message' ? plain(message).slice(0, 120)
    : [sh.candles && t('Candle lighting {time}', { time: X.tm(sh.candles) }), parshaName, hol && holName].filter(Boolean).join(' · ');

  // A few guides as picture rows (each with a different photo).
  const used = new Set(), pic = (a) => { const n = guidePhotos(a.slug, a.category).find((x) => !used.has(x)); if (n) used.add(n); return n ? base + '/media/photos/' + n + '-sm.jpg' : ''; };
  const guideRows = (list) => list.map((a) => { const img = pic(a); return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 14px"><tr>${img ? `<td width="100" valign="top" style="padding-${far}:14px"><a href="${esc(url('/learn/' + a.slug))}"><img src="${esc(img)}" width="100" alt="" style="display:block;width:100px;height:auto;border-radius:10px"></a></td>` : ''}<td valign="top"><p style="margin:0 0 4px;font:600 16px/1.3 ${SERIF}"><a href="${esc(url('/learn/' + a.slug))}" style="color:${C_NAVY};text-decoration:none">${esc(a.title)}</a></p><p style="margin:0;font:14px/1.45 ${SANS};color:${C_MUTED}">${esc(a.description)}</p></td></tr></table>`; }).join('');
  const eventRow = (e) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px"><tr>${e.image ? `<td width="110" valign="top" style="padding-${far}:14px"><a href="${esc(url('/events/' + e.slug))}"><img src="${esc(e.image.startsWith('http') ? e.image : base + e.image)}" width="110" alt="" style="display:block;width:110px;height:auto;border-radius:10px"></a></td>` : ''}<td valign="top">
<p style="margin:0 0 2px;font:600 17px/1.3 ${SERIF}"><a href="${esc(url('/events/' + e.slug))}" style="color:${C_NAVY};text-decoration:none">${esc(field(e, 'title'))}</a></p>
<p style="margin:0 0 6px;font:14px ${SANS};color:${C_MUTED}">${esc(X.when(e))}${field(e, 'price') ? ' · ' + esc(field(e, 'price')) : ''}</p>
${field(e, 'summary') ? `<p style="margin:0 0 8px;font:15px/1.5 ${SANS};color:${C_INK}">${esc(field(e, 'summary'))}</p>` : ''}
<a href="${esc(url('/events/' + e.slug) + (e.rsvp ? '#rsvp' : ''))}" style="font:600 14px ${SANS};color:${C_GOLD_INK}">${esc(e.rsvp ? t('RSVP in one tap') : t('Details'))} →</a></td></tr></table>`;

  const rows = [];
  // ---- 1. The Rabbi's word (or his message) ----
  const text = (edition === 'message' ? message : (word && word.text) || '').trim();
  if (text) {
    rows.push(card(`${edition === 'message' ? '' : eyebrow(t('A word from the Rabbi'))}${word && word.title && edition !== 'message' ? h2(word.title) : ''}<div style="font:16px/1.6 ${SANS};color:${C_INK}">${md(text).replace(/<p>/g, '<p style="margin:0 0 12px">').replace(/<a /g, `<a style="color:${C_NAVY}" `)}</div>${p(`<em>${esc(t('Rabbi Yisroel Labkowski'))}</em>`, `color:${C_MUTED}`)}`));
    tx.push(...(edition === 'message' ? [] : [t('A word from the Rabbi').toUpperCase()]), ...(word && word.title ? [word.title] : []), plain(text), '— ' + t('Rabbi Yisroel Labkowski'), '');
  }

  // ---- 2. Holidays (four weeks ahead until they end) ----
  if (edition !== 'message') for (const h of hols) {
    const name = h.page.title, times = await holidayTimes(h.page.slug, todayYmd).catch(() => null);
    const rowsT = ((times && times.rows) || []).filter((e) => h.page.slug !== 'chanukah' || /^Chanukah: \d/.test(e.desc)).slice(0, 8);
    const label = (e) => { const n = /^Chanukah: (\d)/.exec(e.desc); return n ? (n[1] === '1' ? t('Night 1: light 1 candle') : t('Night {n}: light {n} candles', { n: n[1] })) : e.cat === 'candles' ? t('Candle lighting') : e.cat === 'havdalah' ? t('Ends') : X.hc(e); };
    const evs = allEvents.filter((e) => e.holiday === h.page.slug).slice(0, 4); evs.forEach((e) => shownEvents.add(e.slug));
    const forms = (C.forms || []).filter((f) => f.holiday === h.page.slug && !f.closed);
    const guides = guidesFor(C, '/holidays/' + h.page.slug).slice(0, 3);
    const when = h.daysTo <= 0 ? t('Now') : h.daysTo === 1 ? t('Tomorrow') : t('In {n} days', { n: h.daysTo });
    const sponsorUrl = `/donate?fund=holidays&ded=${encodeURIComponent(t('{holiday} sponsorship', { holiday: name }))}#give`;
    rows.push(card(`${eyebrow(when)}${h2(name)}
${p(esc(X.longDate(h.date)) + (h.end && h.end !== h.date ? ' – ' + esc(X.longDate(h.end)) : '') + (h.page.description ? '<br><span style="color:' + C_MUTED + '">' + esc(h.page.description) + '</span>' : ''))}
${rowsT.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 14px;font:15px ${SANS};color:${C_INK}">${rowsT.map((e) => `<tr><td style="padding:6px 0;border-bottom:1px solid ${C_LINE}">${esc(X.shortDate(e.date))}</td><td style="padding:6px 8px;border-bottom:1px solid ${C_LINE}">${esc(label(e))}</td><td style="padding:6px 0;border-bottom:1px solid ${C_LINE};text-align:${far}"><strong>${esc(X.tm(e))}</strong></td></tr>`).join('')}</table>` : ''}
${evs.length ? `<p style="margin:6px 0 10px;font:600 16px ${SERIF};color:${C_NAVY}">${esc(t('Celebrate with us'))}</p>${evs.map(eventRow).join('')}` : ''}
${forms.length ? p(`<strong>${esc(t('Sign up and order:'))}</strong> ` + forms.map((f) => link(url('/forms/' + f.id), f.title)).join(' · ')) : ''}
${p(esc(t('Sponsor {holiday} for the whole community, in honor or in memory of a loved one.', { holiday: name })))}<p style="margin:0 0 14px">${btn(url(sponsorUrl), t('Sponsor {holiday}', { holiday: name }))} ${btn(url('/holidays/' + h.page.slug), t('Everything about {holiday}', { holiday: name }), false)}</p>
${guides.length ? `<p style="margin:6px 0 10px;font:600 16px ${SERIF};color:${C_NAVY}">${esc(t('Read before the holiday:'))}</p>${guideRows(guides)}` : ''}`, `border-top:4px solid ${C_GOLD}`));
    tx.push(`${name.toUpperCase()}: ${X.longDate(h.date)}${h.end && h.end !== h.date ? ' – ' + X.longDate(h.end) : ''}`, ...rowsT.map((e) => `${X.shortDate(e.date)}  ${label(e)}  ${X.tm(e)}`), ...evs.map((e) => `* ${field(e, 'title')}: ${X.when(e)} ${url('/events/' + e.slug)}`), ...forms.map((f) => `* ${f.title}: ${url('/forms/' + f.id)}`), `${t('Sponsor {holiday}', { holiday: name })}: ${url(sponsorUrl)}`, url('/holidays/' + h.page.slug), '');
  }

  // ---- 3. This week at Chabad ----
  if (edition !== 'message') {
    const thisWeek = allEvents.filter((e) => !shownEvents.has(e.slug) && e.start.slice(0, 10) <= weekEnd); thisWeek.forEach((e) => shownEvents.add(e.slug));
    const weekly = C.org.weekly || [];
    if (weekly.length || thisWeek.length) {
      rows.push(card(`${eyebrow(t('This week at Chabad of Lamorinda'))}${h2(t('Everything happening this week'))}
${thisWeek.map(eventRow).join('')}
${weekly.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 12px;font:15px ${SANS};color:${C_INK}">${weekly.map((w) => `<tr><td valign="top" style="padding:7px 0;border-top:1px solid ${C_LINE};width:96px;color:${C_MUTED}">${esc(w.day)}</td><td style="padding:7px 0 7px 8px;border-top:1px solid ${C_LINE}">${w.link ? `<a href="${esc(url(w.link))}" style="color:${C_NAVY};font-weight:600;text-decoration:none">${esc(w.name)}</a>` : `<strong>${esc(w.name)}</strong>`}<br><span style="color:${C_MUTED}">${esc(w.time)}</span></td></tr>`).join('')}</table>` : ''}
<p style="margin:0 0 12px">${btn(url('/calendar'), t('The whole calendar'), false)}</p>`));
      tx.push(t('This week at Chabad of Lamorinda').toUpperCase(), ...thisWeek.map((e) => `* ${field(e, 'title')}: ${X.when(e)} ${url('/events/' + e.slug)}`), ...weekly.map((w) => `${w.day}: ${w.name}, ${w.time}`), '');
    }
  }

  // ---- 4. Join us for Shabbat (services, the Kiddush, candle lighting, this week's Kiddush sponsor) ----
  if (edition !== 'message' && sh.candles) {
    const towns = C.towns.filter((x) => x.tier === 'home');
    const shDay = sh.candles ? new Date(sh.candles.date + 'T12:00:00') : now, per = await Promise.all(towns.map(async (tw) => [tw, await Z.thisShabbat(shDay < now ? now : shDay, { lat: tw.lat, lng: tw.lng, name: tw.slug }).catch(() => ({}))]));
    const kb = giving.kiddush ? await giving.kiddush().catch(() => null) : null, slot = kb && kb.slots && kb.slots.find((s) => s.key === kb.current);
    const kid = slot ? (slot.status === 'sponsored' && slot.sponsor ? p(`<strong>${esc(t("This Shabbat's Kiddush"))}:</strong> ${esc(t('sponsored by {name}', { name: slot.sponsor.name }))}${slot.sponsor.dedication ? ' · ' + esc(slot.sponsor.dedication) : ''}. ${esc(t('Thank you!'))}`) : p(`<strong>${esc(t("This Shabbat's Kiddush"))}:</strong> ${esc(t('still open. Sponsor it in honor of a birthday or anniversary, or in memory of a loved one.'))} ${link(url('/sponsor-a-kiddush'), t('Sponsor this Kiddush'))}`)) : '';
    rows.push(card(`${eyebrow(parshaName || t('Shabbat'))}${h2(t('Join us this Shabbat'))}
${p(esc(t('Friday evening, welcome Shabbat with warm singing at Kabbalat Shabbat; Shabbat morning, join the services, followed by a hot Kiddush lunch for everyone. Everyone is welcome, no membership needed.')))}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 12px;font:15px ${SANS};color:${C_INK}">${ks ? `<tr><td style="padding:7px 0;border-top:1px solid ${C_LINE}"><strong>${esc(t('Kabbalat Shabbat'))}</strong></td><td style="padding:7px 0;border-top:1px solid ${C_LINE};text-align:${far}"><strong>${esc(X.shortDate(sh.candles.date))} · ${esc(fmtClock(ks, L))}</strong></td></tr>` : ''}${(C.org.services || []).filter((sv) => !/kabbalat/i.test(sv.name) || !ks).map((sv) => `<tr><td valign="top" style="padding:7px 0;border-top:1px solid ${C_LINE}">${esc(sv.name)}${sv.note ? `<br><span style="color:${C_MUTED};font-size:13px">${esc(sv.note)}</span>` : ''}</td><td valign="top" style="padding:7px 0;border-top:1px solid ${C_LINE};text-align:${far}">${esc(sv.time)}</td></tr>`).join('')}</table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 12px;font:15px ${SANS};color:${C_INK}"><tr><td style="padding:4px 0;color:${C_MUTED}">${esc(t('Shabbat times'))}</td><td style="padding:4px 8px;color:${C_MUTED}">${esc(t('Candle lighting'))}</td><td style="padding:4px 0;color:${C_MUTED}">${esc(t('Ends'))}</td></tr>
${per.map(([tw, s]) => `<tr><td style="padding:6px 0;border-top:1px solid ${C_LINE}">${esc(tw.name)}</td><td style="padding:6px 8px;border-top:1px solid ${C_LINE}"><strong>${s.candles ? esc(X.tm(s.candles)) : ''}</strong> <span style="color:${C_MUTED}">${s.candles ? esc(X.shortDate(s.candles.date)) : ''}</span></td><td style="padding:6px 0;border-top:1px solid ${C_LINE}">${s.havdalah ? esc(X.tm(s.havdalah)) : ''}</td></tr>`).join('')}</table>
${kid}<p style="margin:4px 0 12px">${btn(url('/shabbat'), t('Shabbat services and Kiddush'))} ${btn(url('/forms/shabbat-meal'), t('Shabbat dinner with the Rabbi'), false)}</p>`, `border-top:4px solid ${C_NAVY}`));
    tx.push(t('Join us this Shabbat').toUpperCase(), ks ? `${t('Kabbalat Shabbat')}: ${fmtClock(ks, L)}` : '', ...(C.org.services || []).map((sv) => `${sv.name}: ${sv.time}`), ...per.map(([tw, s]) => `${tw.name}: ${s.candles ? X.tm(s.candles) : ''}${s.havdalah ? ' / ' + X.tm(s.havdalah) : ''}`), url('/shabbat'), '');
  }

  // ---- 5. Sign up: preschool, Hebrew school, afterschool, camp ----
  const PROGRAMS = ['jewish-preschool', 'hebrew-school', 'ckids-afterschool', 'summer-camp'];
  const regs = (C.forms || []).filter((f) => PROGRAMS.includes(f.program) && !f.closed).map((f) => [f, C.programs.find((x) => x.slug === f.program)]).filter(([, pr]) => pr);
  if (edition !== 'message' && regs.length) {
    rows.push(card(`${eyebrow(t('For your children'))}${h2(t('Registration is open'))}${regs.map(([f, pr]) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 12px"><tr><td valign="top"><p style="margin:0 0 2px;font:600 16px/1.3 ${SERIF}"><a href="${esc(url('/programs/' + pr.slug))}" style="color:${C_NAVY};text-decoration:none">${esc(pr.name)}</a></p>${pr.tagline || pr.summary ? `<p style="margin:0 0 6px;font:14px/1.45 ${SANS};color:${C_MUTED}">${esc(pr.tagline || pr.summary)}</p>` : ''}<a href="${esc(url('/forms/' + f.id))}" style="font:600 14px ${SANS};color:${C_GOLD_INK}">${esc(t('Register'))} →</a></td></tr></table>`).join('')}`));
    tx.push(t('Registration is open').toUpperCase(), ...regs.map(([f, pr]) => `* ${pr.name}: ${url('/forms/' + f.id)}`), '');
  }

  // ---- 6. The Torah portion ----
  if (edition !== 'message') for (const pp of ps) {
    const T = pp[L] || pp.en;
    rows.push(card(`${eyebrow(t("This week's Torah portion"))}${h2(L === 'he' ? 'פרשת ' + pp.hebrew : t('Parashat ' + pp.name))}${p(esc(T.summary))}${p(`<strong>${esc(t('A lesson for today'))}:</strong> ${esc(T.lesson)}`)}<p style="margin:4px 0 12px">${btn(url('/parsha'), t('Read more'), false)}</p>`));
    tx.push(t("This week's Torah portion").toUpperCase() + ': ' + pp.name, T.summary, t('A lesson for today') + ': ' + T.lesson, url('/parsha'), '');
  }

  // ---- 7. Coming up later ----
  const soon = new Date(today); soon.setDate(soon.getDate() + 45);
  const later = allEvents.filter((e) => !shownEvents.has(e.slug) && e.start.slice(0, 10) <= Z.ymd(soon)).sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || a.start.localeCompare(b.start)).slice(0, 4);
  if (later.length) {
    rows.push(card(`${eyebrow(t('Coming up at Chabad of Lamorinda'))}${h2(t('Save the date'))}${later.map(eventRow).join('')}<p style="margin:0 0 12px">${btn(url('/events'), t('All upcoming events'), false)}</p>`));
    tx.push(t('Coming up at Chabad of Lamorinda').toUpperCase(), ...later.map((e) => `* ${field(e, 'title')}: ${X.when(e)}${e.rsvp ? ' (' + t('RSVP in one tap') + ')' : ''}\n  ${url('/events/' + e.slug)}`), '');
  }

  // ---- 8. Three guides: this week's Jewish dates, the guide of the week, one more ----
  const days = await Z.events(today, end).catch(() => []);
  const ideas = C.learn.filter((a) => a.category !== 'Lamorinda');
  const guides = [...new Set([...guidesForDays(C, days.filter((e) => e.cat !== 'parashat')), guideOfWeek(C, now.getTime()), pick(ideas, week, 3), pick(ideas, week, 11)].filter(Boolean))].slice(0, 3);
  if (guides.length) {
    rows.push(card(`${eyebrow(t('Learn something new'))}${h2(t('Worth reading this week'))}${guideRows(guides)}`));
    tx.push(t('Worth reading this week').toUpperCase(), ...guides.map((a) => `* ${a.title}\n  ${url('/learn/' + a.slug)}`), '');
  }

  // ---- 9. Question of the week, a mitzvah, the joke ----
  if (edition !== 'message') {
    const f = pick(C.faq, week, 5), m = pick(MITZVAHS, week, 1), j = joke.trim() || ((pick(C.jokes || [], week, 2) || {}).text || '');
    const parts = [];
    if (f) { parts.push(`${eyebrow(t('Question of the week'))}<p style="margin:0 0 6px;font:600 17px/1.35 ${SERIF};color:${C_NAVY}">${esc(f.q)}</p>${p(esc(plain(f.a)))}`); tx.push(t('Question of the week').toUpperCase(), f.q, plain(f.a), ''); }
    if (m) { parts.push(`${eyebrow(t('A mitzvah for this week'))}<p style="margin:0 0 6px;font:600 17px/1.35 ${SERIF};color:${C_NAVY}">${esc(t(m.title))}</p>${p(esc(t(m.why)))}<p style="margin:0 0 16px">${btn(url('/mitzvah'), t("I'll do it"))}</p>`); tx.push(t('A mitzvah for this week').toUpperCase(), t(m.title), t(m.why), url('/mitzvah'), ''); }
    if (j) { parts.push(`${eyebrow(t('Joke of the week'))}<p style="margin:0 0 12px;font:italic 16px/1.55 ${SERIF};color:${C_INK}">${esc(j)}</p>`); tx.push(t('Joke of the week').toUpperCase(), j, ''); }
    if (parts.length) rows.push(card(parts.join(`<hr style="border:0;border-top:1px solid ${C_LINE};margin:8px 0 16px">`)));
  }

  // ---- 10. The partners who make everything possible ----
  const camp = (C.campaigns || []).find((c) => isLive(c));
  const club = giving.club ? await giving.club().catch(() => null) : null;
  const LEVELS = [['platinum', 'Platinum'], ['gold', 'Gold'], ['silver', 'Silver'], ['bronze', 'Bronze']];
  const wall = club && (club.members || []).length ? LEVELS.map(([id, name]) => { const ns = club.members.filter((m) => m.level === id).map((m) => m.name); return ns.length ? `<p style="margin:0 0 6px;font:15px/1.5 ${SANS};color:${C_INK}"><strong style="color:${C_GOLD_INK}">${esc(t(name))}:</strong> ${esc(ns.join(', '))}</p>` : ''; }).join('') : '';
  rows.push(card(`${eyebrow(t('The partners who make everything possible'))}
${camp ? `${h2(camp.title)}${camp.tagline ? p(esc(camp.tagline)) : ''}<p style="margin:0 0 18px">${btn(url('/campaign/' + camp.slug), t('Give now'))}</p><hr style="border:0;border-top:1px solid ${C_LINE};margin:4px 0 16px">` : ''}
${h2(t('Our Chai Club partners'))}${p(esc(t('Join the Chai Club: monthly partners who carry Jewish life in Lafayette, Moraga and Orinda. Bronze, Silver, Gold and Platinum levels, and an honor board.')))}
${wall}${club && club.total ? p(`<span style="color:${C_MUTED}">${esc(t('{n} partners in all', { n: club.total }))}</span>`) : ''}<p style="margin:0 0 18px">${btn(url('/chai-club'), t('Join the Chai Club'))}</p>
<hr style="border:0;border-top:1px solid ${C_LINE};margin:4px 0 16px">
${h2(t('Sponsor a Kiddush'))}${p(esc(t('Celebrate a birthday or anniversary, or remember a loved one: sponsor a Kiddush and the whole community celebrates with you.')))}<p style="margin:0 0 18px">${btn(url('/sponsor-a-kiddush'), t('Sponsor a Kiddush'), false)} ${btn(url('/donate'), t('Donate'), false)}</p>
<hr style="border:0;border-top:1px solid ${C_LINE};margin:4px 0 16px">
${h2(t('A gift that lasts'))}${p(esc(t('Remember Chabad of Lamorinda in your will or as a beneficiary of a retirement account or life insurance, and your values keep giving for generations. The Rabbi would be honored to talk with you, in confidence.')))}<p style="margin:0 0 14px">${btn(url('/legacy'), t('Leave a legacy'), false)}</p>`, 'background:#fffaf0'));
  tx.push(t('The partners who make everything possible').toUpperCase(), camp ? camp.title + ': ' + url('/campaign/' + camp.slug) : '', `${t('Join the Chai Club')}: ${url('/chai-club')}`, `${t('Sponsor a Kiddush')}: ${url('/sponsor-a-kiddush')}`, `${t('Donate')}: ${url('/donate')}`, `${t('A gift that lasts')}: ${url('/legacy')}`, '');

  // ---- Share ----
  const shareText = encodeURIComponent(t('Shabbat times, events and more from Chabad of Lamorinda:') + ' ' + url('/this-week'));
  rows.push(`<tr><td style="padding:4px 22px 18px;text-align:center;font:15px ${SANS};color:${C_MUTED}">${esc(t('Know someone who would enjoy this?'))} <a href="https://wa.me/?text=${shareText}" style="color:${C_NAVY};font-weight:600">${esc(t('Share on WhatsApp'))}</a> · <a href="${esc(url('/subscribe'))}" style="color:${C_NAVY};font-weight:600">${esc(t('Invite a friend to sign up'))}</a></td></tr>`);

  const o = C.org;
  const html = `<!doctype html><html lang="${L}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C_BG}"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C_BG}"><tr><td align="center" style="padding:18px 8px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" dir="${dir}" style="max-width:620px;text-align:${align}">
<tr><td style="padding:8px 16px 18px;text-align:center"><a href="${esc(url('/'))}" style="text-decoration:none"><img src="${base}/assets/logo-email.png" width="56" height="56" alt="" style="display:inline-block;border:0"><br><span style="font:600 22px ${SERIF};color:${C_NAVY}">${esc(o.name)}</span></a>
<p style="margin:6px 0 0;font:italic 24px ${SERIF};color:${C_GOLD_INK}">${esc(edition === 'message' ? '' : greeting)}</p>${edition !== 'message' && preheader ? `<p style="margin:4px 0 0;font:14px ${SANS};color:${C_MUTED}">${esc(preheader)}</p>` : ''}</td></tr>
${rows.join('\n')}
<tr><td style="padding:10px 22px 30px;text-align:center;font:13px/1.6 ${SANS};color:${C_MUTED}">${esc(o.name)} · <span dir="ltr">${esc([o.address.street, o.address.city, o.address.region].filter(Boolean).join(', '))}</span> · <a href="tel:${esc((o.phone || '').replace(/[^0-9+]/g, ''))}" style="color:${C_MUTED}" dir="ltr">${esc(o.phone || '')}</a><br>
${esc(t('You are getting this because you signed up at our website.'))} <a href="{{prefs}}" style="color:${C_MUTED}">${esc(t('Email language'))}</a> · <a href="{{unsub}}" style="color:${C_MUTED}">${esc(t('Unsubscribe'))}</a></td></tr>
</table></td></tr></table>{{open}}</body></html>`;
  tx.unshift(edition === 'message' ? '' : greeting, '');
  tx.push(`${o.name} · ${o.phone || ''} · ${url('/')}`, `${t('Email language')}: {{prefs}}`, `${t('Unsubscribe')}: {{unsub}}`);
  return { subject, preheader, edition, html, text: tx.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}

module.exports = { compose, weekNo };
