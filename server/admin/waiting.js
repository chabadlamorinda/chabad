'use strict';
// What is waiting for the Rabbi, counted the same way on the Rabbi's desk (the "Waiting for you" card) and on the
// Website community page (the counts in its sticky menu). Each entry: the section's short name (its #id on the
// community page), the API it reads, what one item is called, and how to count what waits.
window.WAITING = [
  { id: 'requests', path: '/site/leads', one: 'new request this week', many: 'new requests this week', count: function (x) { return (x.items || []).filter(function (i) { return Date.now() - new Date(i.created_at) < 7 * 864e5; }).length; } },
  { id: 'approve', path: '/site/submissions', one: 'submission to approve', many: 'submissions to approve', count: function (x) { return (x.items || []).filter(function (i) { return i.status === 'new' || i.status === 'pending'; }).length; } },
  { id: 'reach-out', path: '/site/outreach', one: 'person to reach out to', many: 'people to reach out to', count: function (x) { return (x.items || []).length; } },
  { id: 'sign-ups', path: '/site/forms', one: 'new sign-up', many: 'new sign-ups', count: function (x) { return (x.forms || []).reduce(function (a, f) { return a + (f.fresh || 0); }, 0); } },
  { id: 'visitors', path: '/site/visitors', one: 'visitor looking at an important topic', many: 'visitors looking at important topics', count: function (x) { return (x.items || []).filter(function (p) { return p.hot; }).length; } },
];
window.WAITING_BY_ID = {};
window.WAITING.forEach(function (w) { window.WAITING_BY_ID[w.id] = w.count; });
