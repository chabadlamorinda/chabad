// "How is the website doing?": visitors, the most-read pages, where visitors came from, sign-ups and the searches that found nothing,
// this week against last week. Used by the Monday email to the Rabbi (reminders.js) and by the Rabbi area (reading.js).
'use strict';

async function tractionData(q, C) {
  const one = async (sql, fallback = 0) => { try { const r = (await q(sql)).rows[0]; return r ? Number(Object.values(r)[0]) : fallback; } catch (e) { return fallback; } };
  const many = async (sql) => { try { return (await q(sql)).rows; } catch (e) { return []; } };
  const [visitors, before, views, topPages, sources, forms, rsvps, requests, subs, missed] = await Promise.all([
    one('SELECT count(DISTINCT vid)::int FROM visitor_views WHERE day >= CURRENT_DATE - 7'),
    one('SELECT count(DISTINCT vid)::int FROM visitor_views WHERE day >= CURRENT_DATE - 14 AND day < CURRENT_DATE - 7'),
    one('SELECT count(*)::int FROM visitor_views WHERE day >= CURRENT_DATE - 7'),
    many("SELECT path, count(*)::int AS n FROM visitor_views WHERE day >= CURRENT_DATE - 7 GROUP BY path ORDER BY n DESC LIMIT 8"),
    many("SELECT source, count(*)::int AS n FROM visitor_sources WHERE day >= CURRENT_DATE - 7 GROUP BY source ORDER BY n DESC LIMIT 8"),
    one("SELECT count(*)::int FROM form_responses WHERE created_at > now() - interval '7 days'"),
    one("SELECT count(*)::int FROM rsvps WHERE created_at > now() - interval '7 days'"),
    one("SELECT count(*)::int FROM site_leads WHERE created_at > now() - interval '7 days'"),
    one("SELECT count(*)::int FROM email_subscribers WHERE created_at > now() - interval '7 days'"),
    many("SELECT q, sum(n)::int AS n FROM site_searches WHERE day >= CURRENT_DATE - 7 AND results = 0 GROUP BY q ORDER BY n DESC LIMIT 5"),
  ]);
  const title = (p) => { const m = /^\/learn\/([a-z0-9-]+)$/.exec(p), a = m && C && C.learn.find((x) => x.slug === m[1]); return a ? a.title : p; };
  return { visitors, before, views, topPages: topPages.map((x) => ({ ...x, title: title(x.path) })), sources, forms, rsvps, requests, subs, missed };
}
const change = (a, b) => (b ? `${a >= b ? '+' : '-'}${Math.round(Math.abs(a - b) * 100 / b)}% vs last week (${b})` : 'first full week');

function weeklyText(d, base) {
  const L = [`VISITORS this week: ${d.visitors} people (${change(d.visitors, d.before)}), ${d.views} page views.`, ''];
  if (d.sources.length) { L.push('HOW THEY FOUND US'); for (const s of d.sources) L.push(`- ${s.source}: ${s.n}`); L.push(''); }
  if (d.topPages.length) { L.push('MOST-READ PAGES'); for (const p of d.topPages) L.push(`- ${p.title} (${p.n})`); L.push(''); }
  L.push('WHAT PEOPLE DID', `- RSVPs: ${d.rsvps}`, `- Forms and sign-ups: ${d.forms}`, `- Weekly-email sign-ups: ${d.subs}`, `- Call / Text / WhatsApp requests: ${d.requests}`, '');
  if (d.missed.length) { L.push('SEARCHED FOR, NOTHING FOUND (tell Claude to write these)'); for (const m of d.missed) L.push(`- "${m.q}" (${m.n}×)`); L.push(''); }
  L.push(`More detail: ${base}/admin/community#reading`, 'Google Analytics: analytics.google.com. What people typed into Google: search.google.com/search-console.');
  return L.join('\n');
}
async function weeklyTraction(q, base, C) {
  const d = await tractionData(q, C);
  if (!d.visitors && !d.views) return null;
  return { subject: `How the website did this week: ${d.visitors} visitors`, text: weeklyText(d, base) };
}
module.exports = { tractionData, weeklyTraction, weeklyText };
