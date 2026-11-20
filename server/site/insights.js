// What the visits tell us, in words the Rabbi can act on:
// * pastoralEmail: "Someone may need you", sent when someone (named or anonymous) reads our pages about a loss, a hard time or a new
//   baby: what they read, for how long, from which kind of device and area, and where they came from.
// * draftEmail: someone started a form or a gift, typed their name, email or phone, and did not finish.
// * ideas: suggestions from the last 30 days (what people read, search, start and leave), to make the website more useful and to help
//   people take the next step (an RSVP, the weekly email, a gift).
'use strict';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Kind of device, from the browser's own description (never stored in full).
function deviceOf(ua) {
  ua = String(ua || '');
  if (/bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp\/|bingpreview/i.test(ua)) return 'bot';
  if (/iPad|Tablet|Kindle|Silk|SM-T\d|Nexus (7|9|10)/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'Tablet';
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return 'Phone';
  return 'Computer';
}
// General area, from the time zone the browser reports (no IP addresses are kept or looked up).
const AREA = { 'America/Los_Angeles': 'US, Pacific time', 'America/Vancouver': 'Canada, Pacific time', 'America/Denver': 'US, Mountain time', 'America/Boise': 'US, Mountain time',
  'America/Phoenix': 'US, Arizona', 'America/Chicago': 'US, Central time', 'America/New_York': 'US, Eastern time', 'America/Detroit': 'US, Eastern time', 'America/Toronto': 'Canada, Eastern time',
  'America/Anchorage': 'US, Alaska', 'Pacific/Honolulu': 'US, Hawaii', 'Asia/Jerusalem': 'Israel', 'Asia/Tel_Aviv': 'Israel', 'Europe/London': 'UK', 'Europe/Moscow': 'Russia', 'Europe/Kiev': 'Ukraine', 'Europe/Kyiv': 'Ukraine' };
const areaOf = (tz) => AREA[tz] || (tz ? String(tz).split('/').pop().replace(/_/g, ' ') : '');
const howLong = (s) => (s < 60 ? `${Math.max(1, s)} sec` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} hours`);
const pacific = (d) => new Date(d).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
const cleanTitle = (t) => String(t || '').replace(/\s*[|—–-]\s*Chabad of Lamorinda\s*$/i, '').trim();

// "Someone may need you"
function pastoralEmail({ base, who, tags, device, area, visits, when, source, pages, visitorUrl }) {
  const name = who ? (who.name || who.email) : 'An anonymous visitor';
  const meta = [device, area, visits].filter(Boolean).join(' · ');
  const next = who
    ? `Next step: this may be a good moment to reach out gently${who.phone ? ` (${who.phone})` : ''}${who.email ? `, or write to ${who.email}` : ''}. They did not ask for anything, so a warm "thinking of you" is best.`
    : 'Next step: we do not know who this is, so there is no one to call yet. If they visit again after clicking one of our emails or filling in a form, their name will appear in Visitors.';
  const list = pages.map((p, i) => `${i + 1}. ${cleanTitle(p.title) || p.path} · ${howLong(p.secs)}`);
  const text = [`SOMEONE MAY NEED YOU (${tags.join(', ')})`, '', name, meta, `${when} · came from ${source}`, '', 'What they read:', ...list, '', next, '', `This visitor's visits: ${visitorUrl}`, '',
    'Sent when someone reads our pages about a death or mourning, illness or hard times, or a new baby. Names appear only for people who have identified themselves (an email click, a form or a registration). Please handle with care: this is private.'].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f7f3ea;padding:16px;font:15px/1.5 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2a2622">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e8dfcc;border-radius:10px;overflow:hidden">
<tr><td style="background:#9a5b2e;padding:16px 22px;color:#fff"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.9">Pastoral alert · jewishlamorinda.com</div><div style="font-size:20px;font-weight:600;margin-top:4px">Someone may need you</div></td></tr>
<tr><td style="padding:18px 22px">${tags.map((t) => `<span style="display:inline-block;background:#3f7a78;color:#fff;border-radius:999px;padding:2px 10px;font-size:12px;margin-right:6px">${esc(t)}</span>`).join('')}
<div style="font-size:18px;font-weight:600;margin-top:10px">${esc(name)}</div><div style="color:#6b6258;font-size:13px">${esc(meta)}</div>
<div style="color:#6b6258;font-size:13px;margin-top:6px">${esc(when)} · came from ${esc(source)}</div>
<ol style="margin:10px 0 12px;padding-left:20px">${pages.map((p) => `<li><a href="${esc(base + p.path)}" style="color:#3f7a78">${esc(cleanTitle(p.title) || p.path)}</a> <span style="color:#6b6258">· ${esc(howLong(p.secs))}</span></li>`).join('')}</ol>
<div style="background:#fbf5e6;border-radius:8px;padding:12px 14px">${esc(next).replace(/^Next step:/, '<strong>Next step:</strong>')}</div>
<p style="margin:12px 0 0"><a href="${esc(visitorUrl)}" style="color:#9a5b2e">This visitor's visits</a></p></td></tr>
<tr><td style="padding:12px 22px;border-top:1px solid #eee;color:#7a7268;font-size:12px">Sent when someone reads our pages about a death or mourning, illness or hard times, or a new baby. Names appear only for people who have identified themselves (an email click, a form or a registration). Please handle with care: this is private.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: `Someone may need you: ${tags.join(', ')}${who ? ' (' + name + ')' : ''}`, text, html };
}

// Someone started a form (or a gift) and stopped.
function draftEmail({ base, d, formTitle, pages, visitorUrl }) {
  const who = d.name || d.email || d.phone;
  const lines = [`${who} started ${formTitle}${d.amount ? ` (${d.amount})` : ''} on the website but did not finish.`, '',
    d.name ? `Name: ${d.name}` : '', d.email ? `Email: ${d.email}` : '', d.phone ? `Phone: ${d.phone}` : '', `Page: ${base}${d.path || '/'}`, `When: ${pacific(d.updated_at)}`,
    pages.length ? `\nWhat else they read today: ${pages.map((p) => cleanTitle(p.title) || p.path).join(' · ')}` : '', '',
    'Next step: people are often interrupted. A short, friendly note ("I saw you started… can I help?") usually helps.', `This visitor's visits: ${visitorUrl}`];
  return { subject: `Website: ${who} started ${formTitle} but did not finish`, text: lines.filter((x) => x !== '').join('\n') };
}

// Ideas from the last 30 days. Each: { text, why, link } in plain words. Never names; only counts.
async function ideas(q, C, base = '') {
  const many = async (sql, p) => { try { return (await q(sql, p)).rows; } catch (e) { return []; } };
  const one = async (sql, p) => { const r = await many(sql, p); return r[0] ? Number(Object.values(r[0])[0]) || 0 : 0; };
  const out = [];
  const titleOf = (path) => {
    const m = /^\/learn\/([a-z0-9-]+)$/.exec(path), g = m && (C.learn || []).find((x) => x.slug === m[1]); if (g) return g.title;
    const e = /^\/events\/([a-z0-9-]+)$/.exec(path), ev = e && (C.events || []).find((x) => x.slug === e[1]); if (ev) return ev.title;
    return path;
  };
  const [visitors, before, now7, top, missed, donateViews, giveDrafts, giveSent, regulars, pastoral, srcs, unfinished, avgSecs] = await Promise.all([
    one('SELECT count(DISTINCT vid)::int FROM visitor_views WHERE day >= CURRENT_DATE - 30'),
    one('SELECT count(DISTINCT vid)::int FROM visitor_views WHERE day >= CURRENT_DATE - 60 AND day < CURRENT_DATE - 30'),
    one('SELECT count(DISTINCT vid)::int FROM visitor_views WHERE day >= CURRENT_DATE - 7'),
    many("SELECT path, count(DISTINCT vid)::int AS n FROM visitor_views WHERE day >= CURRENT_DATE - 30 AND path LIKE '/learn/%' GROUP BY path ORDER BY n DESC LIMIT 3"),
    many('SELECT q, sum(n)::int AS n FROM site_searches WHERE day >= CURRENT_DATE - 30 AND results = 0 GROUP BY q ORDER BY n DESC LIMIT 20').then((rows) => rows.filter((m) => require('./search.js').stillMissing(C, m.q)).slice(0, 3)),
    one("SELECT count(DISTINCT vid)::int FROM visitor_views WHERE day >= CURRENT_DATE - 30 AND path = '/donate'"),
    one("SELECT count(*)::int FROM form_drafts WHERE created_at > now() - interval '30 days' AND form = 'give'"),
    one("SELECT count(*)::int FROM form_drafts WHERE created_at > now() - interval '30 days' AND form = 'give' AND submitted_at IS NOT NULL"),
    one(`SELECT count(*)::int FROM (SELECT vid FROM visitor_views WHERE day >= CURRENT_DATE - 30 GROUP BY vid HAVING count(DISTINCT day) >= 3) r WHERE vid NOT IN (SELECT vid FROM visitor_people)`),
    one('SELECT count(*)::int FROM visitor_pastoral WHERE day >= CURRENT_DATE - 30'),
    many("SELECT source, count(*)::int AS n FROM visitor_sources WHERE day >= CURRENT_DATE - 30 AND source <> 'direct' GROUP BY source ORDER BY n DESC LIMIT 3"),
    one("SELECT count(*)::int FROM form_drafts WHERE created_at > now() - interval '30 days' AND submitted_at IS NULL AND (email <> '' OR phone <> '')"),
    one("SELECT COALESCE(round(avg(s)),0)::int FROM (SELECT sum(secs) AS s FROM visitor_hits WHERE started_at > now() - interval '30 days' GROUP BY vid) t"),
  ]);
  if (visitors) out.push({ text: `${visitors} people visited in the last 30 days${before ? ` (${visitors >= before ? 'up' : 'down'} from ${before} the month before)` : ''}; ${now7} this week.${avgSecs ? ` They spend about ${howLong(avgSecs)} on the site each.` : ''}`, why: 'The big picture.' });
  // Upcoming events: many readers, few RSVPs.
  const soon = (C.events || []).filter((e) => e.rsvp && !e.draft && e.startIso && Date.parse(e.startIso) > Date.now() && Date.parse(e.startIso) < Date.now() + 45 * 864e5);
  for (const e of soon) {
    const views = await one("SELECT count(DISTINCT vid)::int FROM visitor_views WHERE day >= CURRENT_DATE - 30 AND path = $1", ['/events/' + e.slug]);
    const going = await one('SELECT count(*)::int FROM rsvps WHERE event_slug = $1', [e.slug]);
    if (views >= 10 && going < views / 5) out.push({ text: `"${e.title}": ${views} people looked at it, ${going} RSVP${going === 1 ? '' : 's'}. Put it first in this week's email and share the page on WhatsApp with a personal line; the RSVP takes one tap.`, why: 'Interest is there; a nudge turns it into a reply.', link: `/events/${e.slug}` });
  }
  if (donateViews >= 5) out.push({ text: `${donateViews} people opened the Donate page${giveDrafts ? `, ${giveDrafts} started filling it in and ${giveSent} went on to pay` : ''}. ${giveDrafts > giveSent ? 'Those who stopped get a friendly follow-up from you (they appear under "Started but didn\'t finish").' : 'A matching day or a clear goal ("help us reach $5,000 for Chanukah") gives people a reason to finish.'}`, why: 'Giving is easiest when there is a reason and a moment.', link: '/donate' });
  if (unfinished) out.push({ text: `${unfinished} people typed their details into a form or the giving page and did not finish. Each one is listed with Call / Email buttons; a short personal note works best.`, why: 'They were close.', link: '/admin/community#visitors' });
  if (regulars) out.push({ text: `${regulars} people came back on 3 or more days this month without ever leaving their name. They are your quiet regulars: a reason to say hello (a free class, a Shabbat dinner invitation, the weekly email) on the pages they read most can turn them into friends.`, why: 'Regular readers are the warmest audience.' });
  for (const t of top.slice(0, 2)) out.push({ text: `"${titleOf(t.path)}" was read by ${t.n} people this month. Share it on Facebook and WhatsApp, or put it in the weekly email; a related class or event on that topic would likely draw people.`, why: 'Write and teach more of what people already want.', link: t.path });
  for (const m of missed) out.push({ text: `People searched the website for "${m.q}" ${m.n} time${m.n === 1 ? '' : 's'} and found nothing. Ask Claude to write a guide on it.`, why: 'An unanswered question is the clearest writing list.' });
  if (srcs.length) out.push({ text: `Most visitors who did not type the address came from ${srcs.map((s) => `${s.source} (${s.n})`).join(', ')}. ${srcs.some((s) => s.source === 'whatsapp' || s.source === 'facebook') ? 'Sharing works: keep posting each event and guide there.' : 'Sharing events on WhatsApp and Facebook (with ?src=whatsapp on the link) brings more people and shows you what works.'}`, why: 'Do more of what brings people.' });
  if (pastoral) out.push({ text: `${pastoral} times this month someone read our pages about loss, illness or a new baby. A short "call me any time" video from you on those pages, or a line in the weekly email, can help people reach out.`, why: 'People in need often read before they call.' });
  return out.slice(0, 10);
}

module.exports = { deviceOf, areaOf, howLong, pacific, cleanTitle, pastoralEmail, draftEmail, ideas };
