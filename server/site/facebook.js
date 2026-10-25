// Facebook Page + Instagram connection (switched on by FB_PAGE_ID + FB_PAGE_TOKEN; Instagram also needs IG_USER_ID).
// See store/website-setup.md.
//  * pulls the Page's photos onto the website (home page and /photos), refreshed every hour;
//  * every event on the website becomes a ready-made post in the Rabbi area ("Social drafts"), published to the
//    Facebook Page (and Instagram) with one button, with the flyer or event photo attached.
// Facebook no longer lets apps create Facebook *Events*; the draft screen also has "Copy and open Facebook Events"
// for when a real Facebook Event is wanted.
'use strict';
const GRAPH = 'https://graph.facebook.com/v21.0';

function createFacebook({ pageId, token, igUserId = '', base, fetchImpl = fetch, log = console }) {
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
          const big = imgs[imgs.length - 1];
          return pick && { src: pick.source, big: big ? big.source : pick.source, alt: p.alt_text || (p.name || 'Community photo').slice(0, 120), link: p.link, at: p.created_time };
        }).filter(Boolean) };
      } catch (e) { log.error(e.message); cache.at = Date.now() - 3000e3; } // retry in 10 minutes
    }
    return cache.list.slice(0, n);
  }
  // With a picture: a photo post (shows big in the feed). Without: a link post with the event page's preview.
  async function publish({ message, link, image }) {
    const out = image ? await graph(`/${pageId}/photos`, { url: image, caption: message }, 'POST') : await graph(`/${pageId}/feed`, { message, link }, 'POST');
    return out.post_id || out.id;
  }
  async function publishInstagram({ message, image }) {
    if (!igUserId) throw new Error('Instagram is not connected (IG_USER_ID).');
    if (!image) throw new Error('Instagram posts need a picture: add an image or flyer to the event.');
    const c = await graph(`/${igUserId}/media`, { image_url: image, caption: message }, 'POST');
    return (await graph(`/${igUserId}/media_publish`, { creation_id: c.id }, 'POST')).id;
  }
  return { photos, publish, publishInstagram, instagram: !!igUserId };
}

// The text of the draft post for an event (editable before publishing).
function draftMessage(e, when, base, org) {
  const tags = ['Lafayette', 'Moraga', 'Orinda', 'Lamorinda', 'JewishLamorinda', 'Chabad'];
  if (e.holiday) tags.unshift(e.holiday.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(''));
  return [
    e.title,
    `📅 ${when}`,
    `📍 ${e.loc.name}${e.loc.address ? ', ' + e.loc.address : ''}`,
    '',
    e.summary || '',
    e.price ? `\n${e.price}` : '',
    '',
    e.rsvp ? `RSVP in one tap: ${base}/events/${e.slug}` : `Details: ${base}/events/${e.slug}`,
    '',
    `Everyone is welcome at ${org.name}. No membership needed.`,
    tags.map((t) => '#' + t).join(' '),
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
}
// An image the networks can fetch: the event's picture, else a flyer that is an image.
const eventImage = (e, base) => { const src = e.image || (e.flyer && /\.(jpe?g|png)$/i.test(e.flyer) ? e.flyer : ''); return src ? (/^https?:/.test(src) ? src : base + src) : ''; };

module.exports = { createFacebook, draftMessage, eventImage };
