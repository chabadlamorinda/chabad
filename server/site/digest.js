// The Rabbi's morning summary email (sent once a day from reminders.js, at 9 AM Lafayette time): everything from the
// last 24 hours that may need him, in one short email. Nothing is sent on a quiet day.
'use strict';
const { interestOf } = require('./visitors.js');

const TOPIC = { mezuzah: 'mezuzah', tefillin: 'tefillin', donation: 'giving', meeting: 'a meeting', consult: 'a private conversation' };
const HOW = { call: 'tapped Call', text: 'tapped Text', whatsapp: 'tapped WhatsApp', email: 'tapped Email', chat: 'asked the chat' };

async function morningDigest(q, base) {
  const since = "now() - interval '24 hours'", rows = async (sql) => (await q(sql).catch(() => ({ rows: [] }))).rows;
  const [leads, people, forms, pending, rsvps, questions, visits] = await Promise.all([
    rows(`SELECT topic, channel, page, detail FROM site_leads WHERE created_at > ${since} ORDER BY created_at`),
    rows(`SELECT p.email, max(p.name) AS name, max(p.phone) AS phone, array_agg(DISTINCT v.path) AS paths FROM visitor_views v JOIN visitor_people p ON p.vid = v.vid WHERE v.day >= CURRENT_DATE - 1 GROUP BY p.email`),
    rows(`SELECT form_id, count(*)::int AS n FROM form_responses WHERE created_at > ${since} GROUP BY form_id`),
    rows("SELECT count(*)::int AS n FROM submissions WHERE status = 'pending'"),
    rows(`SELECT event_slug, count(*)::int AS n FROM rsvps WHERE created_at > ${since} GROUP BY event_slug`),
    rows(`SELECT question FROM chat_questions WHERE created_at > ${since} ORDER BY created_at DESC LIMIT 5`),
    rows('SELECT count(DISTINCT vid)::int AS n FROM visitor_views WHERE day = CURRENT_DATE - 1'),
  ]);
  const L = [];
  if (leads.length) { L.push('REQUESTS'); for (const l of leads) L.push(`- Someone ${HOW[l.channel] || l.channel} about ${TOPIC[l.topic] || l.topic}${l.page ? ' (' + l.page + ')' : ''}${l.detail ? ': ' + l.detail.replace(/\s+/g, ' ').slice(0, 160) : ''}`); L.push(''); }
  const warm = people.map((p) => ({ ...p, interests: [...new Set(p.paths.map(interestOf).filter((i) => i && i.alert).map((i) => i.label))] })).filter((p) => p.interests.length);
  if (warm.length) { L.push('PEOPLE LOOKING AT IMPORTANT TOPICS'); for (const p of warm) L.push(`- ${p.name || p.email}: ${p.interests.join(', ')} (${p.email}${p.phone ? ', ' + p.phone : ''})`); L.push(''); }
  if (forms.length) { L.push('NEW SIGN-UPS'); for (const f of forms) L.push(`- ${f.form_id}: ${f.n}`); L.push(''); }
  if (rsvps.length) { L.push('NEW RSVPS'); for (const r of rsvps) L.push(`- ${r.event_slug}: ${r.n}`); L.push(''); }
  if (pending[0] && pending[0].n) L.push(`WAITING FOR YOUR APPROVAL: ${pending[0].n} (Mazal Tovs, notices, ideas)`, '');
  if (questions.length) { L.push('PEOPLE ASKED THE CHAT'); for (const x of questions) L.push(`- ${x.question.slice(0, 140)}`); L.push(''); }
  if (!L.length) return null;
  const n = visits[0] ? visits[0].n : 0;
  return { subject: `Website this morning: ${[leads.length && leads.length + ' requests', warm.length && warm.length + ' people to reach out to', forms.length && 'new sign-ups', rsvps.length && 'new RSVPs'].filter(Boolean).join(', ') || 'a short update'}`,
    text: [`Good morning! Yesterday ${n} people visited the website. Here is what may need you:`, '', ...L, `Everything, with Call / WhatsApp buttons: ${base}/admin/community`].join('\n') };
}
module.exports = { morningDigest };
