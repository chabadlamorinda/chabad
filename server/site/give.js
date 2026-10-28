// Giving on the website itself: the form on /donate (once or monthly, any fund, in honor or memory), the Chai Club
// page (/chai-club: monthly partners and the honor board) and the thank-you page. Paying happens on Stripe's secure
// checkout page (POST /api/give/checkout in server/index.js), so card numbers never touch this site.
'use strict';
const { esc } = require('./md.js');

// Links that open the giving form already filled in (sponsor pages, forms with "Pay now", yahrzeits...).
const giveUrl = (fund, amt, ded) => {
  const q = new URLSearchParams({ fund: fund || 'general' });
  if (amt) q.set('amt', String(amt));
  if (ded) q.set('ded', String(ded).slice(0, 80));
  return '/donate?' + q.toString() + '#give';
};
const CLUB = [['bronze', 72, 'Bronze'], ['silver', 180, 'Silver'], ['gold', 360, 'Gold'], ['platinum', 720, 'Platinum']];
const money = (n) => '$' + Number(n).toLocaleString('en-US');
// The Chai Club medal (the same design as the app's honor board, board/board.js), drawn here so it is part of the page.
const MEDAL = { platinum: ['#ffffff', '#9fc0e3', '#3f6490', '#d6e8fa'], gold: ['#fff0b8', '#e0b046', '#a06f24', '#f6d98a'], silver: ['#ffffff', '#cfd3d8', '#8a9099', '#f2f3f5'], bronze: ['#f3c9a0', '#c98a55', '#8a5427', '#ecb98a'] };
let medalN = 0;
function medal(level, size = 48) {
  const c = MEDAL[level] || MEDAL.bronze, id = 'md' + (++medalN);
  return `<svg class="medal" viewBox="0 0 80 100" width="${size}" height="${Math.round(size * 1.25)}" aria-hidden="true" focusable="false"><defs><radialGradient id="${id}g" cx="35%" cy="30%" r="85%"><stop offset="0" stop-color="${c[0]}"/><stop offset=".45" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></radialGradient><linearGradient id="${id}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a5a9e"/><stop offset="1" stop-color="#173766"/></linearGradient></defs>`
    + `<path d="M22 2h14l10 36-10 6L22 2z" fill="url(#${id}r)"/><path d="M58 2H44L34 38l10 6L58 2z" fill="url(#${id}r)" opacity=".88"/><circle cx="40" cy="62" r="31" fill="url(#${id}g)" stroke="${c[2]}" stroke-width="1.2"/>`
    + `<circle cx="40" cy="62" r="25.5" fill="none" stroke="${c[3]}" stroke-width="1.1" stroke-dasharray="1.6 2.2"/><circle cx="40" cy="62" r="22" fill="none" stroke="${c[2]}" stroke-width=".8" opacity=".6"/>`
    + `<text x="40" y="70.5" text-anchor="middle" font-family="'Frank Ruhl Libre',Georgia,serif" font-weight="700" font-size="26" fill="${c[2]}" stroke="${c[3]}" stroke-width=".35">חי</text><path d="M22 48c6-9 18-12 28-8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".45"/></svg>`;
}

// The giving form. opts: { fund, amt, ded, freq, club, back }
function giveForm(X, opts = {}) {
  const { t, C } = X, G = C.giving || {}, club = !!opts.club;
  const funds = (G.funds || []).filter((f) => f.id !== 'chai' || !club);
  const amounts = club ? CLUB.map((c) => c[1]) : (G.amounts || [180, 360, 1000, 1800]);
  const amt = Number(opts.amt) > 0 ? Number(opts.amt) : (club ? 180 : amounts[1] || amounts[0]);
  const preset = amounts.includes(amt);
  const label = (a) => (club ? `${t(CLUB.find((c) => c[1] === a)[2])} · ${money(a)}` : money(a)), lvl = (a) => CLUB.find((c) => c[1] === a)[0];
  return `<form class="card give" id="give" data-give data-back="${esc(opts.back || '/donate')}" novalidate>
${club ? '<input type="hidden" name="fund" value="chai"><input type="hidden" name="freq" value="monthly">' : `<fieldset class="radios give-freq"><legend>${esc(t('How often?'))}</legend>
<label><input type="radio" name="freq" value="once"${opts.freq === 'monthly' ? '' : ' checked'}> ${esc(t('Once'))}</label><label><input type="radio" name="freq" value="monthly"${opts.freq === 'monthly' ? ' checked' : ''}> ${esc(t('Every month'))}</label></fieldset>`}
<fieldset class="give-amts"><legend>${esc(club ? t('Your monthly gift') : t('Amount'))}</legend>
<div class="chips">${amounts.map((a) => `<label class="chip pick${club ? ' with-medal' : ''}"><input type="radio" name="amt" value="${a}"${preset && a === amt ? ' checked' : ''}>${club ? medal(lvl(a), 20) : ''} ${esc(label(a))}</label>`).join('')}</div>
<label>${esc(t('Other amount ($)'))} <input type="number" name="other" min="1" max="10000" step="1" inputmode="decimal" value="${preset ? '' : esc(String(amt))}"></label></fieldset>
${club ? '' : `<label>${esc(t('Where should it go?'))} <select name="fund">${funds.map((f) => `<option value="${esc(f.id)}"${f.id === (opts.fund || 'general') ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>`}
<label>${esc(t('In honor or in memory of (optional)'))} <input type="text" name="dedication" maxlength="80" value="${esc(opts.ded || '')}" placeholder="${esc(t('e.g. In memory of Sarah bat Avraham'))}"></label>
${club ? `<label class="check"><input type="checkbox" name="show" checked> ${esc(t('Show our name on the Chai Club board (amounts are never shown)'))}</label>
<label>${esc(t('Name for the board'))} <input type="text" name="boardName" maxlength="60" autocomplete="name" placeholder="${esc(t('e.g. The Cohen Family'))}"></label>` : ''}
<label class="check"><input type="checkbox" name="fee"> ${esc(t('Add 3.5% to cover the card processing fee'))}</label>
<p class="give-err msg err" role="alert" hidden></p>
<button type="submit" class="btn gold">${esc(t('Continue to secure payment'))}</button>
<p class="muted small">${esc(t('Secure payment by Stripe: card, Apple Pay or Google Pay. A receipt is emailed to you.'))} ${club || opts.freq === 'monthly' ? esc(t('Monthly gifts can be changed or stopped any time: just call or email us.')) + ' ' : ''}${esc(C.org.legal || '')}</p>
</form>`;
}

function mountGive(r, { render, wrap, ctxOf }) {
  r.get('/chai-club', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X, p = (C.programs || []).find((x) => x.slug === 'chai-club') || {};
    const range = (i, a, min) => (i === 0 ? t('{amount} a month and above', { amount: money(min) }) : t('{from} to {to} a month', { from: money(min), to: money(a[i - 1][1] - 1) }));
    const levels = CLUB.slice().reverse();
    // One page in the site's own style: the four levels with their medals, joining, and the honor board (names filled in by site.js
    // from /api/club; every partner gets the medal of their level; amounts are never shown).
    const body = `<section class="wrap sec narrow chai"><h1>${esc(t('Chai Club'))}</h1>
<p class="lead-d">${esc(p.summary || '')}</p>
<div class="club-levels">${levels.map(([id, min, nm], i, a) => `<div class="club-l ${id}">${medal(id, 52)}<b>${esc(t(nm))}</b><span>${esc(range(i, a, min))}</span><span class="cl-count" data-count="${id}"></span></div>`).join('')}</div>
<h2>${esc(t('Join the Chai Club'))}</h2>
${giveForm(X, { club: true, amt: req.query.amt, back: '/chai-club' })}
<div class="sec-h"><h2>${esc(t('Our Chai Club partners'))}</h2></div>
<p class="muted">${esc(t('Thank you to every partner. Partners who chose to be listed are shown here by level; amounts are never shown.'))}</p>
<div class="honor" data-club-board>${levels.map(([id, min, nm], i, a) => `<section class="hb-tier ${id}" data-tier="${id}"><header>${medal(id, 40)}<div><h3>${esc(t(nm))}</h3><span class="muted">${esc(range(i, a, min))}</span></div><span class="hb-count" data-count="${id}"></span></header>
<ul class="hb-names"></ul><p class="hb-quiet muted" hidden></p><p class="hb-empty muted">${esc(t('Be the first to join!'))} <a href="#give">${esc(t('Join the Chai Club'))}</a></p><template>${medal(id, 22)}</template></section>`).join('')}</div>
</section>`;
    await render(res, { path: '/chai-club', title: t('Chai Club: monthly partners of Chabad of Lamorinda'), description: t('Join the Chai Club: monthly partners who carry Jewish life in Lafayette, Moraga and Orinda. Bronze, Silver, Gold and Platinum levels, and an honor board.'), body });
  }));

  r.get('/donate/thank-you', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X;
    const body = `<section class="wrap sec narrow"><h1>${esc(t('Thank you!'))}</h1>
<p class="lead-d">${esc(t('Your gift was received. A receipt has been emailed to you.'))}</p>
<p>${esc(t('Your generosity keeps Jewish life warm and open to everyone in Lafayette, Moraga and Orinda. May G-d bless you and your family with health, happiness and success.'))}</p>
<p class="btns"><a class="btn gold" href="/">${esc(t('Back to the home page'))}</a><a class="btn ghost" href="/events">${esc(t('Upcoming events'))}</a></p>
<p class="muted">${esc(t('Questions about your gift? Call {phone}.', { phone: C.org.phone }))}</p></section>`;
    await render(res, { path: '/donate/thank-you', title: t('Thank you!'), description: t('Thank you for your gift to Chabad of Lamorinda.'), body, noindex: true });
  }));
}
module.exports = { giveForm, giveUrl, mountGive, CLUB, medal };
