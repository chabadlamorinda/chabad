// Fundraising campaign pages (content: site/content/campaigns.json; money side: server/campaign.js).
//   /campaign                 the campaign running now (or the giving page when none is)
//   /campaign/<slug>          the campaign: progress, countdown, giving form, levels, teams, story, donor wall, sharing
//   /campaign/<slug>/<team>   an ambassador's (team's) own page: same form, gifts credited to the team
//   /campaign/<slug>/thank-you
// A draft campaign can be previewed with ?preview=1 (never listed or indexed). While a campaign runs, campaignBanner()
// puts it at the very top of the home page. site.js fills in the live numbers ([data-campaign]) and runs the form.
'use strict';
const { esc, md } = require('./md.js');
const { shareBar } = require('./share.js');
const { isLive } = require('../campaign.js');

const DEFAULT_AMOUNTS = [36, 180, 360, 1000, 1800, 3600];
const money = (n) => '$' + Number(n).toLocaleString('en-US');
const live = (C) => (C.campaigns || []).filter((c) => isLive(c));
const amountsOf = (c) => (c.amounts && c.amounts.length ? c.amounts : DEFAULT_AMOUNTS);
const monthsOf = (c) => (c.months && c.months.length ? c.months : [12, 24, 36]);
const youtube = (u) => { const m = /(?:youtu\.be\/|v=|embed\/)([\w-]{11})/.exec(String(u || '')); return m ? m[1] : null; };

// The live numbers box (raised, goal, bar, donors, countdown); site.js fills it from /api/campaign/<slug>.
function progressBox(X, c, team) {
  const { t } = X, goal = team ? Number(team.goal) || 0 : Number(c.goal);
  return `<div class="cmp-progress" data-campaign="${esc(c.slug)}"${team ? ` data-team="${esc(team.slug)}"` : ''} data-goal="${goal}" data-bonus="${team ? '' : Number(c.bonusGoal) || ''}" data-end="${esc(c.endIso)}" data-start="${esc(c.startIso)}">
<p class="cmp-raised"><b data-c-raised>$0</b> <span>${esc(t('raised'))}${goal ? ` ${esc(t('of {goal}', { goal: money(goal) }))}` : ''}</span></p>
<div class="cmp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="${esc(t('Progress toward the goal'))}"><i data-c-bar></i></div>
<p class="cmp-stats"><span><b data-c-pct>0%</b> ${esc(t('of the goal'))}</span><span><b data-c-donors>0</b> <span data-c-donors-word data-one="${esc(t('donor'))}">${esc(t('donors'))}</span></span><span class="cmp-clock" data-c-clock hidden></span></p>
<p class="cmp-bonus hand" data-c-bonus hidden>${esc(t('We reached the goal! Now for the bonus goal of {goal}.', { goal: money(Number(c.bonusGoal) || 0) }))}</p>
</div>`;
}

function matchBadge(X, c) {
  const m = c.matching || {}, x = Number(m.multiplier) || 1;
  if (x <= 1) return '';
  return `<p class="cmp-match"><b>${esc(x === 2 ? X.t('Every gift is doubled!') : X.t('Every gift is multiplied ×{x}!', { x }))}</b>${m.text ? ' ' + esc(m.text) : ''}</p>`;
}

// The giving form: amount, one payment or monthly payments, level, team, name on the wall, dedication, message.
function giveForm(X, c, { team, amt, level }) {
  const { t, C } = X, amounts = amountsOf(c), pick = Number(amt) > 0 ? Number(amt) : amounts[1] || amounts[0], x = Number((c.matching || {}).multiplier) || 1;
  const teams = c.teams || [], levels = c.levels || [];
  return `<form class="card give cmp-give" id="give" data-campaign-give="${esc(c.slug)}" data-multiplier="${x}" novalidate>
<fieldset class="give-amts"><legend>${esc(t('Your gift'))}</legend>
<div class="chips">${amounts.map((a) => `<label class="chip pick"><input type="radio" name="amt" value="${a}"${a === pick ? ' checked' : ''}> ${esc(money(a))}</label>`).join('')}</div>
<label>${esc(t('Other amount ($)'))} <input type="number" name="other" min="1" max="250000" step="1" inputmode="decimal" value="${amounts.includes(pick) ? '' : esc(String(pick))}"></label></fieldset>
<fieldset class="radios cmp-plan"><legend>${esc(t('How would you like to pay?'))}</legend>
<label><input type="radio" name="months" value="1" checked> ${esc(t('One payment'))}</label>
${monthsOf(c).map((m) => `<label><input type="radio" name="months" value="${m}"> ${esc(t('{n} monthly payments', { n: m }))} <span class="muted" data-per="${m}"></span></label>`).join('')}
<p class="small muted">${esc(t('Spread a larger gift over time: your card is charged the same amount each month, and it stops by itself after the last payment. The whole gift counts toward the goal today.'))}</p></fieldset>
<p class="cmp-matchline hand" data-c-matchline hidden></p>
${levels.length ? `<label>${esc(t('Dedication opportunity (optional)'))} <select name="level"><option value="">${esc(t('None'))}</option>${levels.map((l) => `<option value="${esc(l.id)}" data-amount="${Number(l.amount)}"${l.id === level ? ' selected' : ''}>${esc(l.title)} · ${esc(money(l.amount))}</option>`).join('')}</select></label>` : ''}
${teams.length ? `<label>${esc(t('Credit my gift to a team (optional)'))} <select name="team"><option value="">${esc(t('No team'))}</option>${teams.map((x2) => `<option value="${esc(x2.slug)}"${team && team.slug === x2.slug ? ' selected' : ''}>${esc(x2.name)}</option>`).join('')}</select></label>` : ''}
<label>${esc(t('Your name, as it will appear on the donor wall'))} <input type="text" name="name" maxlength="60" autocomplete="name" placeholder="${esc(t('e.g. The Cohen Family'))}"></label>
<label class="check"><input type="checkbox" name="anonymous"> ${esc(t('Give anonymously (your name is not shown)'))}</label>
<label class="check"><input type="checkbox" name="hideAmount"> ${esc(t('Do not show the amount'))}</label>
<label>${esc(t('In honor or in memory of (optional)'))} <input type="text" name="dedication" maxlength="80" placeholder="${esc(t('e.g. In memory of Sarah bat Avraham'))}"></label>
<label>${esc(t('A message of encouragement (optional)'))} <input type="text" name="message" maxlength="140"></label>
<label class="check"><input type="checkbox" name="fee"> ${esc(t('Add 3.5% to cover the card processing fee'))}</label>
<p class="give-err msg err" role="alert" hidden></p>
<button type="submit" class="btn gold">${esc(t('Continue to secure payment'))}</button>
<p class="muted small">${esc(t('Secure payment by Stripe: card, Apple Pay or Google Pay. A receipt is emailed to you.'))} ${esc(C.org.legal || '')}</p>
</form>`;
}

function campaignHtml(X, c, { team = null, amt, level, base }) {
  const { t, C } = X, o = C.org, path = '/campaign/' + c.slug + (team ? '/' + team.slug : ''), vid = youtube(c.video);
  const digits = String(o.mobile || o.phone || '').replace(/\D/g, ''), tel = digits.length === 10 ? '1' + digits : digits;
  const amb = encodeURIComponent(t('Hi Rabbi Labkowski, I would like to help raise money for {campaign} with my own page.', { campaign: c.title }));
  const teams = c.teams || [], levels = c.levels || [], ended = c.endIso && Date.parse(c.endIso) < Date.now();
  return `<section class="cmp wrap sec narrow">
<div class="cmp-hero${c.image ? ' has-img' : ''}"${c.image ? ` style="--cmp-img:url('${esc(c.image)}')"` : ''}>
<p class="hand">${esc(team ? t('{name} is raising money for', { name: team.name }) : t('Our campaign'))}</p>
<h1>${esc(c.title)}</h1>${c.tagline ? `<p class="lead-d">${esc(c.tagline)}</p>` : ''}
</div>
${matchBadge(X, c)}
${progressBox(X, c, team)}
${team ? `<p class="small"><a href="/campaign/${esc(c.slug)}">${esc(t('See the whole campaign: {goal} goal', { goal: money(c.goal) }))}</a></p>` : ''}
${ended ? `<p class="msg">${esc(t('This campaign has ended. Thank you to everyone who gave! You can still give on our giving page.'))} <a href="/donate">${esc(t('Give now'))}</a></p>` : giveForm(X, c, { team, amt, level })}
${levels.length ? `<h2>${esc(t('Dedication opportunities'))}</h2><div class="cmp-levels">${levels.map((l) => `<a class="card cmp-level" href="?amt=${Number(l.amount)}&amp;level=${encodeURIComponent(l.id)}#give"><b>${esc(money(l.amount))}</b><strong>${esc(l.title)}</strong>${l.text ? `<span>${esc(l.text)}</span>` : ''}${Number(l.quantity) ? `<span class="small" data-left="${esc(l.id)}" data-quantity="${Number(l.quantity)}">${esc(t('{n} available', { n: Number(l.quantity) }))}</span>` : ''}</a>`).join('')}</div>` : ''}
${c.story ? `<h2>${esc(t('Why it matters'))}</h2><div class="cmp-story">${md(c.story)}</div>` : ''}
${vid ? `<div class="cmp-video"><iframe src="https://www.youtube-nocookie.com/embed/${vid}" title="${esc(c.title)}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>` : ''}
${teams.length ? `<h2>${esc(t('Teams'))}</h2><div class="cmp-teams">${teams.map((x) => `<a class="card cmp-team" href="/campaign/${esc(c.slug)}/${esc(x.slug)}" data-team-card="${esc(x.slug)}" data-goal="${Number(x.goal) || 0}"><strong>${esc(x.name)}</strong><span class="cmp-bar"><i></i></span><span class="small"><b data-team-raised>$0</b>${Number(x.goal) ? ' ' + esc(t('of {goal}', { goal: money(x.goal) })) : ''}</span></a>`).join('')}</div>` : ''}
<h2>${esc(t('Donor wall'))}</h2>
<div class="cmp-wall-tools"><input type="search" data-wall-search placeholder="${esc(t('Search names'))}" aria-label="${esc(t('Search names'))}"><select data-wall-sort aria-label="${esc(t('Sort'))}"><option value="recent">${esc(t('Most recent'))}</option><option value="largest">${esc(t('Largest'))}</option></select></div>
<ul class="cmp-wall" data-wall data-anon="${esc(t('Anonymous'))}" data-monthly="${esc(t('over {n} months'))}" data-team-word="${esc(t('Team'))}"><li class="muted">${esc(t('Be the first to give!'))}</li></ul>
${shareBar(X, base + X.path(path), c.title)}
<div class="card cmp-amb"><h2>${esc(t('Raise money with your friends'))}</h2><p>${esc(t('Become an ambassador: we will set up your own page with your own goal, so friends and family can give through you.'))}</p>
<p class="btns">${tel ? `<a class="btn ghost" href="https://wa.me/${tel}?text=${amb}" rel="noopener" target="_blank">WhatsApp</a><a class="btn ghost" href="sms:+${tel}?&amp;body=${amb}">${esc(t('Text message'))}</a>` : ''}<a class="btn ghost" href="mailto:${esc(o.email)}?subject=${encodeURIComponent(c.title)}&amp;body=${amb}">${esc(t('Email'))}</a></p></div>
<h2>${esc(t('Questions'))}</h2>
<details><summary>${esc(t('How do monthly payments work?'))}</summary><p>${esc(t('Choose 12, 24 or 36 monthly payments (or the options shown). The same amount is charged to your card each month, and the payments stop by themselves after the last one. Your whole gift counts toward the goal right away. Need to change something? Just call us.'))}</p></details>
<details><summary>${esc(t('Is my gift tax-deductible?'))}</summary><p>${esc(o.legal || t('Please call us for our tax details.'))} ${esc(t('A receipt is emailed to you right after you give.'))}</p></details>
<details><summary>${esc(t('Can I give by check, a donor-advised fund or stock?'))}</summary><p>${esc(t('Yes. Make a check payable to {name} and mail it to {address}, or call {phone} for donor-advised funds and other ways to give. We will add your gift to the campaign.', { name: o.name, address: [o.address.street, o.address.city, o.address.region, o.address.postal].filter(Boolean).join(', '), phone: o.phone }))}</p></details>
<details><summary>${esc(t('Is it safe to give online?'))}</summary><p>${esc(t('Yes. Payment happens on Stripe’s secure checkout page; your card details never touch our website.'))}</p></details>
${ended ? '' : `<a class="cmp-sticky btn gold" href="#give">${esc(t('Donate'))}</a>`}
</section>`;
}

// The top of the home page while a campaign runs (unless "featured": false): name, goal, live progress, quick gift buttons.
function campaignBanner(X) {
  const c = live(X.C).find((x) => x.featured !== false);
  if (!c) return '';
  const { t } = X, href = '/campaign/' + c.slug, quick = amountsOf(c).slice(0, 4);
  return `<section class="cmp-banner"${c.image ? ` style="--cmp-img:url('${esc(c.image)}')"` : ''}><div class="wrap">
<p class="hand">${esc(t('Our campaign'))}</p><h2><a href="${href}">${esc(c.title)}</a></h2>${c.tagline ? `<p>${esc(c.tagline)}</p>` : ''}
${matchBadge(X, c)}
${progressBox(X, c, null)}
<p class="btns cmp-quick">${quick.map((a) => `<a class="btn ghost" href="${href}?amt=${a}#give">${esc(money(a))}</a>`).join('')}<a class="btn gold" href="${href}#give">${esc(t('Donate'))}</a></p>
</div></section>`;
}

function mountCampaignPages(r, { render, wrap, ctxOf, base }) {
  r.get('/campaign', (req, res) => { const X = ctxOf(req), c = live(X.C)[0]; res.redirect(302, X.path(c ? '/campaign/' + c.slug : '/donate')); });
  const get = (X, req) => { const c = (X.C.campaigns || []).find((x) => x.slug === req.params.slug); return c && (c.status !== 'draft' || req.query.preview === '1') ? c : null; };
  r.get('/campaign/:slug/thank-you', wrap(async (req, res, next) => {
    const X = ctxOf(req), { t } = X, c = get(X, req); if (!c) return next();
    const team = (c.teams || []).find((x) => x.slug === req.query.team), path = '/campaign/' + c.slug + (team ? '/' + team.slug : '');
    const sid = /^cs_[A-Za-z0-9_]{6,200}$/.test(String(req.query.session_id || '')) ? req.query.session_id : '';
    const body = `<section class="wrap sec narrow cmp"><p class="hand">${esc(t('Thank you!'))}</p><h1>${esc(t('Your gift to {campaign} was received', { campaign: c.title }))}</h1>
<p class="lead-d">${esc(t('A receipt has been emailed to you. May G-d bless you and your family with health, happiness and success.'))}</p>
${progressBox(X, c, team)}<span hidden data-campaign-confirm="${esc(sid)}"></span>
<h2>${esc(t('Double your impact: share it'))}</h2><p>${esc(t('Most gifts come from a friend asking a friend. Send the campaign to a few people who care.'))}</p>
${shareBar(X, base + X.path(path), c.title)}
<p class="btns"><a class="btn ghost" href="${path}">${esc(t('Back to the campaign'))}</a><a class="btn ghost" href="/">${esc(t('Back to the home page'))}</a></p></section>`;
    await render(res, { path: path + '/thank-you', title: t('Thank you!'), description: c.tagline || c.title, body, noindex: true });
  }));
  r.get(['/campaign/:slug', '/campaign/:slug/:team'], wrap(async (req, res, next) => {
    const X = ctxOf(req), c = get(X, req); if (!c) return next();
    const team = req.params.team ? (c.teams || []).find((x) => x.slug === req.params.team) : null;
    if (req.params.team && !team) return next();
    const body = campaignHtml(X, c, { team, amt: req.query.amt, level: req.query.level, base });
    await render(res, { path: '/campaign/' + c.slug + (team ? '/' + team.slug : ''), title: team ? `${team.name}: ${c.title}` : c.title, description: c.tagline || c.title, body, image: c.image || undefined, noindex: c.status === 'draft' || !!req.query.amt });
  }));
}

module.exports = { mountCampaignPages, campaignBanner, campaignHtml };
