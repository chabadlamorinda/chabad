// The weekly email (and holiday and personal-message editions), written from the website in the reader's language.
// compose() returns { subject, preheader, html, text } for one language; weekly.js sends it, one copy per subscriber,
// with that person's tracking and unsubscribe links filled in ({{open}}, {{unsub}}, {{prefs}} and tracked clicks).
//
// A weekly email, top to bottom: the Rabbi's word (if he wrote one), the holiday when one is near (its date, times,
// events and guides), Shabbat times for Lafayette, Moraga and Orinda, the Torah portion, coming events (with pictures
// and RSVP), three guides to read (this week's Jewish dates, the guide of the week, and one more), the question of
// the week (from faq.json), a mitzvah to do, the joke of the week (jokes.json), giving (a live campaign, then one of
// the Kiddush, the Chai Club, a gift that lasts and donating, in turn), forwarding to a friend, and the footer.
'use strict';
const { esc, md, plain } = require('./md.js');
const Z = require('./zmanim.js');
const { portionsOf } = require('./parsha.js');
const { fmtClock } = require('./content.js');
const { guideOfWeek, holidayTimes } = require('./yearly.js');
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

async function compose(X, { base, kind = 'auto', note = '', joke = '', subject: subj = '', message = '', upcoming = () => [], now = new Date() }) {
  const { t, C } = X, L = X.lang, dir = L === 'he' ? 'rtl' : 'ltr', align = L === 'he' ? 'right' : 'left';
  const url = (path) => base + X.path(path);
  const tx = []; // the plain-text version, built alongside
  const today = Z.todayLocal(now), week = weekNo(today), end = new Date(today); end.setDate(end.getDate() + 7);
  const field = (e, k) => (e[L] && e[L][k]) || e[k];

  // What this email is: the weekly (Shabbat) edition, the holiday edition when a major holiday starts within 8 days,
  // or the Rabbi's own message.
  const hols = await Z.upcomingHolidays(60, now).catch(() => []), hol = hols[0], holPage = hol && C.holidays.find((h) => h.slug === hol.slug);
  const daysTo = hol ? Math.round((new Date(hol.date + 'T12:00:00') - new Date(Z.ymd(today) + 'T12:00:00')) / 864e5) : 99;
  const edition = kind === 'message' ? 'message' : kind === 'holiday' || (kind === 'auto' && hol && daysTo <= 8) ? 'holiday' : 'shabbat';
  const sh = await Z.thisShabbat(now), ps = sh.parsha ? portionsOf(sh.parsha.title) : [];
  const ks = C.org.kabbalatShabbat ? Z.kabbalatFor(C.org.kabbalatShabbat, sh.candles) : null;
  const parshaName = sh.parsha ? X.hc(sh.parsha) : '';
  const holName = holPage ? holPage.title : hol ? X.hc(hol) : '';

  const subject = subj.trim() || (edition === 'message' ? C.org.name
    : edition === 'holiday' && holName ? t('{holiday} at Chabad of Lamorinda', { holiday: holName })
      : sh.parsha ? t('Shabbat {parsha}: candle lighting {time}', { parsha: parshaName, time: sh.candles ? X.tm(sh.candles) : '' }) : t('This week at Chabad of Lamorinda'));
  const greeting = edition === 'holiday' ? t('Chag Sameach!') : t('Shabbat Shalom!');
  const preheader = edition === 'message' ? plain(message).slice(0, 120)
    : [sh.candles && t('Candle lighting {time}', { time: X.tm(sh.candles) }), parshaName, edition === 'holiday' && holName].filter(Boolean).join(' · ');

  const rows = [];
  // ---- The Rabbi's word (or his message) ----
  const word = (edition === 'message' ? message : note).trim();
  if (word) {
    rows.push(card(`${edition === 'message' ? '' : eyebrow(t('A word from the Rabbi'))}<div style="font:16px/1.6 ${SANS};color:${C_INK}">${md(word).replace(/<p>/g, `<p style="margin:0 0 12px">`).replace(/<a /g, `<a style="color:${C_NAVY}" `)}</div>${p(`<em>${esc(t('Rabbi Yisroel Labkowski'))}</em>`, `color:${C_MUTED}`)}`));
    tx.push(edition === 'message' ? '' : t('A word from the Rabbi').toUpperCase(), plain(word), '— ' + t('Rabbi Yisroel Labkowski'), '');
  }

  // ---- The holiday ----
  if (edition !== 'message' && hol && holPage && (daysTo <= 21 || edition === 'holiday')) {
    const times = await holidayTimes(hol.slug, Z.ymd(today)).catch(() => null);
    const rowsT = ((times && times.rows) || []).filter((e) => hol.slug !== 'chanukah' || /^Chanukah: \d/.test(e.desc)).slice(0, 8);
    const label = (e) => { const n = /^Chanukah: (\d)/.exec(e.desc); return n ? (n[1] === '1' ? t('Night 1: light 1 candle') : t('Night {n}: light {n} candles', { n: n[1] })) : e.cat === 'candles' ? t('Candle lighting') : e.cat === 'havdalah' ? t('Ends') : X.hc(e); };
    const holEvents = upcoming(C).filter((e) => e.holiday === hol.slug).slice(0, 3);
    const hg = guidesFor(C, '/holidays/' + hol.slug).slice(0, 3);
    rows.push(card(`${eyebrow(daysTo <= 0 ? t('Now') : daysTo === 1 ? t('Tomorrow') : t('In {n} days', { n: daysTo }))}${h2(holName)}
${p(esc(X.longDate(hol.date)) + (holPage.description ? ' · ' + esc(holPage.description) : ''))}
${rowsT.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 14px;font:15px ${SANS};color:${C_INK}">${rowsT.map((e) => `<tr><td style="padding:6px 0;border-bottom:1px solid ${C_LINE}">${esc(X.shortDate(e.date))}</td><td style="padding:6px 8px;border-bottom:1px solid ${C_LINE}">${esc(label(e))}</td><td style="padding:6px 0;border-bottom:1px solid ${C_LINE};text-align:${L === 'he' ? 'left' : 'right'}"><strong>${esc(X.tm(e))}</strong></td></tr>`).join('')}</table>` : ''}
${holEvents.map((e) => p(`<a href="${esc(url('/events/' + e.slug))}" style="color:${C_NAVY};font-weight:600">${esc(field(e, 'title'))}</a><br><span style="color:${C_MUTED}">${esc(X.when(e))}</span>`)).join('')}
${hg.length ? p(esc(t('Read before the holiday:')) + ' ' + hg.map((a) => `<a href="${esc(url('/learn/' + a.slug))}" style="color:${C_NAVY}">${esc(a.title)}</a>`).join(' · ')) : ''}
<p style="margin:4px 0 12px">${btn(url('/holidays/' + hol.slug), t('Everything about {holiday}', { holiday: holName }))}</p>`, `border-top:4px solid ${C_GOLD}`));
    tx.push(holName.toUpperCase() + ': ' + X.longDate(hol.date), ...rowsT.map((e) => `${X.shortDate(e.date)}  ${label(e)}  ${X.tm(e)}`), ...holEvents.map((e) => `* ${field(e, 'title')}: ${X.when(e)} ${url('/events/' + e.slug)}`), url('/holidays/' + hol.slug), '');
  }

  // ---- Shabbat times (our three towns) ----
  if (edition !== 'message' && sh.candles) {
    const towns = C.towns.filter((x) => x.tier === 'home');
    const per = await Promise.all(towns.map(async (tw) => [tw, await Z.thisShabbat(now, { lat: tw.lat, lng: tw.lng, name: tw.slug }).catch(() => ({}))]));
    const svc = (C.org.services || []).find((s) => /Shabbat morning/i.test(s.name)) || (C.org.services || [])[2];
    rows.push(card(`${eyebrow(parshaName || t('Shabbat'))}${h2(t('Shabbat times'))}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 12px;font:15px ${SANS};color:${C_INK}"><tr><td style="padding:4px 0;color:${C_MUTED}"></td><td style="padding:4px 8px;color:${C_MUTED}">${esc(t('Candle lighting'))}</td><td style="padding:4px 0;color:${C_MUTED}">${esc(t('Ends'))}</td></tr>
${per.map(([tw, s]) => `<tr><td style="padding:6px 0;border-top:1px solid ${C_LINE}">${esc(tw.name)}</td><td style="padding:6px 8px;border-top:1px solid ${C_LINE}"><strong>${s.candles ? esc(X.tm(s.candles)) : ''}</strong> <span style="color:${C_MUTED}">${s.candles ? esc(X.shortDate(s.candles.date)) : ''}</span></td><td style="padding:6px 0;border-top:1px solid ${C_LINE}">${s.havdalah ? esc(X.tm(s.havdalah)) : ''}</td></tr>`).join('')}</table>
${ks ? p(`<strong>${esc(t('Kabbalat Shabbat at Chabad of Lamorinda: {time}', { time: fmtClock(ks, L) }))}</strong>`) : ''}${svc ? p(esc(svc.name) + ': ' + esc(svc.time)) : ''}
<p style="margin:4px 0 12px">${btn(url('/shabbat'), t('Shabbat services and Kiddush'), false)}</p>`));
    tx.push(t('Shabbat times').toUpperCase() + (parshaName ? ': ' + parshaName : ''), ...per.map(([tw, s]) => `${tw.name}: ${s.candles ? X.tm(s.candles) : ''}${s.havdalah ? ' / ' + X.tm(s.havdalah) : ''}`), ks ? t('Kabbalat Shabbat at Chabad of Lamorinda: {time}', { time: fmtClock(ks, L) }) : '', '');
  }

  // ---- The Torah portion ----
  if (edition !== 'message') for (const pp of ps) {
    const T = pp[L] || pp.en;
    rows.push(card(`${eyebrow(t("This week's Torah portion"))}${h2(L === 'he' ? 'פרשת ' + pp.hebrew : t('Parashat ' + pp.name))}${p(esc(T.summary))}${p(`<strong>${esc(t('A lesson for today'))}:</strong> ${esc(T.lesson)}`)}<p style="margin:4px 0 12px">${btn(url('/parsha'), t('Read more'), false)}</p>`));
    tx.push(t("This week's Torah portion").toUpperCase() + ': ' + pp.name, T.summary, t('A lesson for today') + ': ' + T.lesson, url('/parsha'), '');
  }

  // ---- Coming up (pictures, RSVP) ----
  const soon = new Date(today); soon.setDate(soon.getDate() + 45);
  const evs = upcoming(C).filter((e) => e.start.slice(0, 10) <= Z.ymd(soon)).sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || a.start.localeCompare(b.start)).slice(0, 4);
  if (evs.length) {
    rows.push(card(`${eyebrow(t('Coming up at Chabad of Lamorinda'))}${h2(t('Events'))}${evs.map((e) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px"><tr>${e.image ? `<td width="120" valign="top" style="padding-${L === 'he' ? 'left' : 'right'}:14px"><a href="${esc(url('/events/' + e.slug))}"><img src="${esc(e.image.startsWith('http') ? e.image : base + e.image)}" width="120" alt="" style="display:block;width:120px;height:auto;border-radius:10px"></a></td>` : ''}<td valign="top">
<p style="margin:0 0 2px;font:600 17px/1.3 ${SERIF}"><a href="${esc(url('/events/' + e.slug))}" style="color:${C_NAVY};text-decoration:none">${esc(field(e, 'title'))}</a></p>
<p style="margin:0 0 6px;font:14px ${SANS};color:${C_MUTED}">${esc(X.when(e))}${field(e, 'price') ? ' · ' + esc(field(e, 'price')) : ''}</p>
${field(e, 'summary') ? `<p style="margin:0 0 8px;font:15px/1.5 ${SANS};color:${C_INK}">${esc(field(e, 'summary'))}</p>` : ''}
<a href="${esc(url('/events/' + e.slug) + (e.rsvp ? '#rsvp' : ''))}" style="font:600 14px ${SANS};color:${C_GOLD_INK}">${esc(e.rsvp ? t('RSVP in one tap') : t('Details'))} →</a></td></tr></table>`).join('')}<p style="margin:0 0 12px">${btn(url('/events'), t('All upcoming events'), false)}</p>`));
    tx.push(t('Coming up at Chabad of Lamorinda').toUpperCase(), ...evs.map((e) => `* ${field(e, 'title')}: ${X.when(e)}${e.rsvp ? ' (' + t('RSVP in one tap') + ')' : ''}\n  ${url('/events/' + e.slug)}`), '');
  }

  // ---- Three guides to read: this week's Jewish dates, the guide of the week, one more ----
  const days = await Z.events(today, end).catch(() => []);
  const ideas = C.learn.filter((a) => a.category !== 'Lamorinda');
  const guides = [...new Set([...guidesForDays(C, days.filter((e) => e.cat !== 'parashat')), guideOfWeek(C, now.getTime()), pick(ideas, week, 3), pick(ideas, week, 11)].filter(Boolean))].slice(0, 3);
  if (guides.length) {
    const used = new Set(), pic = (a) => { const n = guidePhotos(a.slug, a.category).find((x) => !used.has(x)); if (n) used.add(n); return n ? base + '/media/photos/' + n + '-sm.jpg' : ''; };
    rows.push(card(`${eyebrow(t('Learn something new'))}${h2(t('Worth reading this week'))}${guides.map((a) => { const img = pic(a); return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 14px"><tr>${img ? `<td width="110" valign="top" style="padding-${L === 'he' ? 'left' : 'right'}:14px"><a href="${esc(url('/learn/' + a.slug))}"><img src="${esc(img)}" width="110" alt="" style="display:block;width:110px;height:auto;border-radius:10px"></a></td>` : ''}<td valign="top"><p style="margin:0 0 4px;font:600 16px/1.3 ${SERIF}"><a href="${esc(url('/learn/' + a.slug))}" style="color:${C_NAVY};text-decoration:none">${esc(a.title)}</a></p><p style="margin:0;font:14px/1.45 ${SANS};color:${C_MUTED}">${esc(a.description)}</p></td></tr></table>`; }).join('')}`));
    tx.push(t('Worth reading this week').toUpperCase(), ...guides.map((a) => `* ${a.title}\n  ${url('/learn/' + a.slug)}`), '');
  }

  // ---- Question of the week, a mitzvah, the joke ----
  if (edition !== 'message') {
    const f = pick(C.faq, week, 5), m = pick(MITZVAHS, week, 1), j = joke.trim() || ((pick(C.jokes || [], week, 2) || {}).text || '');
    const parts = [];
    if (f) { parts.push(`${eyebrow(t('Question of the week'))}<p style="margin:0 0 6px;font:600 17px/1.35 ${SERIF};color:${C_NAVY}">${esc(f.q)}</p>${p(esc(plain(f.a)))}`); tx.push(t('Question of the week').toUpperCase(), f.q, plain(f.a), ''); }
    if (m) { parts.push(`${eyebrow(t('A mitzvah for this week'))}<p style="margin:0 0 6px;font:600 17px/1.35 ${SERIF};color:${C_NAVY}">${esc(t(m.title))}</p>${p(esc(t(m.why)))}<p style="margin:0 0 16px">${btn(url('/mitzvah'), t("I'll do it"))}</p>`); tx.push(t('A mitzvah for this week').toUpperCase(), t(m.title), t(m.why), url('/mitzvah'), ''); }
    if (j) { parts.push(`${eyebrow(t('Joke of the week'))}<p style="margin:0 0 12px;font:italic 16px/1.55 ${SERIF};color:${C_INK}">${esc(j)}</p>`); tx.push(t('Joke of the week').toUpperCase(), j, ''); }
    if (parts.length) rows.push(card(parts.join(`<hr style="border:0;border-top:1px solid ${C_LINE};margin:8px 0 16px">`)));
  }

  // ---- Giving: a campaign while it runs, then one way to give each week, in turn ----
  const camp = (C.campaigns || []).find((c) => isLive(c));
  const WAYS = [
    ['Sponsor a Kiddush', 'Celebrate a birthday or anniversary, or remember a loved one: sponsor a Kiddush and the whole community celebrates with you.', '/sponsor-a-kiddush'],
    ['Join the Chai Club', 'Join the Chai Club: monthly partners who carry Jewish life in Lafayette, Moraga and Orinda. Bronze, Silver, Gold and Platinum levels, and an honor board.', '/chai-club'],
    ['A gift that lasts', 'Remember Chabad of Lamorinda in your will or as a beneficiary of a retirement account or life insurance, and your values keep giving for generations. The Rabbi would be honored to talk with you, in confidence.', '/help/talk-to-the-rabbi'],
    ['Donate', 'Every gift, once or monthly, keeps Shabbat dinners, classes, holidays and help for families going in Lafayette, Moraga and Orinda.', '/donate'],
  ];
  const way = WAYS[week % WAYS.length];
  rows.push(card(`${eyebrow(t('Partners in everything we do'))}${camp ? `${h2(camp.title)}${camp.tagline ? p(esc(camp.tagline)) : ''}<p style="margin:0 0 16px">${btn(url('/campaign/' + camp.slug), t('Give now'))}</p>` : ''}
${h2(t(way[0]))}${p(esc(t(way[1])))}<p style="margin:0 0 14px">${btn(url(way[2]), t(way[0]), !camp)}</p>
<p style="margin:0 0 12px;font:14px ${SANS};color:${C_MUTED}">${[['Donate', '/donate'], ['Chai Club', '/chai-club'], ['Sponsor a Kiddush', '/sponsor-a-kiddush'], ['Sponsor in honor or memory of a loved one', '/sponsor']].map(([l, h]) => `<a href="${esc(url(h))}" style="color:${C_NAVY}">${esc(t(l))}</a>`).join(' · ')}</p>`, `background:#fffaf0`));
  tx.push(t(way[0]).toUpperCase(), t(way[1]), url(way[2]), camp ? camp.title + ': ' + url('/campaign/' + camp.slug) : '', t('Donate') + ': ' + url('/donate'), '');

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
