// Post an event from the website to the Facebook Page:  npm run facebook:post -- <event-slug>
// Needs FB_PAGE_ID and FB_PAGE_TOKEN (and PUBLIC_URL) in the environment. See store/website-setup.md.
// Usually easier: the "Social drafts" list in the Rabbi area (/admin/community), one Publish button per event.
'use strict';
const { load } = require('../server/site/content.js');
const { createFacebook, draftMessage, eventImage } = require('../server/site/facebook.js');
const { makeCtx } = require('../server/site/ctx.js');
const { createI18n } = require('../server/site/i18n.js');
const { DIR } = require('../server/site/content.js');

const slug = process.argv[2], C = load();
const when = makeCtx({ content: () => C, i18n: createI18n(DIR) })({ lang: 'en' }).when;
const e = C.events.find((x) => x.slug === slug && x.published);
if (!e) { console.error('No published event with slug "' + slug + '".'); process.exit(1); }
const base = (process.env.PUBLIC_URL || 'https://www.chabadoflamorinda.com').replace(/\/+$/, '');
const fb = createFacebook({ pageId: process.env.FB_PAGE_ID, token: process.env.FB_PAGE_TOKEN, base });
if (!fb) { console.error('Set FB_PAGE_ID and FB_PAGE_TOKEN first.'); process.exit(1); }
fb.publish({ message: draftMessage(e, when(e), base, C.org), link: base + '/events/' + e.slug, image: eventImage(e, base) })
  .then((id) => console.log('Posted to Facebook: ' + id), (err) => { console.error(err.message); process.exit(1); });
