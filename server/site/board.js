// Community contributions and private requests.
//  * Public after the Rabbi approves: Mazal Tovs, community announcements, shiva notices (shown on /community and the home page).
//  * Private to the Rabbi: event ideas, resources, photo links, the Tehillim prayer list, Kaddish requests and confidential messages.
// Every submission emails the Rabbi (ADMIN_EMAIL or the site email) and waits in the Rabbi area.
'use strict';
const crypto = require('crypto');
const express = require('express');
const { esc, md } = require('./md.js');
const { clean } = require('../members.js');

const KINDS = {
  'mazal-tov': { label: 'Mazal Tov', public: true },
  announcement: { label: 'Community announcement', public: true },
  shiva: { label: 'Shiva and condolence notice', public: true },
  'event-idea': { label: 'Idea for an event or class', public: false },
  resource: { label: 'Add to "Everything Jewish in Lamorinda"', public: false },
  photo: { label: 'Share photos', public: false },
  tehillim: { label: 'Prayer list (Tehillim)', public: false, private: true },
  kaddish: { label: 'Kaddish request', public: false, private: true },
  rabbi: { label: 'Confidential message to the Rabbi', public: false, private: true },
};
const SHARE = ['mazal-tov', 'announcement', 'shiva', 'event-idea', 'resource', 'photo']; // offered on the community board form
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;

function mountBoard(r, { base, store, mailer, content, render, wrap, limit, readMember, log = console, notifyTo = '', ctxOf, tOf }) {
  const pool = store && store.pool;
  const q = (t, p) => pool.query(t, p);
  const approved = async (n = 30) => (pool ? (await q("SELECT kind, name, title, body, created_at FROM submissions WHERE status='approved' AND kind = ANY($1) ORDER BY created_at DESC LIMIT $2", [Object.keys(KINDS).filter((k) => KINDS[k].public), n])).rows : []);

  r.get('/community', wrap(async (req, res) => {
    const X = ctxOf(req), t = X.t, items = await approved(40).catch(() => []);
    const opts = SHARE.map((k) => `<option value="${k}"${req.query.k === k ? ' selected' : ''}>${esc(t(KINDS[k].label))}</option>`).join('');
    await render(res, { path: '/community', title: t('Community board: Mazal Tovs, news and notices'), description: t('Mazal Tovs, community announcements and shiva notices from the Jewish community of Lafayette, Moraga and Orinda. Share your news.'),
      body: `<section class="wrap sec narrow"><h1>${esc(t('Community board'))}</h1><p class="lead-d">${esc(t("Share in each other's joys and be there for each other in hard times. Send your news and the Rabbi will post it."))}</p>
${items.length ? items.map((i) => `<article class="card post"><p class="eyebrow">${esc(t(KINDS[i.kind].label))} · ${esc(X.shortDate(new Date(i.created_at).toISOString().slice(0, 10)))}</p><h2>${esc(i.title)}</h2>${md(i.body)}</article>`).join('') : `<p class="muted">${esc(t('Be the first to share your news!'))}</p>`}
<h2 id="share">${esc(t('Share your news'))}</h2>
<form class="card tool" data-submit>
  <label>${esc(t('What are you sharing?'))} <select name="kind">${opts}</select></label>
  <label>${esc(t('Headline'))} <input name="title" maxlength="120" required></label>
  <label>${esc(t('Details'))} <textarea name="body" rows="5" maxlength="2000"></textarea></label>
  <label>${esc(t('Link (optional)'))} <input name="link" type="url" maxlength="300" placeholder="https://"></label>
  <div class="fields"><label>${esc(t('Your name'))} <input name="name" autocomplete="name" required></label><label>${esc(t('Your email'))} <input name="email" type="email" autocomplete="email" required></label></div>
  <button class="btn gold" type="submit">${esc(t('Send to the Rabbi'))}</button><p class="msg" hidden></p>
</form></section>` });
  }));

  r.get('/get-involved', wrap(async (req, res) => {
    const X = ctxOf(req), t = X.t, vol = X.C.events.filter((e) => e.published && e.category === 'volunteer');
    const tile = (href, h, p) => `<a class="card tile" href="${href}"><h3>${esc(t(h))}</h3><p>${esc(t(p))}</p></a>`;
    await render(res, { path: '/get-involved', title: t('Get involved'), description: t('Volunteer, host a Shabbat meal, sponsor a Kiddush, share your news, join the Chai Club and help build Jewish life in Lamorinda.'),
      body: `<section class="wrap sec"><h1>${esc(t('Get involved'))}</h1><p class="lead-d">${esc(t('Chabad of Lamorinda is built by the community, for the community. Here is how you can be part of it, in five minutes or five hours.'))}</p>
<div class="grid">
${tile('/account', 'Create your free account', 'Save your family once and RSVP to anything in one tap.')}
${tile('/events', 'Come to an event', 'Bring a friend. Every Jew is welcome.')}
${tile('/sponsor', 'Sponsor in honor or memory of a loved one', 'Mark a yahrzeit, birthday or simcha with a Kiddush, a Shabbat dinner or a class.')}
${tile('/community#share', 'Share your news', 'Births, weddings, bar and bat mitzvahs, and notices for the community.')}
${tile('/programs/chai-club', 'Join the Chai Club', 'A monthly gift in multiples of 18 keeps everything open to all.')}
${tile('/contact?about=Host%20a%20Shabbat%20meal', 'Host a Shabbat meal', 'Open your table to a newcomer or a student. We will make the match.')}
${tile('/tehillim', 'Say Tehillim for others', 'Join in praying for those on our community prayer list.')}
${tile('/community?k=event-idea#share', 'Suggest an event or class', 'Tell us what you would love to see.')}
${tile('/community?k=resource#share', 'Add a resource', 'Know a Jewish service in the area? Help us make the guide complete.')}
${tile('/community?k=photo#share', 'Share your photos', 'Took great photos at an event? Send us the link.')}
</div>
<h2>${esc(t('Volunteer'))}</h2>${vol.length ? `<div class="grid">${vol.map((e) => `<a class="card tile" href="/events/${e.slug}"><h3>${esc(e.title)}</h3><p>${esc(e.summary || '')}</p></a>`).join('')}</div>` : `<p>${esc(t('Help set up the sukkah, bake challah, greet guests at holiday events or visit seniors.'))} <a href="/contact?about=Volunteering">${esc(t('Tell us you would like to help'))}</a></p>`}
<h2>${esc(t('Invite a friend'))}</h2><p class="btns"><a class="btn ghost" href="https://wa.me/?text=${encodeURIComponent(t('Come with me to Chabad of Lamorinda!') + ' ' + base + X.path('/events'))}" rel="noopener" target="_blank">${esc(t('Share on WhatsApp'))}</a><a class="btn ghost" href="mailto:?subject=${encodeURIComponent('Chabad of Lamorinda')}&body=${encodeURIComponent(t('Thought you would enjoy this:') + ' ' + base + X.path('/events'))}">${esc(t('Share by email'))}</a></p>
</section>` });
  }));

  r.post('/api/site/submit', limit('site-submit', 12, 60 * 60 * 1000), express.json({ limit: '16kb' }), wrap(async (req, res) => {
    const t = tOf(req);
    if (req.get('x-site') !== '1') return res.status(403).json({ code: 'forbidden', error: 'Forbidden.' });
    if (!pool) return res.status(503).json({ code: 'not_configured', error: t('Sending is not switched on yet. Please call or email us.') });
    const b = req.body || {}, kind = Object.prototype.hasOwnProperty.call(KINDS, b.kind) ? b.kind : null;
    const title = clean(b.title, 120), body = String(b.body || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 3000), link = clean(b.link, 300);
    const m = readMember ? await readMember(req) : null, name = clean(b.name, 100) || (m && m.name) || '', email = (clean(b.email, 254) || (m && m.email) || '').toLowerCase();
    if (!kind) return res.status(400).json({ code: 'invalid_kind', error: t('Please choose what you are sharing.') });
    if (!title) return res.status(400).json({ code: 'invalid_title', error: t('Please add a headline.') });
    if (link && !/^https?:\/\//.test(link)) return res.status(400).json({ code: 'invalid_link', error: t('Links must start with https://') });
    if (!name || !validEmail(email)) return res.status(400).json({ code: 'invalid_contact', error: t('Please add your name and email so the Rabbi can reach you.') });
    await q('INSERT INTO submissions (id, kind, member_id, name, email, title, body, link) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', ['s_' + crypto.randomBytes(12).toString('hex'), kind, m ? m.id : null, name, email, title, body, link]);
    const to = notifyTo || content().org.email;
    if (mailer && to) mailer.send({ to, subject: `${KINDS[kind].private ? '[Private] ' : ''}${KINDS[kind].label}: ${title}`, text: `${name} <${email}> sent:\n\n${title}\n\n${body}\n${link}\n\nRabbi area: ${base}/admin/community` }).catch((e) => log.error('notify:', e && e.message));
    res.json({ ok: true });
  }));

  // My prayer list (in My account): the names this member put on the Tehillim list, to renew (names stay 90 days) or remove.
  r.get('/api/site/me/prayers', wrap(async (req, res) => {
    const m = readMember && await readMember(req); if (!m || !pool) return res.status(401).json({ code: 'unauthorized' });
    res.set('Cache-Control', 'no-store').json({ items: (await q("SELECT id, title, to_char(created_at,'YYYY-MM-DD') AS since, (created_at > now() - interval '90 days') AS active FROM submissions WHERE kind='tehillim' AND member_id=$1 AND status NOT IN ('declined','removed') ORDER BY created_at DESC LIMIT 30", [m.id])).rows });
  }));
  r.post('/api/site/me/prayers/:id/:action', wrap(async (req, res) => {
    if (req.get('x-site') !== '1') return res.status(403).end();
    const m = readMember && await readMember(req); if (!m || !pool) return res.status(401).json({ code: 'unauthorized' });
    const sql = req.params.action === 'renew' ? "UPDATE submissions SET created_at=now() WHERE id=$1 AND member_id=$2 AND kind='tehillim'" : req.params.action === 'remove' ? "UPDATE submissions SET status='removed' WHERE id=$1 AND member_id=$2 AND kind='tehillim'" : null;
    if (!sql) return res.status(400).json({ code: 'invalid' });
    res.json({ ok: (await q(sql, [req.params.id, m.id])).rowCount === 1 });
  }));

  return {
    approved,
    // The Rabbi's private lists: who is on the Tehillim list right now, and open Kaddish requests.
    prayerList: async () => (pool ? (await q("SELECT title, created_at FROM submissions WHERE kind='tehillim' AND status <> 'declined' AND created_at > now() - interval '90 days' ORDER BY created_at DESC")).rows : []),
    mountAdmin(r2, { authed, wrap: w }) {
      if (!pool) return;
      r2.get('/api/site/submissions', authed, w(async (req, res) => res.json({ kinds: KINDS, items: (await q("SELECT * FROM submissions WHERE status='pending' OR decided_at > now() - interval '60 days' ORDER BY created_at DESC LIMIT 200")).rows })));
      r2.post('/api/site/submissions/:id', authed, express.json({ limit: '4kb' }), w(async (req, res) => {
        const status = req.body && req.body.status;
        if (!['approved', 'declined', 'pending', 'done'].includes(status)) return res.status(400).json({ code: 'invalid', error: 'Invalid status.' });
        await q('UPDATE submissions SET status=$2, decided_at=now() WHERE id=$1', [String(req.params.id).slice(0, 40), status]);
        res.json({ ok: true });
      }));
    },
  };
}
module.exports = { mountBoard, KINDS };
