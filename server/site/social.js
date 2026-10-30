// "Social drafts" in the Rabbi area: every upcoming event on the website is waiting as a ready-made post.
// One button publishes it to the Facebook Page (and Instagram when connected). Also shown: the matching
// Google Business Profile post text, an "Add to Google Calendar" link, and a helper to create a Facebook Event.
'use strict';
const express = require('express');
const { draftMessage, eventImage } = require('./facebook.js');

function googleCalendarUrl(e, base) {
  const t = (s) => s.replace(/[-:]/g, '') + '00';
  const end = e.end || (() => { const d = new Date(e.start + ':00Z'); d.setUTCHours(d.getUTCHours() + 2); return d.toISOString().slice(0, 16); })();
  const p = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${t(e.start)}/${t(end)}`, ctz: 'America/Los_Angeles', details: `${e.summary || ''}\n${base}/events/${e.slug}`, location: e.loc.address ? `${e.loc.name}, ${e.loc.address}` : e.loc.name });
  return 'https://calendar.google.com/calendar/render?' + p;
}
const googlePost = (e, when, base) => `${e.title}\n${when}\n\n${e.summary || ''}\n\nRSVP: ${base}/events/${e.slug}`.trim();
// Nextdoor (very active in Lamorinda): a friendly neighbor-to-neighbor note.
const nextdoorPost = (e, when, base, org) => `Hi neighbors! ${e.title}: ${when}${e.loc && e.loc.name ? ', ' + e.loc.name : ''}.\n\n${e.summary || ''}\n\n${e.price ? e.price + '. ' : ''}Everyone is welcome, no membership needed. Details and RSVP: ${base}/events/${e.slug}\n\n${org.name}, ${org.phone}`.trim();
// Local newspapers' and websites' community calendars: the facts in the order editors expect.
const calendarListing = (e, when, base, org) => [`Event: ${e.title}`, `When: ${when}`, `Where: ${e.loc ? [e.loc.name, e.loc.address].filter(Boolean).join(', ') : ''}`, `Cost: ${e.price || 'See the website'}`, `Description: ${e.summary || ''}`, `Organizer: ${org.name}`, `Contact: ${org.phone}${org.email ? ', ' + org.email : ''}`, `Website: ${base}/events/${e.slug}`].join('\n');

function mountSocialAdmin(r, { authed, wrap }, { store, content, fb, base, when }) {
  const q = store ? (t, p) => store.pool.query(t, p) : null;
  const today = () => new Date().toISOString().slice(0, 10);
  r.get('/api/site/social', authed, wrap(async (req, res) => {
    const C = content(), posted = q ? (await q('SELECT * FROM social_posts')).rows : [];
    const items = C.events.filter((e) => e.published && (e.end || e.start).slice(0, 10) >= today()).map((e) => {
      const done = Object.fromEntries(posted.filter((p) => p.event_slug === e.slug).map((p) => [p.network, { id: p.post_id, at: p.posted_at }]));
      return { slug: e.slug, title: e.title, start: e.start, when: when(e), url: base + '/events/' + e.slug, image: eventImage(e, base), message: draftMessage(e, when(e), base, C.org), google: googlePost(e, when(e), base), nextdoor: nextdoorPost(e, when(e), base, C.org), calendar: calendarListing(e, when(e), base, C.org), googleCalendar: googleCalendarUrl(e, base), posted: done };
    });
    res.json({ facebook: !!fb, instagram: !!(fb && fb.instagram), items });
  }));
  r.post('/api/site/social/:slug', authed, express.json({ limit: '16kb' }), wrap(async (req, res) => {
    if (!fb) return res.status(503).json({ code: 'not_configured', error: 'Facebook is not connected yet (FB_PAGE_ID and FB_PAGE_TOKEN in Render).' });
    const C = content(), e = C.events.find((x) => x.slug === req.params.slug && x.published);
    if (!e) return res.status(404).json({ code: 'not_found', error: 'Event not found.' });
    const message = String((req.body && req.body.message) || draftMessage(e, when(e), base, C.org)).slice(0, 5000);
    const nets = Array.isArray(req.body && req.body.networks) && req.body.networks.length ? req.body.networks : ['facebook'];
    const image = eventImage(e, base), out = {};
    for (const n of nets) {
      try {
        const id = n === 'instagram' ? await fb.publishInstagram({ message, image }) : n === 'facebook' ? await fb.publish({ message, link: base + '/events/' + e.slug, image }) : null;
        if (!id) continue;
        out[n] = { ok: true, id };
        if (q) await q('INSERT INTO social_posts (event_slug, network, post_id, message) VALUES ($1,$2,$3,$4) ON CONFLICT (event_slug, network) DO UPDATE SET post_id=EXCLUDED.post_id, message=EXCLUDED.message, posted_at=now()', [e.slug, n, String(id), message]);
      } catch (err) { out[n] = { ok: false, error: err.message }; }
    }
    res.json({ ok: Object.values(out).some((x) => x.ok), results: out });
  }));
}
module.exports = { mountSocialAdmin, googleCalendarUrl };
