// "We're here for you": life situations, Kaddish, Tehillim and sponsoring in honor or memory.
//  /help, /help/<slug>   what to do when someone is sick or passes away, a new baby, a wedding, disputes, hard times...
//  /kaddish              join the minyan, or arrange for Kaddish to be said on your behalf
//  /tehillim             which Psalms to say for each occasion, today's Tehillim, your birthday chapter, Psalm 119 by name,
//                        and adding a name to the prayer list; every occasion invites charity in the person's merit
//  /sponsor              sponsor a Kiddush, a Shabbat dinner or a class for a yahrzeit, birthday, simcha or recovery
'use strict';
const { md, esc } = require('./md.js');
const H = require('../../pushka/hebdate.js');
const Z = require('./zmanim.js');
const { validYmd } = require('./tools.js');

const LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ', 'ק', 'ר', 'ש', 'ת'];
const FINAL = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
// The monthly cycle of Tehillim by day of the Hebrew month (on a 29-day month, day 29 also says day 30's portion).
const MONTHLY = ['1-9', '10-17', '18-22', '23-28', '29-34', '35-38', '39-43', '44-48', '49-54', '55-59', '60-65', '66-68', '69-71', '72-76', '77-78', '79-82', '83-87', '88-89', '90-96', '97-103', '104-105', '106-107', '108-112', '113-118', '119:1-96', '119:97-176', '120-134', '135-139', '140-144', '145-150'];
const sefaria = (ref, lang) => `https://www.sefaria.org/Psalms.${ref}?lang=${lang === 'he' ? 'he' : 'bi'}`;
const giveUrl = (fund, ded) => `/pushka/?go=give&fund=${encodeURIComponent(fund || 'general')}&ded=${encodeURIComponent(String(ded || '').slice(0, 80))}`;

// Which extra boxes a help page shows.
const HELP_EXTRAS = {
  'someone-passed-away': ['kaddish', 'tehillim:yahrzeit', 'sponsor:yahrzeit'], 'end-of-life': ['tehillim:refuah', 'prayer'], 'someone-is-sick': ['prayer', 'tehillim:refuah', 'sponsor:refuah'],
  'planning-a-jewish-funeral': ['kaddish'], 'new-baby': ['tehillim:new-baby', 'sponsor:new-baby'], 'bar-bat-mitzvah': ['sponsor:bar-bat-mitzvah'], 'getting-married': ['tehillim:match', 'sponsor:honor'], 'grief-and-hard-times': ['tehillim:refuah', 'kaddish'],
};

function mountLife(r, { render, wrap, ctxOf, faqHtml, faqLd, crumbs, base, prayerList }) {
  const phoneLink = (o) => `<a class="btn gold call" href="tel:${esc(o.phone.replace(/[^0-9+]/g, ''))}" dir="ltr">${esc(o.phone)}</a>`;
  const rabbiForm = (X, subject, kind = 'rabbi') => `<form class="card tool" data-submit data-kind="${kind}">
  <p class="muted">${esc(X.t('Private and confidential: only the Rabbi reads it.'))}</p>
  <input type="hidden" name="title" value="${esc(subject)}">
  <label>${esc(X.t('How can we help?'))} <textarea name="body" rows="5" maxlength="2000" required></textarea></label>
  <div class="fields"><label>${esc(X.t('Your name'))} <input name="name" autocomplete="name" required></label><label>${esc(X.t('Your email'))} <input name="email" type="email" autocomplete="email" required></label><label>${esc(X.t('Phone (optional)'))} <input name="phone" type="tel" autocomplete="tel" data-extra="Phone"></label></div>
  <button class="btn gold" type="submit">${esc(X.t('Send to the Rabbi'))}</button><p class="msg" hidden></p></form>`;

  // ---------- life situations ----------
  r.get('/help', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X, o = C.org;
    const body = `<section class="wrap sec"><h1>${esc(t("We're here for you"))}</h1>
<p class="lead-d">${esc(t('Whatever you are going through, in joy or in sorrow, Chabad of Lamorinda is here. Call the Rabbi first: we help with everything, from beginning to end, for every Jew, no membership needed.'))}</p>
<p class="btns">${phoneLink(o)}<a class="btn ghost" href="/help/talk-to-the-rabbi">${esc(t('Talk to the Rabbi'))}</a></p>
<div class="grid help-grid">${C.help.map((h) => `<a class="card tile${h.urgent === 'yes' ? ' urgent' : ''}" href="/help/${h.slug}"><h3>${esc(h.title)}</h3><p>${esc(h.description)}</p></a>`).join('')}
<a class="card tile" href="/kaddish"><h3>${esc(t('Saying Kaddish'))}</h3><p>${esc(t('Join our minyan, or arrange for Kaddish to be said for your loved one.'))}</p></a>
<a class="card tile" href="/tehillim"><h3>${esc(t('Tehillim for every occasion'))}</h3><p>${esc(t('Which Psalms to say for someone sick, a birth, a yahrzeit or a birthday.'))}</p></a>
<a class="card tile" href="/sponsor"><h3>${esc(t('Sponsor in honor or memory'))}</h3><p>${esc(t('Mark a yahrzeit, birthday or simcha with the community.'))}</p></a></div>
<p class="muted">${esc(t('In a medical emergency call 911. The Rabbi is not a substitute for medical, legal or mental health care, and can refer you to trusted professionals.'))}</p></section>`;
    await render(res, { path: '/help', title: t("We're here for you: help with every life situation"), description: t('Illness, a death and Jewish burial, a new baby, bar mitzvah, marriage, family or business disputes, grief: Rabbi Yisroel Labkowski of Chabad of Lamorinda helps with everything.'), body });
  }));
  r.get('/help/:slug', wrap(async (req, res, next) => {
    const X = ctxOf(req), { t, C } = X, o = C.org, h = C.help.find((x) => x.slug === req.params.slug);
    if (!h) return next();
    const rel = h.related.map((s) => (s.startsWith('learn/') ? C.learn.find((a) => a.slug === s.slice(6)) && { href: '/' + s, title: C.learn.find((a) => a.slug === s.slice(6)).title } : C.help.find((x) => x.slug === s) && { href: '/help/' + s, title: C.help.find((x) => x.slug === s).title })).filter(Boolean);
    const extras = (HELP_EXTRAS[h.slug] || []).map((x) => {
      const [k, v] = x.split(':');
      if (k === 'kaddish') return `<a class="card tile" href="/kaddish"><h3>${esc(t('Kaddish'))}</h3><p>${esc(t('Join our minyan, or arrange for Kaddish to be said for your loved one.'))}</p></a>`;
      if (k === 'prayer') return `<a class="card tile" href="/tehillim#prayer-list"><h3>${esc(t('Add a name to our prayer list'))}</h3><p>${esc(t('The Rabbi and the community will pray for a complete recovery.'))}</p></a>`;
      if (k === 'tehillim') { const s = C.tehillim.situations.find((y) => y.id === v); return s ? `<a class="card tile" href="/tehillim#${v}"><h3>${esc(t('Tehillim'))}: ${esc(s.title)}</h3><p>${esc(t('Which chapters to say, with the text.'))}</p></a>` : ''; }
      if (k === 'sponsor') { const s = C.sponsor.occasions.find((y) => y.id === v); return s ? `<a class="card tile" href="/sponsor?o=${v}"><h3>${esc(t('Sponsor in honor or memory'))}</h3><p>${esc(s.text)}</p></a>` : ''; }
      return '';
    }).join('');
    const body = `<article class="wrap sec narrow help-page">
<p class="crumbs"><a href="/help">${esc(t("We're here for you"))}</a> ›</p>
<h1>${esc(h.title)}</h1>
<aside class="card callbox${h.urgent === 'yes' ? ' urgent' : ''}"><p><strong>${esc(h.urgent === 'yes' ? t('Call the Rabbi now. We will guide you through every step.') : t('Call the Rabbi. We are here to help.'))}</strong></p><p class="btns">${phoneLink(o)}<a class="btn ghost" href="#message">${esc(t('Send a message'))}</a></p></aside>
${md(h.body)}
${extras ? `<div class="grid">${extras}</div>` : ''}
${h.faq.length ? `<h2>${esc(t('Common questions'))}</h2>${faqHtml(h.faq)}` : ''}
${rel.length ? `<h2>${esc(t('Related'))}</h2><ul class="list">${rel.map((x) => `<li><a href="${x.href}">${esc(x.title)}</a></li>`).join('')}</ul>` : ''}
<h2 id="message">${esc(t('Send the Rabbi a message'))}</h2>${rabbiForm(X, h.title)}
</article>`;
    await render(res, { path: '/help/' + h.slug, title: h.title, description: h.description, body, ld: [crumbs(base, [[t("We're here for you"), '/help'], [h.title, '/help/' + h.slug]]), ...(h.faq.length ? [faqLd(h.faq)] : [])] });
  }));

  // ---------- Kaddish ----------
  r.get('/kaddish', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X, o = C.org, k = C.sponsor.kaddish || {}, svc = o.services || [];
    const body = `<section class="wrap sec narrow"><h1>${esc(t('Saying Kaddish'))}</h1>
<p class="lead-d">${esc(t('Kaddish is the prayer said for a parent or close relative during the eleven months after their passing and on every yahrzeit. It elevates the soul of your loved one. We will help you say it, or arrange for it to be said.'))} <a href="/learn/kaddish">${esc(t('What is Kaddish?'))}</a></p>
<h2>${esc(t('Join our minyan'))}</h2>
<p>${esc(t('Kaddish is said with a minyan, a group of ten. Come to our services and say it with the community; if you are new to it, we will guide you through the words. Let us know you are coming, so we can make sure there is a minyan.'))}</p>
<ul class="list">${svc.map((s) => `<li><strong>${esc(s.name)}</strong> ${esc(s.time)}</li>`).join('')}</ul>
<p class="btns"><a class="btn ghost" href="/shabbat">${esc(t('Shabbat and prayer times'))}</a><a class="btn ghost" href="/tools/yahrzeit">${esc(t('Yahrzeit calculator'))}</a></p>
<h2 id="arrange">${esc(t('Have Kaddish said for your loved one'))}</h2>
<p>${esc(t('If you cannot be at a minyan every day, the custom is to arrange for someone to say Kaddish on your behalf, and to give charity in the merit of the departed. We will make sure Kaddish is said for the full eleven months, on the yahrzeit, or both, and the Rabbi will remember your loved one by name.'))}</p>
<p>${esc(k.amount ? t('Suggested donation: ${amount}', { amount: k.amount }) : t('With a donation of your choice.'))}</p>
<form class="card tool" data-submit data-kind="kaddish" data-title="Kaddish: {deceased}" data-after="give">
  <div class="fields">
    <label>${esc(t('Name of the departed'))} <input name="deceased" required data-extra="Name"></label>
    <label>${esc(t('Hebrew name (if known)'))} <input name="hebrew" data-extra="Hebrew name"></label>
    <label>${esc(t("Father's Hebrew name (if known)"))} <input name="father" data-extra="Father's Hebrew name"></label>
    <label>${esc(t('Your relation'))} <input name="relation" data-extra="Relation"></label>
    <label>${esc(t('Date of passing'))} <input type="date" name="date" data-extra="Date of passing"></label>
  </div>
  <label class="check"><input type="checkbox" name="night" value="after sunset" data-extra="After sunset"> ${esc(t('Passed after sunset'))}</label>
  <label>${esc(t('Kaddish for'))} <select name="period" data-extra="Kaddish for"><option value="11 months">${esc(t('The eleven months'))}</option><option value="every yahrzeit">${esc(t('Every yahrzeit'))}</option><option value="11 months and every yahrzeit">${esc(t('Both'))}</option><option value="this yahrzeit">${esc(t('This yahrzeit'))}</option></select></label>
  <div class="fields"><label>${esc(t('Your name'))} <input name="name" autocomplete="name" required></label><label>${esc(t('Your email'))} <input name="email" type="email" autocomplete="email" required></label><label>${esc(t('Phone (optional)'))} <input name="phone" type="tel" data-extra="Phone"></label></div>
  <button class="btn gold" type="submit">${esc(t('Arrange Kaddish'))}</button><p class="msg" hidden></p>
  <p class="give-next" hidden><a class="btn gold" href="${giveUrl(k.fund || 'general', 'Kaddish')}" data-ded="${esc(t('Kaddish for {name}'))}">${esc(t('Give the Kaddish donation'))}</a></p>
</form>
<p class="muted">${esc(t('Questions? Call the Rabbi at {phone}.', { phone: o.phone }))}</p>
</section>`;
    await render(res, { path: '/kaddish', title: t('Kaddish: join our minyan or have Kaddish said for your loved one'), description: t('Say Kaddish with our minyan in Lafayette, or arrange for Kaddish to be said for your loved one for eleven months or on the yahrzeit. Chabad of Lamorinda.'), body });
  }));

  // ---------- Tehillim ----------
  r.get('/tehillim', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X, T = C.tehillim, today = Z.todayLocal(), hd = await Z.hebrewDate(today);
    // On the last day of a 29-day month, finish the book: chapters 140 to 150.
    const shortMonth = hd.day === 29 && (await Z.hebrewDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))).day === 1;
    const daily = shortMonth ? '140-150' : MONTHLY[Math.min(hd.day, 30) - 1];
    const ch = (n) => `<a href="${sefaria(n, X.lang)}" rel="noopener" target="_blank">${n}</a>`;
    // Birthday chapter: completed Hebrew years + 1.
    const b = String(req.query.b || ''), bNight = req.query.night === '1';
    let birthday = '';
    if (validYmd(b) && b <= Z.ymd(today)) {
      const p = H.hebrewOf(b, bNight), nb = H.next({ day: p.day, month: p.month }, Z.ymd(today));
      if (nb) {
        const y2 = H.parts(nb.date).year, age = nb.date === Z.ymd(today) ? y2 - p.year : y2 - p.year - 1, chapter = Math.min(age + 1, 150);
        birthday = `<div class="card answer"><p>${esc(t('You are {age}. Your chapter this year is', { age }))}</p><p class="big">${esc(t('Psalm {n}', { n: chapter }))}</p><p><a class="btn gold" href="${sefaria(chapter, X.lang)}" rel="noopener" target="_blank">${esc(t('Read Psalm {n}', { n: chapter }))}</a></p><p class="muted">${esc(t('From your next Hebrew birthday ({date}) say Psalm {n}.', { date: X.longDate(nb.date), n: Math.min(chapter + (nb.date === Z.ymd(today) ? 0 : 1), 150) }))}</p></div>`;
      }
    }
    // Psalm 119 by name: eight verses for each letter of the Hebrew name.
    const name = String(req.query.name || '').replace(/[^א-ת ]/g, '').slice(0, 40);
    let byName = '';
    if (name.trim()) {
      const parts = [...name.replace(/ /g, '')].map((c) => FINAL[c] || c).filter((c) => LETTERS.includes(c));
      byName = `<div class="card answer"><p>${esc(t('Psalm 119 for the name'))} <strong lang="he">${esc(name)}</strong>:</p><ul class="list">${parts.map((c) => { const i = LETTERS.indexOf(c); return `<li><a href="${sefaria(`119.${i * 8 + 1}-${i * 8 + 8}`, X.lang)}" rel="noopener" target="_blank"><span lang="he">${c}</span> · ${esc(t('verses {a} to {b}', { a: i * 8 + 1, b: i * 8 + 8 }))}</a></li>`; }).join('')}</ul></div>`;
    }
    const sit = T.situations.map((s) => `<section class="card tehillim" id="${s.id}"><h2>${esc(s.title)}</h2><p>${esc(s.text)}</p>
${s.chapters.length ? `<p class="chapters">${esc(t('Chapters'))}: ${s.chapters.map(ch).join(', ')}</p>` : ''}
${s.birthday ? `<form class="tool" method="get" action="/tehillim#birthday"><label>${esc(t('Your date of birth'))} <input type="date" name="b" value="${esc(b)}" required></label><label class="check"><input type="checkbox" name="night" value="1"${bNight ? ' checked' : ''}> ${esc(t('Born after sunset'))}</label><button class="btn ghost" type="submit">${esc(t('Find my chapter'))}</button></form>${birthday}` : ''}
${s.name119 ? `<p class="muted"><a href="#name119">${esc(t('Psalm 119 by Hebrew name'))}</a></p>` : ''}
<p class="btns"><a class="btn gold sm" href="/sponsor?o=${encodeURIComponent(s.id === 'pregnancy' || s.id === 'match' || s.id === 'travel' || s.id === 'livelihood' || s.id === 'israel' || s.id === 'thanks' ? 'honor' : s.id === 'shiva' ? 'yahrzeit' : s.id)}">${esc(t('Give charity in their merit'))}</a>${s.submit ? `<a class="btn ghost sm" href="#prayer-list">${esc(t('Add a name to our prayer list'))}</a>` : ''}</p></section>`).join('');
    const body = `<section class="wrap sec narrow"><h1>${esc(t('Tehillim for every occasion'))}</h1>
<p class="lead-d">${esc(T.intro)}</p>
<div class="card answer"><p class="eyebrow">${esc(t("Today's Tehillim"))}</p><p>${esc(t('Today is day {day} of the Hebrew month. Chabad custom is to complete the book of Tehillim every month:', { day: hd.day }))} <a href="${sefaria(daily.includes(':') ? daily.replace(':', '.') : daily, X.lang)}" rel="noopener" target="_blank"><strong>${esc(t('chapters {range}', { range: daily }))}</strong></a></p></div>
<nav class="chips">${T.situations.map((s) => `<a class="chip" href="#${s.id}">${esc(s.title)}</a>`).join('')}<a class="chip" href="#name119">${esc(t('Psalm 119 by name'))}</a><a class="chip" href="#prayer-list">${esc(t('Prayer list'))}</a></nav>
${sit}
<section class="card tehillim" id="name119"><h2>${esc(t('Psalm 119 by Hebrew name'))}</h2><p>${esc(t('Psalm 119 has a section of eight verses for each letter of the Hebrew alphabet. For someone who is sick, or in memory of someone, say the sections that spell their Hebrew name.'))}</p>
<form class="tool" method="get" action="/tehillim#name119"><label>${esc(t('Hebrew name (in Hebrew letters)'))} <input name="name" lang="he" dir="rtl" value="${esc(name)}" required></label><button class="btn ghost" type="submit">${esc(t('Show the sections'))}</button></form>${byName}</section>
<section class="card tehillim" id="prayer-list"><h2>${esc(t('Add a name to our prayer list'))}</h2><p>${esc(t('The Rabbi and the community pray for everyone on our list, and the name is mentioned at the Torah reading (Mi Shebeirach). Please give the Hebrew name and the mother\'s Hebrew name if you know them.'))}</p>
<form class="tool" data-submit data-kind="tehillim" data-title="{pname} ben/bat {pmother}">
  <div class="fields"><label>${esc(t('Name (Hebrew name if known)'))} <input name="pname" required data-extra="Name"></label><label>${esc(t("Mother's name (Hebrew if known)"))} <input name="pmother" data-extra="Mother's name"></label>
  <label>${esc(t('For'))} <select name="reason" data-extra="For"><option value="refuah">${esc(t('A complete recovery'))}</option><option value="birth">${esc(t('An easy and healthy birth'))}</option><option value="match">${esc(t('Finding a match'))}</option><option value="children">${esc(t('Children'))}</option><option value="livelihood">${esc(t('Livelihood'))}</option><option value="other">${esc(t('Other'))}</option></select></label></div>
  <label>${esc(t('Anything the Rabbi should know (private)'))} <textarea name="body" rows="3" maxlength="1000"></textarea></label>
  <div class="fields"><label>${esc(t('Your name'))} <input name="name" autocomplete="name" required></label><label>${esc(t('Your email'))} <input name="email" type="email" autocomplete="email" required></label></div>
  <button class="btn gold" type="submit">${esc(t('Add to the prayer list'))}</button><p class="msg" hidden></p>
  <p class="give-next" hidden><a class="btn gold" href="${giveUrl('general', '')}" data-ded="${esc(t('For a complete recovery for {name}'))}">${esc(t('Give charity in their merit'))}</a></p>
</form></section>
</section>`;
    await render(res, { path: '/tehillim', noindex: !!(b || name), title: t('Tehillim (Psalms) for every occasion: sick, birth, yahrzeit, birthday'), description: t('Which Psalms to say for someone who is sick, for a healthy birth, on a yahrzeit or birthday, Psalm 119 by name, and today\'s Tehillim. Add a name to our prayer list.'), body });
  }));

  // ---------- Sponsor in honor or memory ----------
  r.get('/sponsor', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X, S = C.sponsor, oc = S.occasions.find((x) => x.id === req.query.o) || null, who = String(req.query.name || '').trim().slice(0, 60);
    const ded = oc ? (who ? oc.dedication.replace('{name}', who) : oc.dedication.replace(/\s*\{name\}('s)?\s*/, ' ').replace(/\s+/g, ' ').trim()) : '';
    const opts = S.options.map((p) => `<div class="card dir-i"><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p><p><a class="btn ${p.id === 'kiddush' ? 'gold' : 'ghost'} sm" href="${p.url ? esc(p.url) : esc(giveUrl(p.fund, ded))}">${esc(p.id === 'kiddush' ? t('Choose a Shabbat') : t('Sponsor'))}</a></p></div>`).join('');
    const sit = oc && { yahrzeit: 'yahrzeit', refuah: 'refuah', 'new-baby': 'new-baby', birthday: 'birthday' }[oc.id];
    const body = `<section class="wrap sec narrow"><h1>${esc(t('Sponsor in honor or memory'))}</h1>
<p class="lead-d">${esc(S.intro)}</p>
<form class="card tool" method="get" action="/sponsor">
  <label>${esc(t('The occasion'))} <select name="o">${S.occasions.map((x) => `<option value="${x.id}"${oc && oc.id === x.id ? ' selected' : ''}>${esc(x.title)}</option>`).join('')}</select></label>
  <label>${esc(t('For whom? (name)'))} <input name="name" value="${esc(who)}" maxlength="60"></label>
  <button class="btn ghost" type="submit">${esc(t('Continue'))}</button>
</form>
${oc ? `<p class="dedication">${esc(t('Your dedication:'))} <strong>${esc(ded)}</strong></p>` : ''}
<h2>${esc(t('Choose how to mark it'))}</h2>
<div class="dir">${opts}</div>
${sit ? `<p class="btns"><a class="btn ghost" href="/tehillim#${sit}">${esc(t('Tehillim to say for this'))}</a>${oc.id === 'yahrzeit' ? `<a class="btn ghost" href="/kaddish">${esc(t('Kaddish'))}</a><a class="btn ghost" href="/tools/yahrzeit">${esc(t('Yahrzeit calculator'))}</a>` : ''}</p>` : ''}
<p class="muted">${esc(t('Questions, or a sponsorship that is not listed? Call {phone}.', { phone: C.org.phone }))}</p></section>`;
    await render(res, { path: '/sponsor', noindex: !!(req.query.o || who), title: t('Sponsor a Kiddush or program in honor or memory'), description: t('Mark a yahrzeit, birthday, anniversary, new baby or recovery by sponsoring a Kiddush, Shabbat dinner or Torah class at Chabad of Lamorinda.'), body });
  }));
}
module.exports = { mountLife, MONTHLY, LETTERS };
