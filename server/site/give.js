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

// The giving form. opts: { fund, amt, ded, freq, club, back }
function giveForm(X, opts = {}) {
  const { t, C } = X, G = C.giving || {}, club = !!opts.club;
  const funds = (G.funds || []).filter((f) => f.id !== 'chai' || !club);
  const amounts = club ? CLUB.map((c) => c[1]) : (G.amounts || [180, 360, 1000, 1800]);
  const amt = Number(opts.amt) > 0 ? Number(opts.amt) : (club ? 180 : amounts[1] || amounts[0]);
  const preset = amounts.includes(amt);
  const label = (a) => (club ? `${t(CLUB.find((c) => c[1] === a)[2])} · ${money(a)}` : money(a));
  return `<form class="card give" id="give" data-give data-back="${esc(opts.back || '/donate')}" novalidate>
${club ? '<input type="hidden" name="fund" value="chai"><input type="hidden" name="freq" value="monthly">' : `<fieldset class="radios give-freq"><legend>${esc(t('How often?'))}</legend>
<label><input type="radio" name="freq" value="once"${opts.freq === 'monthly' ? '' : ' checked'}> ${esc(t('Once'))}</label><label><input type="radio" name="freq" value="monthly"${opts.freq === 'monthly' ? ' checked' : ''}> ${esc(t('Every month'))}</label></fieldset>`}
<fieldset class="give-amts"><legend>${esc(club ? t('Your monthly gift') : t('Amount'))}</legend>
<div class="chips">${amounts.map((a) => `<label class="chip pick"><input type="radio" name="amt" value="${a}"${preset && a === amt ? ' checked' : ''}> ${esc(label(a))}</label>`).join('')}</div>
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
    const body = `<section class="wrap sec narrow"><h1>${esc(t('Chai Club'))}</h1>
<p class="lead-d">${esc(p.summary || '')}</p>
<div class="club-levels">${CLUB.slice().reverse().map(([id, min, nm], i, a) => `<div class="club-l ${id}"><b>${esc(t(nm))}</b><span>${esc(i === 0 ? t('{amount} a month and above', { amount: money(min) }) : t('{from} to {to} a month', { from: money(min), to: money(a[i - 1][1] - 1) }))}</span></div>`).join('')}</div>
<h2>${esc(t('Join the Chai Club'))}</h2>
${giveForm(X, { club: true, amt: req.query.amt, back: '/chai-club' })}
<h2>${esc(t('Our Chai Club partners'))}</h2>
<div class="club-board" data-club-board><p class="muted">${esc(t('Loading…'))}</p></div>
<p class="muted">${esc(t('Thank you to every partner. Partners who chose to be listed are shown here by level; amounts are never shown.'))}</p></section>`;
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
module.exports = { giveForm, giveUrl, mountGive, CLUB };
