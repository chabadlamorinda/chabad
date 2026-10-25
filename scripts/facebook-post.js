// Post an event from the website to the Facebook Page:  npm run facebook:post -- <event-slug>
// Needs FB_PAGE_ID and FB_PAGE_TOKEN (and PUBLIC_URL) in the environment. See store/website-setup.md.
'use strict';
const { load } = require('../server/site/content.js');
const { createFacebook } = require('../server/site/facebook.js');
const { when } = require('../server/site/pages.js');

const slug = process.argv[2];
const e = load().events.find((x) => x.slug === slug && x.published);
if (!e) { console.error('No published event with slug "' + slug + '".'); process.exit(1); }
const fb = createFacebook({ pageId: process.env.FB_PAGE_ID, token: process.env.FB_PAGE_TOKEN, base: (process.env.PUBLIC_URL || 'https://www.chabadoflamorinda.com').replace(/\/+$/, '') });
if (!fb) { console.error('Set FB_PAGE_ID and FB_PAGE_TOKEN first.'); process.exit(1); }
fb.postEvent(e, when(e)).then((r) => console.log('Posted to Facebook: ' + r.id), (err) => { console.error(err.message); process.exit(1); });
