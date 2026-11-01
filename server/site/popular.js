// What visitors open most, so lists put the most-wanted things first (the Rabbi's direction: "always sort areas that
// people tend to click more so it's easier to get to what you're looking for").
// Counts come from visitor_views (one view per visitor, page and day; see visitors.js) over the last 90 days, read
// in the background at most once an hour. A page needs MIN views before it moves; until then, and with no data at all
// (a new site, tests), the order written in the code or content stays. Ties keep the written order too.
// Use: byPopularity(items, (x) => '/programs/' + x.slug); { pinned: (x) => x.urgent } keeps some things always first;
// { score: (x) => n } counts a group (all the guides of a subject).
'use strict';

const HOUR = 60 * 60 * 1000, MIN = 3;
let query = null, log = console, counts = new Map(), at = 0, busy = false;

function start(q, logger) { query = q || null; if (logger) log = logger; return refresh(); }
async function refresh() {
  if (!query || busy) return;
  busy = true;
  try {
    const r = await query('SELECT path, count(*)::int AS n FROM visitor_views WHERE day >= CURRENT_DATE - 90 GROUP BY path');
    counts = new Map(r.rows.map((x) => [x.path, x.n]));
  } catch (e) { if (!/does not exist/.test(e && e.message)) log.error('popular:', e && e.message); }
  at = Date.now(); busy = false;
}
// How many visitors opened this page (language prefix and ?query ignored).
function views(path) {
  if (!path) return 0;
  if (query && Date.now() - at > HOUR) refresh();
  return counts.get(String(path || '').replace(/^\/(he|ru)(?=\/|$)/, '').split(/[?#]/)[0] || '/') || 0;
}
function byPopularity(items, pathOf, { pinned = () => false, score: count = (x) => views(pathOf(x)) } = {}) {
  const score = (x) => { const n = count(x); return n >= MIN ? n : 0; };
  return items.map((x, i) => ({ x, i, p: pinned(x) ? 1 : 0, s: score(x) }))
    .sort((a, b) => b.p - a.p || b.s - a.s || a.i - b.i).map((o) => o.x);
}
// For tests: set the counts by hand ({ '/help/new-baby': 9 }).
function setCounts(obj) { counts = new Map(Object.entries(obj || {})); at = Date.now(); }

module.exports = { start, views, byPopularity, setCounts, MIN };
