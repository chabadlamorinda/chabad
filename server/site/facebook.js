// Facebook Page connection (switched on by FB_PAGE_ID + FB_PAGE_TOKEN, see store/website-setup.md):
//  * pulls the Page's photos onto the website (/photos and the home page), refreshed every hour;
//  * posts an event from the website to the Page (from the Rabbi area or `npm run facebook:post -- <event>`).
// Note: Facebook no longer lets apps create Facebook *Events*; we publish a Page post linking to the event page,
// which carries the RSVP button, so every RSVP lands in one list.
'use strict';
const GRAPH = 'https://graph.facebook.com/v21.0';

function createFacebook({ pageId, token, base, fetchImpl = fetch, log = console }) {
  if (!pageId || !token) return null;
  let cache = { at: 0, list: [] };
  async function graph(path, params = {}, method = 'GET') {
    const u = new URL(GRAPH + path);
    const body = new URLSearchParams({ ...params, access_token: token });
    const r = method === 'GET' ? await fetchImpl(u + '?' + body) : await fetchImpl(u, { method, body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error('Facebook: ' + ((j.error && j.error.message) || r.status));
    return j;
  }
  async function photos(n = 12) {
    if (Date.now() - cache.at > 3600e3) {
      try {
        const j = await graph(`/${pageId}/photos`, { type: 'uploaded', fields: 'images,name,alt_text,link,created_time', limit: '60' });
        cache = { at: Date.now(), list: (j.data || []).map((p) => {
          const imgs = (p.images || []).slice().sort((a, b) => a.width - b.width), pick = imgs.find((i) => i.width >= 400) || imgs[imgs.length - 1];
          return pick && { src: pick.source, alt: p.alt_text || (p.name || 'Community photo').slice(0, 120), link: p.link, at: p.created_time };
        }).filter(Boolean) };
      } catch (e) { log.error(e.message); cache.at = Date.now() - 3000e3; } // retry in 10 minutes
    }
    return cache.list.slice(0, n);
  }
  async function postEvent(e, when) {
    const message = `${e.title}\n${when}\n\n${e.summary || ''}\n\nRSVP: ${base}/events/${e.slug}`.trim();
    return graph(`/${pageId}/feed`, { message, link: `${base}/events/${e.slug}` }, 'POST');
  }
  return { photos, postEvent };
}
module.exports = { createFacebook };
