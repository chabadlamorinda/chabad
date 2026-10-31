// What people read and look for, for the Rabbi area ("What people read and search"):
// * the most-read guides and pages of the last 30 days (from visitor_views: one view per visitor, page and day);
// * what people searched for on the site (site_searches: the words, the language, how many results, counted per
//   day; no names, no visitor ids), and above all the searches that found nothing, which become the writing list.
'use strict';

function mountReading({ store, content, log = console }) {
  const pool = store && store.pool, q = (t, p) => pool.query(t, p);
  let ready = null;
  const ensure = () => ready || (ready = q(`CREATE TABLE IF NOT EXISTS site_searches (q TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'en', day DATE NOT NULL DEFAULT CURRENT_DATE,
    results INT NOT NULL DEFAULT 0, n INT NOT NULL DEFAULT 1, PRIMARY KEY (q, lang, day))`).catch((e) => { ready = null; throw e; }));

  // Called by /search for every search typed on the site.
  async function logSearch(text, lang, results) {
    const s = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!pool || s.length < 2) return;
    try {
      await ensure();
      await q(`INSERT INTO site_searches (q, lang, results) VALUES ($1,$2,$3) ON CONFLICT (q, lang, day) DO UPDATE SET n=site_searches.n+1, results=$3`, [s, lang, results]);
    } catch (e) { log.error('search log:', e && e.message); }
  }

  function mountAdmin(r2, { authed, wrap }) {
    if (!pool) return;
    r2.get('/api/site/reading', authed, wrap(async (req, res) => {
      await ensure();
      const C = content(), title = (p) => { const m = /^\/learn\/([a-z0-9-]+)$/.exec(p), a = m && C.learn.find((x) => x.slug === m[1]); return a ? a.title : p; };
      const guides = (await q(`SELECT path, count(*)::int AS n FROM visitor_views WHERE day >= CURRENT_DATE - 30 AND path LIKE '/learn/%' GROUP BY path ORDER BY n DESC LIMIT 15`)).rows.map((r) => ({ ...r, title: title(r.path) }));
      const pages = (await q(`SELECT path, count(*)::int AS n FROM visitor_views WHERE day >= CURRENT_DATE - 30 AND path NOT LIKE '/learn/%' GROUP BY path ORDER BY n DESC LIMIT 10`)).rows;
      const missed = (await q(`SELECT q, lang, sum(n)::int AS n, max(day) AS last FROM site_searches WHERE day >= CURRENT_DATE - 90 AND results = 0 GROUP BY q, lang ORDER BY n DESC, last DESC LIMIT 30`)).rows;
      const top = (await q(`SELECT q, sum(n)::int AS n FROM site_searches WHERE day >= CURRENT_DATE - 30 GROUP BY q ORDER BY n DESC LIMIT 15`)).rows;
      const unread = C.learn.length - (await q(`SELECT count(DISTINCT path)::int AS n FROM visitor_views WHERE day >= CURRENT_DATE - 30 AND path LIKE '/learn/%'`)).rows[0].n;
      res.json({ guides, pages, missed, top, guidesTotal: C.learn.length, unread: Math.max(0, unread) });
    }));
  }
  return { logSearch, mountAdmin };
}
module.exports = { mountReading };
