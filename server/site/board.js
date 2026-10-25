// Community contributions: anyone can send a Mazal Tov, a community announcement, a shiva notice, an event idea,
// a resource for the "Everything Jewish" guide, or a photo link. Nothing appears on the site until the Rabbi approves it
// in the Rabbi area. Approved Mazal Tovs, announcements and shiva notices show on /community and the home page.
'use strict';
const crypto = require('crypto');
const express = require('express');
const { esc, md } = require('./md.js');
const { clean } = require('../members.js');

const KINDS = {
  'mazal-tov': { label: 'Mazal Tov', public: true, hint: 'A birth, engagement, wedding, bar or bat mitzvah, graduation or other simcha' },
  announcement: { label: 'Community announcement', public: true, hint: 'Something the whole community should know' },
  shiva: { label: 'Shiva and condolence notice', public: true, hint: 'Who passed away, the family, and shiva times and place' },
  'event-idea': { label: 'Idea for an event or class', public: false, hint: 'What would you love us to do?' },
  resource: { label: 'Add to "Everything Jewish in Lamorinda"', public: false, hint: 'A Jewish resource, service or business in the area' },
  photo: { label: 'Share photos', public: false, hint: 'A link to your photos from one of our events (Google Photos, iCloud, Dropbox)' },
};
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;

function mountBoard(r, { base, store, mailer, content, render, wrap, limit, readMember, log = console, notifyTo = '' }) {
  const pool = store && store.pool;
  const q = (t, p) => pool.query(t, p);
  const approved = async (n = 30) => (pool ? (await q("SELECT kind, name, title, body, created_at FROM submissions WHERE status='approved' AND kind = ANY($1) ORDER BY created_at DESC LIMIT $2", [Object.keys(KINDS).filter((k) => KINDS[k].public), n])).rows : []);

  r.get('/community', wrap(async (req, res) => {
    const items = await approved(40).catch(() => []);
    const opts = Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${req.query.k === k ? ' selected' : ''}>${esc(v.label)}</option>`).join('');
    await render(res, { path: '/community', title: 'Community board: Mazal Tovs, news and notices', description: 'Mazal Tovs, community announcements and shiva notices from the Jewish community of Lafayette, Moraga and Orinda. Share your news.',
      body: `<section class="wrap sec narrow"><h1>Community board</h1><p class="lead-d">Share in each other's joys and be there for each other in hard times. Send your news and the Rabbi will post it.</p>
${items.length ? items.map((i) => `<article class="card post"><p class="eyebrow">${esc(KINDS[i.kind].label)} · ${esc(new Date(i.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}</p><h2>${esc(i.title)}</h2>${md(i.body)}</article>`).join('') : '<p class="muted">Be the first to share your news!</p>'}
<h2 id="share">Share your news</h2>
<form class="card tool" data-submit>
  <label>What are you sharing? <select name="kind">${opts}</select></label>
  <label>Headline <input name="title" maxlength="120" required placeholder="Mazal Tov to the Cohen family on the birth of a baby girl!"></label>
  <label>Details <textarea name="body" rows="5" maxlength="2000"></textarea></label>
  <label>Link (optional) <input name="link" type="url" maxlength="300" placeholder="https://"></label>
  <div class="fields"><label>Your name <input name="name" autocomplete="name" required></label><label>Your email <input name="email" type="email" autocomplete="email" required></label></div>
  <button class="btn gold" type="submit">Send to the Rabbi</button><p class="msg" hidden></p>
</form></section>` });
  }));

  r.get('/get-involved', wrap(async (req, res) => {
    const C = content(), vol = C.events.filter((e) => e.published && e.category === 'volunteer');
    await render(res, { path: '/get-involved', title: 'Get involved', description: 'Volunteer, host a Shabbat meal, sponsor a Kiddush, share your news, join the Chai Club and help build Jewish life in Lamorinda.',
      body: `<section class="wrap sec"><h1>Get involved</h1><p class="lead-d">Chabad of Lamorinda is built by the community, for the community. Here is how you can be part of it, in five minutes or five hours.</p>
<div class="grid">
<a class="card tile" href="/account"><h3>Create your free account</h3><p>Save your family once and RSVP to anything in one tap.</p></a>
<a class="card tile" href="/events"><h3>Come to an event</h3><p>Bring a friend. Every Jew is welcome.</p></a>
<a class="card tile" href="/community#share"><h3>Share your news</h3><p>Births, weddings, bar and bat mitzvahs, and notices for the community.</p></a>
<a class="card tile" href="/kiddush/"><h3>Sponsor a Kiddush</h3><p>Celebrate a birthday or remember a loved one with the whole community.</p></a>
<a class="card tile" href="/programs/chai-club"><h3>Join the Chai Club</h3><p>A monthly gift in multiples of 18 keeps everything open to all.</p></a>
<a class="card tile" href="/contact?about=Host%20a%20Shabbat%20meal"><h3>Host a Shabbat meal</h3><p>Open your table to a newcomer or a student. We will make the match.</p></a>
<a class="card tile" href="/community?k=event-idea#share"><h3>Suggest an event or class</h3><p>Tell us what you would love to see.</p></a>
<a class="card tile" href="/community?k=resource#share"><h3>Add a resource</h3><p>Know a Jewish service in the area? Help us make the guide complete.</p></a>
<a class="card tile" href="/community?k=photo#share"><h3>Share your photos</h3><p>Took great photos at an event? Send us the link.</p></a>
</div>
${vol.length ? `<h2>Volunteer</h2><div class="grid">${vol.map((e) => `<a class="card tile" href="/events/${e.slug}"><h3>${esc(e.title)}</h3><p>${esc(e.summary || '')}</p></a>`).join('')}</div>` : `<h2>Volunteer</h2><p>Help set up the sukkah, bake challah, greet guests at holiday events or visit seniors. <a href="/contact?about=Volunteering">Tell us you would like to help</a>.</p>`}
<h2>Invite a friend</h2><p class="btns"><a class="btn ghost" href="https://wa.me/?text=${encodeURIComponent('Come with me to Chabad of Lamorinda! ' + base + '/events')}" rel="noopener" target="_blank">Share on WhatsApp</a><a class="btn ghost" href="mailto:?subject=${encodeURIComponent('Chabad of Lamorinda')}&body=${encodeURIComponent('Thought you would enjoy this: ' + base + '/events')}">Share by email</a></p>
</section>` });
  }));

  r.post('/api/site/submit', limit('site-submit', 8, 60 * 60 * 1000), express.json({ limit: '16kb' }), wrap(async (req, res) => {
    if (req.get('x-site') !== '1') return res.status(403).json({ code: 'forbidden', error: 'Forbidden.' });
    if (!pool) return res.status(503).json({ code: 'not_configured', error: 'Sharing is not switched on yet. Please email us.' });
    const b = req.body || {}, kind = Object.prototype.hasOwnProperty.call(KINDS, b.kind) ? b.kind : null;
    const title = clean(b.title, 120), body = String(b.body || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 2000), link = clean(b.link, 300);
    const m = readMember ? await readMember(req) : null, name = clean(b.name, 100) || (m && m.name) || '', email = (clean(b.email, 254) || (m && m.email) || '').toLowerCase();
    if (!kind) return res.status(400).json({ code: 'invalid_kind', error: 'Please choose what you are sharing.' });
    if (!title) return res.status(400).json({ code: 'invalid_title', error: 'Please add a headline.' });
    if (link && !/^https?:\/\//.test(link)) return res.status(400).json({ code: 'invalid_link', error: 'Links must start with https://' });
    if (!name || !validEmail(email)) return res.status(400).json({ code: 'invalid_contact', error: 'Please add your name and email so the Rabbi can reach you.' });
    await q('INSERT INTO submissions (id, kind, member_id, name, email, title, body, link) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', ['s_' + crypto.randomBytes(12).toString('hex'), kind, m ? m.id : null, name, email, title, body, link]);
    const to = notifyTo || content().org.email;
    if (mailer && to) mailer.send({ to, subject: `New on the website: ${KINDS[kind].label}`, text: `${name} <${email}> sent: ${title}\n\n${body}\n${link}\n\nApprove or decline in the Rabbi area: /admin/community` }).catch((e) => log.error('notify:', e && e.message));
    res.json({ ok: true });
  }));

  return {
    approved,
    mountAdmin(r2, { authed, wrap: w }) {
      if (!pool) return;
      r2.get('/api/site/submissions', authed, w(async (req, res) => res.json({ kinds: KINDS, items: (await q("SELECT * FROM submissions WHERE status='pending' OR decided_at > now() - interval '60 days' ORDER BY created_at DESC LIMIT 200")).rows })));
      r2.post('/api/site/submissions/:id', authed, express.json({ limit: '4kb' }), w(async (req, res) => {
        const status = req.body && req.body.status;
        if (!['approved', 'declined', 'pending'].includes(status)) return res.status(400).json({ code: 'invalid', error: 'Invalid status.' });
        await q('UPDATE submissions SET status=$2, decided_at=now() WHERE id=$1', [String(req.params.id).slice(0, 40), status]);
        res.json({ ok: true });
      }));
    },
  };
}
module.exports = { mountBoard, KINDS };
