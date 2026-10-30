// Fundraising campaign pages (content: site/content/campaigns.json; money side: server/campaign.js).
//   /campaign                       the campaign running now (or the giving page when none is)
//   /campaign/<slug>                the campaign: hero with live progress and countdown, matching, giving form (online now,
//                                   or monthly / yearly payments, or pledge now and pay later), naming opportunities,
//                                   the story and pictures, ambassadors' leaderboard, donor wall, sharing, questions
//   /campaign/<slug>/join           open your own ambassador page (live at once)
//   /campaign/<slug>/<team>         an ambassador's (team's) page: their words and goal; gifts are credited to them
//   /campaign/<slug>/<team>/edit    the ambassador changes their goal and words (private link)
//   /campaign/<slug>/thank-you
// A draft campaign can be previewed with ?preview=1 (never listed or indexed). While a campaign runs, campaignBar() is a
// slim bar at the top of every page and campaignBanner() leads the home page. site.js fills in the live numbers
// ([data-campaign]) and runs the forms.
'use strict';
const { esc, md } = require('./md.js');
const { shareBar } = require('./share.js');
const { isLive, hasEnded, plansOf, teamsOf, ambassadors } = require('../campaign.js');

const DEFAULT_AMOUNTS = [180, 360, 1000, 1800, 3600, 10000];
const money = (n) => '$' + Number(n).toLocaleString('en-US');
const live = (C) => (C.campaigns || []).filter((c) => isLive(c));
const amountsOf = (c) => (c.amounts && c.amounts.length ? c.amounts : DEFAULT_AMOUNTS);
const youtube = (u) => { const m = /(?:youtu\.be\/|v=|embed\/)([\w-]{11})/.exec(String(u || '')); return m ? m[1] : null; };
const initials = (s) => String(s || '').split(/\s+/).filter((w) => /^\p{L}/u.test(w) && !/^(the|family|and|&)$/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '♥';
const bg = (c) => (c.image ? ` style="--cmp-img:url('${esc(c.image)}')"` : '');

// The live numbers (raised, goal, gold bar with milestones, donors, days left); site.js fills it from /api/campaign/<slug>.
function meter(X, c, team, cls = '') {
  const { t } = X, goal = team ? Number(team.goal) || 0 : Number(c.goal), x = Number((c.matching || {}).multiplier) || 1;
  return `<div class="cmp-meter ${cls}" data-campaign="${esc(c.slug)}"${team ? ` data-team="${esc(team.slug)}"` : ''} data-goal="${goal}" data-bonus="${team ? '' : Number(c.bonusGoal) || ''}" data-end="${esc(c.endIso)}" data-start="${esc(c.startIso)}">
<p class="cmp-raised"><b data-c-raised>$0</b><span>${esc(t('raised'))}${goal ? ` ${esc(t('of {goal}', { goal: money(goal) }))}` : ''}</span></p>
<div class="cmp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="${esc(t('Progress toward the goal'))}"><i data-c-bar></i><s style="left:25%"></s><s style="left:50%"></s><s style="left:75%"></s></div>
<div class="cmp-stats">
<p><b data-c-pct>0%</b><span>${esc(t('of the goal'))}</span></p>
<p><b data-c-donors>0</b><span data-c-donors-word data-one="${esc(t('donor'))}">${esc(t('donors'))}</span></p>
<p><b data-c-days>–</b><span data-c-days-word data-one="${esc(t('day left'))}" data-many="${esc(t('days left'))}" data-hours="${esc(t('hours left'))}" data-soon="${esc(t('days to go'))}" data-over="${esc(t('ended'))}">${esc(t('days left'))}</span></p>
${x > 1 ? `<p><b>×${x}</b><span>${esc(t('matching'))}</span></p>` : ''}
</div>
<p class="cmp-pledged small" data-c-pledged hidden data-text="${esc(t('plus {amount} pledged'))}"></p>
<p class="cmp-bonus" data-c-bonus hidden>${esc(t('We reached the goal! Now for the bonus goal of {goal}.', { goal: money(Number(c.bonusGoal) || 0) }))}</p>
</div>`;
}

function matchBand(X, c) {
  const m = c.matching || {}, x = Number(m.multiplier) || 1, { t } = X;
  if (x <= 1) return '';
  return `<section class="cmp-match"><div class="wrap"><p class="cmp-match-h">${esc(x === 2 ? t('Every gift is doubled!') : t('Every gift is multiplied ×{x}!', { x }))}</p>${m.text ? `<p>${esc(m.text)}</p>` : ''}
${(m.matchers || []).length ? `<p class="cmp-matchers"><span>${esc(t('Our matchers'))}</span>${m.matchers.map((n) => `<b>${esc(n)}</b>`).join('')}</p>` : ''}</div></section>`;
}

// The giving form: amount; online now (one payment, monthly or yearly payments) or pledge now and pay later; naming
// opportunity, ambassador, name on the donor wall, dedication, message, fee.
function giveForm(X, c, { teams, team, amt, level }) {
  const { t, C } = X, amounts = amountsOf(c), pick = Number(amt) > 0 ? Number(amt) : amounts[1] || amounts[0], x = Number((c.matching || {}).multiplier) || 1;
  const levels = c.levels || [], plans = plansOf(c), months = plans.filter((p) => /^month-/.test(p)), years = plans.filter((p) => /^year-/.test(p));
  const planLabel = (p) => { const [iv, n] = p.split('-'); return iv === 'year' ? t('{n} yearly payments', { n }) : t('{n} monthly payments', { n }); };
  return `<form class="cmp-give" id="give" data-campaign-give="${esc(c.slug)}" data-multiplier="${x}" novalidate>
<h2>${esc(t('Make your gift'))}</h2>
<fieldset class="give-amts"><legend class="sr-only">${esc(t('Your gift'))}</legend>
<div class="cmp-amts">${amounts.map((a) => `<label><input type="radio" name="amt" value="${a}"${a === pick ? ' checked' : ''}><span>${esc(money(a))}</span></label>`).join('')}</div>
<label class="cmp-other">${esc(t('Other amount ($)'))} <input type="number" name="other" min="1" step="1" inputmode="decimal" value="${amounts.includes(pick) ? '' : esc(String(pick))}"></label></fieldset>
<p class="cmp-matchline" data-c-matchline hidden></p>
<fieldset class="cmp-way"><legend>${esc(t('How would you like to give?'))}</legend>
<label class="cmp-opt"><input type="radio" name="way" value="online" checked><span><b>${esc(t('Give online now'))}</b><small>${esc(t('Card, Apple Pay, Google Pay and the other ways shown on the secure payment page.'))}</small></span></label>
<label class="cmp-opt"><input type="radio" name="way" value="pledge"><span><b>${esc(t('Pledge now, pay later'))}</b><small>${esc(t('By check, wire transfer, stock or a donor-advised fund. We will be in touch.'))}</small></span></label>
</fieldset>
<fieldset class="cmp-plan" data-online><legend>${esc(t('Pay all at once, or spread it out'))}</legend>
<label class="cmp-opt"><input type="radio" name="plan" value="once" checked><span><b>${esc(t('One payment'))}</b></span></label>
${months.length ? `<label class="cmp-opt"><input type="radio" name="plan" value="${months[0]}" data-group="month"><span><b>${esc(t('Monthly payments'))}</b><small data-per-label></small></span><select name="monthPlan" aria-label="${esc(t('How many months?'))}">${months.map((p) => `<option value="${p}">${esc(planLabel(p))}</option>`).join('')}</select></label>` : ''}
${years.length ? `<label class="cmp-opt"><input type="radio" name="plan" value="${years[0]}" data-group="year"><span><b>${esc(t('Yearly payments'))}</b><small data-per-label></small></span><select name="yearPlan" aria-label="${esc(t('How many years?'))}">${years.map((p) => `<option value="${p}">${esc(planLabel(p))}</option>`).join('')}</select></label>` : ''}
<p class="small muted">${esc(t('The same amount is charged each month or year, and it stops by itself after the last payment. Your whole gift counts toward the goal today.'))}</p></fieldset>
<div class="cmp-pledge" data-pledge hidden>
<label>${esc(t('Your full name'))} <input type="text" name="fullName" maxlength="100" autocomplete="name"></label>
<label>${esc(t('Email'))} <input type="email" name="email" maxlength="254" autocomplete="email"></label>
<label>${esc(t('Phone (optional)'))} <input type="tel" name="phone" maxlength="30" autocomplete="tel"></label>
<label>${esc(t('How will you pay?'))} <select name="how"><option value="check">${esc(t('Check'))}</option><option value="wire">${esc(t('Wire transfer'))}</option><option value="stock">${esc(t('Stock'))}</option><option value="daf">${esc(t('Donor-advised fund'))}</option><option value="other">${esc(t('Other'))}</option></select></label>
</div>
${levels.length ? `<label>${esc(t('Naming opportunity (optional)'))} <select name="level"><option value="">${esc(t('None'))}</option>${levels.map((l) => `<option value="${esc(l.id)}" data-amount="${Number(l.amount)}"${l.id === level ? ' selected' : ''}>${esc(l.title)} · ${esc(money(l.amount))}</option>`).join('')}</select></label>` : ''}
${teams.length ? `<label>${esc(t('Give through an ambassador (optional)'))} <select name="team"><option value="">${esc(t('No one in particular'))}</option>${teams.map((x2) => `<option value="${esc(x2.slug)}"${team && team.slug === x2.slug ? ' selected' : ''}>${esc(x2.name)}</option>`).join('')}</select></label>` : ''}
<label>${esc(t('Your name, as it will appear on the donor wall'))} <input type="text" name="name" maxlength="60" placeholder="${esc(t('e.g. The Cohen Family'))}"></label>
<label class="check"><input type="checkbox" name="anonymous"> ${esc(t('Give anonymously (your name is not shown)'))}</label>
<label class="check"><input type="checkbox" name="hideAmount"> ${esc(t('Do not show the amount'))}</label>
<label>${esc(t('In honor or in memory of (optional)'))} <input type="text" name="dedication" maxlength="80" placeholder="${esc(t('e.g. In memory of Sarah bat Avraham'))}"></label>
<label>${esc(t('A message of encouragement (optional)'))} <input type="text" name="message" maxlength="140"></label>
<label class="check" data-online><input type="checkbox" name="fee"> ${esc(t('Add 3.5% to cover the card processing fee'))}</label>
<p class="give-err msg err" role="alert" hidden></p>
<p class="msg ok" data-pledge-done hidden></p>
<button type="submit" class="btn gold cmp-submit" data-online-label="${esc(t('Continue to secure payment'))}" data-pledge-label="${esc(t('Send my pledge'))}">${esc(t('Continue to secure payment'))}</button>
<ul class="cmp-trust"><li>${esc(t('Secure payment by Stripe'))}</li><li>${esc(t('Receipt by email'))}</li>${C.org.legal ? `<li>${esc(C.org.legal)}</li>` : ''}</ul>
</form>`;
}

// Open your own ambassador page.
function joinForm(X, c, { compact } = {}) {
  const { t } = X, g = Number(c.ambassadorGoal) || 1800;
  return `<form class="cmp-join${compact ? '' : ' card'}" data-ambassador="${esc(c.slug)}" novalidate>
${compact ? '' : `<p>${esc(t('Ambassadors make campaigns succeed. Your page is ready in a minute: share it with family and friends, and watch your own goal fill up.'))}</p>`}
<label>${esc(t('Name for your page'))} <input type="text" name="name" maxlength="60" required placeholder="${esc(t('e.g. The Cohen Family'))}"></label>
<label>${esc(t('Your goal ($)'))} <input type="number" name="goal" min="100" step="1" value="${g}" inputmode="numeric"></label>
<label>${esc(t('Why this matters to you (shown on your page)'))} <textarea name="message" rows="3" maxlength="400"></textarea></label>
<label>${esc(t('Email (we send you your link; never shown)'))} <input type="email" name="email" maxlength="254" required autocomplete="email"></label>
<label>${esc(t('Phone (optional, never shown)'))} <input type="tel" name="phone" maxlength="30" autocomplete="tel"></label>
<p class="give-err msg err" role="alert" hidden></p>
<button type="submit" class="btn gold">${esc(t('Create my page'))}</button>
</form>`;
}

function campaignHtml(X, c, { teams, team = null, amt, level, base, welcome = '' }) {
  const { t, C } = X, o = C.org, path = '/campaign/' + c.slug + (team ? '/' + team.slug : ''), vid = youtube(c.video);
  const levels = (c.levels || []).slice().sort((a, b) => b.amount - a.amount), ended = hasEnded(c), gallery = (c.gallery || []).filter((g) => /^\/media\//.test(g.src || g));
  const nav = [['give', t('Give')], c.story && ['story', t('The story')], levels.length && ['naming', t('Naming opportunities')], c.ambassadors !== false && ['ambassadors', t('Ambassadors')], ['donors', t('Donors')]].filter(Boolean);
  return `<div class="cmp">
<header class="cmp-hero${c.image ? ' has-img' : ''}"${bg(c)}><div class="wrap">
<p class="cmp-eyebrow">${esc(team ? t('{name} is raising money for', { name: team.name }) : c.eyebrow || t('Our campaign'))}</p>
<h1 class="cmp-title">${esc(c.title)}</h1>${c.tagline ? `<p class="cmp-tag">${esc(c.tagline)}</p>` : ''}
${team && team.message ? `<blockquote class="cmp-quote">${esc(team.message)}<cite>${esc(team.name)}</cite></blockquote>` : ''}
${meter(X, c, team, 'on-dark')}
${ended ? '' : `<p class="cmp-ctas"><a class="btn gold" href="#give">${esc(t('Donate now'))}</a>${c.ambassadors !== false ? `<a class="btn ghost-light" href="#ambassadors">${esc(t('Become an ambassador'))}</a>` : ''}</p>`}
</div></header>
${matchBand(X, c)}
${welcome ? `<div class="wrap"><div class="card cmp-welcome"><p class="cmp-eyebrow">${esc(t('Mazal tov!'))}</p><h2>${esc(t('Your page is ready'))}</h2><p>${esc(t('Share it with family and friends below. To change your goal or words later, use your private link (we also emailed it to you):'))}</p><p><a href="${esc(path)}/edit?k=${esc(welcome)}">${esc(t('Change my page'))}</a></p></div></div>` : ''}
${team ? `<div class="wrap"><div class="cmp-parent">${meter(X, c, null, 'mini')}<a href="/campaign/${esc(c.slug)}">${esc(t('See the whole campaign'))} →</a></div></div>` : ''}
<nav class="cmp-nav" aria-label="${esc(c.title)}"><div class="wrap">${nav.map(([id, label]) => `<a href="#${id}">${esc(label)}</a>`).join('')}</div></nav>
<div class="wrap cmp-grid">
<div class="cmp-main">
${c.story ? `<section id="story" class="cmp-sec"><h2>${esc(t('The story'))}</h2><div class="cmp-story">${md(c.story)}</div>
${vid ? `<div class="cmp-video"><iframe src="https://www.youtube-nocookie.com/embed/${vid}" title="${esc(c.title)}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>` : ''}
${gallery.length ? `<div class="cmp-gallery">${gallery.map((g) => `<figure><img src="${esc(g.src || g)}" alt="${esc(g.caption || '')}" loading="lazy">${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}</figure>`).join('')}</div>` : ''}</section>` : ''}
${levels.length ? `<section id="naming" class="cmp-sec"><h2>${esc(t('Naming opportunities'))}</h2><p class="muted">${esc(t('Dedicate a part of the building in honor or in memory of someone dear, for generations to come.'))}</p>
<div class="cmp-levels">${levels.map((l) => `<div class="cmp-level"><p class="cmp-level-amt">${esc(money(l.amount))}</p><h3>${esc(l.title)}</h3>${l.text ? `<p>${esc(l.text)}</p>` : ''}${Number(l.quantity) ? `<p class="cmp-left" data-left="${esc(l.id)}" data-quantity="${Number(l.quantity)}">${esc(t('{n} available', { n: Number(l.quantity) }))}</p>` : ''}${ended ? '' : `<a class="btn ghost sm" href="?amt=${Number(l.amount)}&amp;level=${encodeURIComponent(l.id)}#give">${esc(t('Dedicate this'))}</a>`}</div>`).join('')}</div></section>` : ''}
${c.ambassadors !== false ? `<section id="ambassadors" class="cmp-sec"><h2>${esc(t('Ambassadors'))}</h2>
${teams.length ? `<ol class="cmp-board">${teams.map((x) => `<li data-team-card="${esc(x.slug)}" data-goal="${Number(x.goal) || 0}"><a href="/campaign/${esc(c.slug)}/${esc(x.slug)}"><span class="cmp-av" aria-hidden="true">${esc(initials(x.name))}</span><span class="cmp-bd"><b>${esc(x.name)}</b><span class="cmp-bar"><i></i></span><small><span data-team-raised>$0</span>${Number(x.goal) ? ' ' + esc(t('of {goal}', { goal: money(x.goal) })) : ''}</small></span></a></li>`).join('')}</ol>` : `<p class="muted">${esc(t('Be the first ambassador!'))}</p>`}
${ended ? '' : `<details class="cmp-join-box"${teams.length ? '' : ' open'}><summary class="btn gold">${esc(t('Open your own page'))}</summary><p>${esc(t('Ambassadors make campaigns succeed. Your page is ready in a minute: share it with family and friends, and watch your own goal fill up.'))}</p>${joinForm(X, c, { compact: true })}</details>`}</section>` : ''}
<section id="donors" class="cmp-sec"><h2>${esc(t('Donor wall'))}</h2>
<div class="cmp-wall-tools"><input type="search" data-wall-search placeholder="${esc(t('Search names'))}" aria-label="${esc(t('Search names'))}"><select data-wall-sort aria-label="${esc(t('Sort'))}"><option value="recent">${esc(t('Most recent'))}</option><option value="largest">${esc(t('Largest'))}</option></select></div>
<ul class="cmp-wall" data-wall data-anon="${esc(t('Anonymous'))}" data-months="${esc(t('over {n} months'))}" data-years="${esc(t('over {n} years'))}"><li class="muted">${esc(t('Be the first to give!'))}</li></ul>
<p class="btns"><button type="button" class="btn ghost sm" data-wall-more hidden>${esc(t('Show more'))}</button></p></section>
${shareBar(X, base + X.path(path), c.title)}
<section class="cmp-sec cmp-faq"><h2>${esc(t('Questions'))}</h2>
<details><summary>${esc(t('How do monthly or yearly payments work?'))}</summary><p>${esc(t('Choose how many payments; the same amount is charged each month or each year, and the payments stop by themselves after the last one. Your whole gift counts toward the goal right away. Need to change something? Just call us.'))}</p></details>
<details><summary>${esc(t('Can I give by check, wire transfer, stock or a donor-advised fund?'))}</summary><p>${esc(t('Yes. Choose "Pledge now, pay later" and we will be in touch with the details. Checks are payable to {name} and mailed to {address}. Questions? Call {phone}.', { name: o.name, address: [o.address.street, o.address.city, o.address.region, o.address.postal].filter(Boolean).join(', '), phone: o.phone }))}</p></details>
<details><summary>${esc(t('Is my gift tax-deductible?'))}</summary><p>${esc(o.legal || t('Please call us for our tax details.'))} ${esc(t('A receipt is emailed to you right after you give.'))}</p></details>
<details><summary>${esc(t('Is it safe to give online?'))}</summary><p>${esc(t('Yes. Payment happens on Stripe’s secure checkout page; your card details never touch our website.'))}</p></details>
<details><summary>${esc(t('What does an ambassador do?'))}</summary><p>${esc(t('An ambassador opens their own page with their own goal and shares it with family and friends. Every gift through the page counts toward both the ambassador’s goal and the campaign.'))}</p></details>
</section>
</div>
<aside class="cmp-side">${ended ? `<div class="card"><p>${esc(t('This campaign has ended. Thank you to everyone who gave! You can still give on our giving page.'))}</p><p><a class="btn gold" href="/donate">${esc(t('Give now'))}</a></p></div>` : giveForm(X, c, { teams, team, amt, level })}</aside>
</div>
${ended ? '' : `<a class="cmp-sticky btn gold" href="#give">${esc(t('Donate now'))}</a>`}
</div>`;
}

// The slim bar at the top of every page while a campaign runs (not on the campaign's own pages).
function campaignBar(C, t, path) {
  const c = live(C).find((x) => x.featured !== false);
  if (!c || /^\/campaign(\/|$)/.test(path || '')) return '';
  return `<a class="cmp-topbar" href="/campaign/${esc(c.slug)}"><span class="wrap"><b>${esc(c.title)}</b><span class="cmp-topbar-m" data-campaign="${esc(c.slug)}" data-goal="${Number(c.goal)}" data-start="${esc(c.startIso)}" data-end="${esc(c.endIso)}"><span class="cmp-bar"><i data-c-bar></i></span><span><span data-c-raised>$0</span> / ${esc(money(c.goal))}</span></span><span class="cmp-topbar-go">${esc(t('Donate'))}</span></span></a>`;
}

// The top of the home page while a campaign runs (unless "featured": false): name, goal, live progress, quick gift buttons.
function campaignBanner(X) {
  const c = live(X.C).find((x) => x.featured !== false);
  if (!c) return '';
  const { t } = X, href = '/campaign/' + c.slug, quick = amountsOf(c).slice(0, 4);
  return `<section class="cmp-hero cmp-home${c.image ? ' has-img' : ''}"${bg(c)}><div class="wrap">
<p class="cmp-eyebrow">${esc(c.eyebrow || t('Our campaign'))}</p><h2 class="cmp-title"><a href="${href}">${esc(c.title)}</a></h2>${c.tagline ? `<p class="cmp-tag">${esc(c.tagline)}</p>` : ''}
${meter(X, c, null, 'on-dark')}
<p class="cmp-ctas cmp-quick">${quick.map((a) => `<a class="btn ghost-light" href="${href}?amt=${a}#give">${esc(money(a))}</a>`).join('')}<a class="btn gold" href="${href}#give">${esc(t('Donate now'))}</a></p>
</div></section>`;
}

function mountCampaignPages(r, { render, wrap, ctxOf, base, store }) {
  r.get('/campaign', (req, res) => { const X = ctxOf(req), c = live(X.C)[0]; res.redirect(302, X.path(c ? '/campaign/' + c.slug : '/donate')); });
  const get = (X, req) => { const c = (X.C.campaigns || []).find((x) => x.slug === req.params.slug); return c && (c.status !== 'draft' || req.query.preview === '1') ? c : null; };
  r.get('/campaign/:slug/thank-you', wrap(async (req, res, next) => {
    const X = ctxOf(req), { t } = X, c = get(X, req); if (!c) return next();
    const team = (await teamsOf(store, c)).find((x) => x.slug === req.query.team), path = '/campaign/' + c.slug + (team ? '/' + team.slug : '');
    const sid = /^cs_[A-Za-z0-9_]{6,200}$/.test(String(req.query.session_id || '')) ? req.query.session_id : '';
    const body = `<div class="cmp"><header class="cmp-hero${c.image ? ' has-img' : ''}"${bg(c)}><div class="wrap"><p class="cmp-eyebrow">${esc(t('Thank you!'))}</p><h1 class="cmp-title">${esc(t('Your gift to {campaign} was received', { campaign: c.title }))}</h1>
<p class="cmp-tag">${esc(t('A receipt has been emailed to you. May G-d bless you and your family with health, happiness and success.'))}</p>${meter(X, c, team, 'on-dark')}</div></header>
<section class="wrap sec narrow"><span hidden data-campaign-confirm="${esc(sid)}"></span>
<h2>${esc(t('Double your impact: share it'))}</h2><p>${esc(t('Most gifts come from a friend asking a friend. Send the campaign to a few people who care.'))}</p>
${shareBar(X, base + X.path(path), c.title)}
<p class="btns"><a class="btn ghost" href="${path}">${esc(t('Back to the campaign'))}</a>${c.ambassadors !== false ? `<a class="btn ghost" href="/campaign/${esc(c.slug)}/join">${esc(t('Become an ambassador'))}</a>` : ''}</p></section></div>`;
    await render(res, { path: path + '/thank-you', title: t('Thank you!'), description: c.tagline || c.title, body, noindex: true });
  }));
  r.get('/campaign/:slug/:team/edit', wrap(async (req, res, next) => {
    const X = ctxOf(req), { t } = X, c = get(X, req); if (!c) return next();
    const me = (await ambassadors(store, c.slug)).find((x) => x.slug === req.params.team && x.token === String(req.query.k || ''));
    const body = me ? `<section class="wrap sec narrow"><h1>${esc(t('Change my page'))}</h1><form class="card cmp-join" data-ambassador-edit="${esc(c.slug)}" data-team="${esc(me.slug)}" data-k="${esc(me.token)}" novalidate>
<label>${esc(t('Name for your page'))} <input type="text" name="name" maxlength="60" value="${esc(me.name)}"></label>
<label>${esc(t('Your goal ($)'))} <input type="number" name="goal" min="100" step="1" value="${Number(me.goal)}"></label>
<label>${esc(t('Why this matters to you (shown on your page)'))} <textarea name="message" rows="4" maxlength="400">${esc(me.message || '')}</textarea></label>
<p class="give-err msg err" role="alert" hidden></p><p class="btns"><button type="submit" class="btn gold">${esc(t('Save'))}</button><a class="btn ghost" href="/campaign/${esc(c.slug)}/${esc(me.slug)}">${esc(t('See my page'))}</a></p></form></section>`
      : `<section class="wrap sec narrow"><h1>${esc(t('This link is not valid.'))}</h1><p><a href="/campaign/${esc(c.slug)}">${esc(c.title)}</a></p></section>`;
    await render(res, { path: '/campaign/' + c.slug + '/' + req.params.team + '/edit', title: t('Change my page'), description: c.title, body, noindex: true });
  }));
  r.get('/campaign/:slug/join', wrap(async (req, res, next) => {
    const X = ctxOf(req), { t } = X, c = get(X, req); if (!c || c.ambassadors === false) return next();
    const body = `<section class="wrap sec narrow"><p class="hand">${esc(c.title)}</p><h1>${esc(t('Become an ambassador'))}</h1>${hasEnded(c) ? `<p>${esc(t('This campaign has ended. Thank you to everyone who gave! You can still give on our giving page.'))}</p>` : joinForm(X, c)}</section>`;
    await render(res, { path: '/campaign/' + c.slug + '/join', title: t('Become an ambassador') + ': ' + c.title, description: c.tagline || c.title, body, noindex: c.status === 'draft' });
  }));
  r.get(['/campaign/:slug', '/campaign/:slug/:team'], wrap(async (req, res, next) => {
    const X = ctxOf(req), c = get(X, req); if (!c) return next();
    const teams = await teamsOf(store, c), team = req.params.team ? teams.find((x) => x.slug === req.params.team) : null;
    if (req.params.team && !team) return next();
    const k = String(req.query.k || ''), welcome = team && req.query.welcome === '1' && (await ambassadors(store, c.slug)).some((x) => x.slug === team.slug && x.token === k) ? k : '';
    const body = campaignHtml(X, c, { teams, team, amt: req.query.amt, level: req.query.level, base, welcome });
    await render(res, { path: '/campaign/' + c.slug + (team ? '/' + team.slug : ''), title: team ? `${team.name}: ${c.title}` : c.title, description: c.tagline || c.title, body, image: c.image || undefined, noindex: c.status === 'draft' || !!req.query.amt || !!welcome });
  }));
}

module.exports = { mountCampaignPages, campaignBanner, campaignBar, campaignHtml };
