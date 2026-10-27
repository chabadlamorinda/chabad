// "Call, text or WhatsApp the Rabbi" for the things people want to do with him personally: order or put up a mezuzah,
// tefillin (get a pair or learn to put them on), meet, or give. The buttons appear on those pages and in the chat
// whenever someone asks, each with a ready message. Every tap, and every chat conversation about these, is emailed to
// the Rabbi and listed in the Rabbi area ("Requests from the website"), so no one falls through the cracks.
'use strict';
const express = require('express');
const { esc } = require('./md.js');

const TOPICS = {
  mezuzah: {
    re: /mezuz|mezzuz|מזוז|мезуз/i,
    title: 'Order a mezuzah, have it put up, or get yours checked',
    msg: "Hi Rabbi Labkowski, I found you on the website. I'm interested in a mezuzah (to order one, have it put up, or have mine checked).",
  },
  tefillin: {
    re: /tefil+in|tefilin|tfilin|phylacter|תפילין|тфилин|тефилин/i,
    title: 'Get tefillin or learn how to put them on',
    msg: "Hi Rabbi Labkowski, I found you on the website. I'd like to put on tefillin (to learn how, or to get a pair).",
  },
  donation: {
    re: /donat|donor|contribut|pledge|tax.?deduct|bequest|legacy gift|venmo|zelle|\bsponsor|תרומ|לתרום|пожертв|донат/i,
    title: 'Talk with the Rabbi about giving',
    msg: "Hi Rabbi Labkowski, I found you on the website and would like to talk about making a donation.",
  },
  meeting: {
    re: /meet (with )?(the )?rabbi|meeting with|appointment|set up a (time|meeting)|sit down with|(speak|talk) (with|to) (the )?rabbi|פגישה עם הרב|להיפגש עם הרב|לדבר עם הרב|встреч[аиу] с раввином|поговорить с раввином/i,
    title: 'Meet with the Rabbi',
    msg: "Hi Rabbi Labkowski, I found you on the website and would like to set up a time to meet.",
  },
  consult: {
    re: /argu|fight|conflict|dispute|disagree|quarrel|divorc|shalom bayit|in-?laws?\b|sibling|estrang|neighbo|lawsuit|\bsue\b|inherit|counsel|struggl|depress|anxi|addict|lonel|abuse|my (husband|wife|spouse|teen)|forgiv|ריב|סכסוך|מחלוקת|שלום בית|גירושין|גט\b|חמות|שכנ|ירוש|ייעוץ|דיכאון|ссор|конфликт|спор|развод|свекров|тёщ|сосед|наследств|депресс|прощени/i,
    title: 'Talk privately with the Rabbi or the Rebbetzin',
    msg: "Hi Rabbi Labkowski, I found you on the website and would like to talk with you privately about something.",
    msgR: "Hi Rebbetzin Labkowski, I found you on the website and would like to talk with you privately about something.",
  },
};
// Pages that show the buttons.
const PAGE_TOPICS = {
  '/learn/mezuzah': 'mezuzah', '/learn/chanukat-habayit': 'mezuzah', '/learn/jewish-home-in-lamorinda': 'mezuzah',
  '/learn/tefillin': 'tefillin', '/learn/mitzvah-tanks': 'tefillin', '/learn/bar-mitzvah': 'tefillin', '/learn/jewish-men-in-lamorinda': 'tefillin',
  '/donate': 'donation', '/learn/supporting-chabad-of-lamorinda': 'donation', '/learn/halachic-will': 'donation',
  '/contact': 'meeting', '/help/talk-to-the-rabbi': 'meeting',
};
// Conflict, family and life pages: a private conversation with the Rabbi or the Rebbetzin. (Every /help page too.)
for (const slug of ['business-disputes', 'marriage-arguments-jewish-wisdom', 'parents-and-teenagers', 'sibling-rivalry', 'difficult-relationships-with-parents', 'in-laws', 'neighbor-disputes',
  'family-feuds-and-inheritance', 'forgiveness-and-making-peace', 'shalom-bayit', 'honoring-parents', 'jewish-parenting', 'business-ethics', 'caring-for-aging-parents', 'jewish-divorce',
  'mental-health-jewish-view', 'addiction-and-recovery', 'infertility-jewish-support', 'jewish-adoption', 'interfaith-families', 'jewish-dating', 'jewish-pregnancy', 'facing-antisemitism', 'loss-of-a-pet']) PAGE_TOPICS['/learn/' + slug] = 'consult';
const topicForPage = (path) => PAGE_TOPICS[path] || (/^\/help\/[a-z0-9-]+$/.test(path) ? 'consult' : null);
const CHANNELS = ['call', 'text', 'whatsapp'];

// The first topic the text is about (mezuzah and tefillin before giving and meeting).
function topicOf(text) {
  for (const k of Object.keys(TOPICS)) if (TOPICS[k].re.test(String(text || ''))) return k;
  return null;
}
// The Rabbi's numbers: org.json "mobile" for texts and WhatsApp if set, otherwise the main phone.
// The Rebbetzin: org.json "rebbetzinMobile" if set, otherwise the same numbers (the message says it is for her).
function numbers(org, who = 'rabbi') {
  const digits = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? '1' + d : d; };
  const mobile = who === 'rebbetzin' ? (org.rebbetzinMobile || org.mobile || org.whatsapp || org.phone) : (org.mobile || org.whatsapp || org.phone);
  return { call: digits(who === 'rebbetzin' && org.rebbetzinMobile ? org.rebbetzinMobile : org.phone), mobile: digits(mobile) };
}
function links(org, topic, t, who = 'rabbi') {
  const n = numbers(org, who), msg = encodeURIComponent(t(who === 'rebbetzin' && TOPICS[topic].msgR ? TOPICS[topic].msgR : TOPICS[topic].msg));
  return { call: 'tel:+' + n.call, text: `sms:+${n.mobile}?&body=${msg}`, whatsapp: `https://wa.me/${n.mobile}?text=${msg}` };
}
function consultBox(X) {
  const t = X.t, row = (who, name) => { const L = links(X.C.org, 'consult', t, who), a = (ch, label, extra = '') => `<a class="btn sm ${ch === 'whatsapp' ? 'gold' : 'ghost'}" href="${esc(L[ch])}" data-lead="consult" data-channel="${ch}" data-who="${who}"${extra}>${esc(label)}</a>`;
    return `<div class="who"><strong>${esc(name)}</strong><span class="btns">${a('call', t('Call'))}${a('text', t('Text'))}${a('whatsapp', 'WhatsApp', ' rel="noopener" target="_blank"')}</span></div>`; };
  return `<div class="card rabbi-contact consult"><h2>${esc(t('Talk privately with the Rabbi or the Rebbetzin'))}</h2><p>${esc(t('Whatever you are going through, you do not have to face it alone. Reach out privately and confidentially; no membership needed.'))}</p>
${row('rabbi', t('Rabbi Yisroel Labkowski'))}${row('rebbetzin', t('Rebbetzin Tzipora Labkowski'))}</div>`;
}
// One short line on every other guide and help page.
function consultLine(X) {
  const t = X.t, w = (who, name) => `<a href="${esc(links(X.C.org, 'consult', t, who).whatsapp)}" data-lead="consult" data-channel="whatsapp" data-who="${who}" rel="noopener" target="_blank">${esc(name)}</a>`;
  return `<p class="consult-line rabbi-contact">${esc(t('Questions about this, or something on your mind?'))} ${t('Message {rabbi} or {rebbetzin} privately, or call {phone}.').replace('{rabbi}', w('rabbi', t('the Rabbi'))).replace('{rebbetzin}', w('rebbetzin', t('the Rebbetzin'))).replace('{phone}', `<bdi dir="ltr"><a href="tel:+${numbers(X.C.org).call}" data-lead="consult" data-channel="call">${esc(X.C.org.phone)}</a></bdi>`)}</p>`;
}
function contactBox(X, topic) {
  if (topic === 'consult') return consultBox(X);
  const t = X.t, L = links(X.C.org, topic, t);
  const a = (ch, label, extra = '') => `<a class="btn ${ch === 'whatsapp' ? 'gold' : 'ghost'}" href="${esc(L[ch])}" data-lead="${topic}" data-channel="${ch}"${extra}>${esc(label)}</a>`;
  return `<div class="card rabbi-contact"><h2>${esc(t(TOPICS[topic].title))}</h2><p>${esc(t('Call, text or WhatsApp Rabbi Labkowski directly, and he will take care of you:'))}</p>
<p class="btns">${a('call', t('Call'))}${a('text', t('Text'))}${a('whatsapp', 'WhatsApp', ' rel="noopener" target="_blank"')}</p></div>`;
}
function withContact(X, body, path) {
  const topic = topicForPage(path);
  if (/rabbi-contact/.test(body) || (!topic && !/^\/learn\/[a-z0-9-]+$/.test(path))) return body;
  const box = topic ? contactBox(X, topic) : consultLine(X), i = Math.max(body.lastIndexOf('</article>'), body.lastIndexOf('</section>'));
  return i < 0 ? body + box : body.slice(0, i) + box + body.slice(i);
}

function mountLeads(app, { store, mailer, notifyTo = '', content, base = '', limit, log = console }) {
  const pool = store && store.pool, sent = new Map();
  const NAMES = { mezuzah: 'a mezuzah', tefillin: 'tefillin', donation: 'giving a donation', meeting: 'meeting with the Rabbi', consult: 'a private conversation' };
  // Saves the request and emails the Rabbi; the same visitor and topic is emailed once a day.
  async function record({ topic, channel, page = '', lang = 'en', cid = '', detail = '', who = '' }) {
    if (!TOPICS[topic]) return;
    if (who === 'rebbetzin') detail = ('For the Rebbetzin. ' + detail).trim();
    if (pool) await pool.query('INSERT INTO site_leads (topic, channel, page, lang, cid, detail) VALUES ($1,$2,$3,$4,$5,$6)', [topic, channel, page.slice(0, 200), lang, cid.slice(0, 40), detail.slice(0, 4000)]).catch((e) => log.error('lead:', e && e.message));
    const key = `${cid || page}:${topic}:${channel}:${who}:${new Date().toISOString().slice(0, 10)}`;
    if (sent.has(key)) return;
    sent.set(key, 1); if (sent.size > 5000) sent.clear();
    const to = notifyTo || content().org.email;
    if (!mailer || !to) return;
    const how = channel === 'chat' ? 'asked the website chat about' : `tapped "${channel === 'whatsapp' ? 'WhatsApp' : channel === 'text' ? 'Text' : 'Call'}" for`;
    const text = [`Someone on the website ${how} ${NAMES[topic]}${who === 'rebbetzin' ? ' with the Rebbetzin' : ''}.`, page ? `Page: ${base}${page}` : '', `Language: ${lang}`, '',
      channel === 'chat' ? 'What they wrote:\n' + detail : channel === 'call' ? 'They are probably calling you now.' : `They are sending you a ${channel === 'whatsapp' ? 'WhatsApp message' : 'text message'}; watch your phone.`,
      '', `All requests: ${base}/admin/community`].filter((x) => x !== null).join('\n');
    try { await mailer.send({ to, subject: `Website: someone is interested in ${NAMES[topic]}${who === 'rebbetzin' ? ' with the Rebbetzin' : ''}`, text }); } catch (e) { log.error('lead email:', e && e.message); }
  }
  const r = express.Router();
  r.post('/', limit('site-lead', 30, 10 * 60 * 1000), express.json({ limit: '4kb' }), (req, res) => {
    if (req.get('x-site') !== '1') return res.status(403).json({ code: 'forbidden' });
    const b = req.body || {}, topic = String(b.topic || ''), channel = String(b.channel || '');
    if (!TOPICS[topic] || !CHANNELS.includes(channel)) return res.status(400).json({ code: 'invalid' });
    const page = /^\/[a-z0-9/-]{0,120}$/.test(String(b.page || '')) ? String(b.page) : '';
    record({ topic, channel, page, lang: ['he', 'ru'].includes(b.lang) ? b.lang : 'en', cid: String(b.cid || '').replace(/[^a-z0-9]/gi, ''), who: b.who === 'rebbetzin' ? 'rebbetzin' : '' }).catch(() => {});
    res.json({ ok: true });
  });
  app.use('/api/site/lead', r);
  return {
    record,
    mountAdmin(r2, { authed, wrap }) {
      if (!pool) return;
      r2.get('/api/site/leads', authed, wrap(async (req, res) => res.json({ items: (await pool.query('SELECT topic, channel, page, lang, detail, created_at FROM site_leads ORDER BY created_at DESC LIMIT 200')).rows })));
    },
  };
}
module.exports = { mountLeads, topicOf, links, contactBox, withContact, topicForPage, TOPICS, PAGE_TOPICS };
