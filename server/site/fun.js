// Things to play: /dreidel (spin a dreidel, win or lose coins from the pot) and /menorah (light tonight's Chanukah
// candles in the right order, with the blessings and tonight's time for Lafayette). site.js runs both ([data-dreidel], [data-menorah]).
'use strict';
const { esc } = require('./md.js');
const Z = require('./zmanim.js');

const LETTERS = [['נ', 'Nun', 'Nothing happens.'], ['ג', 'Gimmel', 'You take the whole pot!'], ['ה', 'Hei', 'You take half the pot.'], ['ש', 'Shin', 'Put one coin in the pot.']];

function mountFun(r, { render, wrap, ctxOf }) {
  r.get('/dreidel', wrap(async (req, res) => {
    const X = ctxOf(req), { t } = X;
    const body = `<section class="wrap sec narrow fun">
<h1>${esc(t('Spin the dreidel'))}</h1>
<p class="lead-d">${esc(t('Nes Gadol Hayah Sham: a great miracle happened there. Tap Spin, see where it lands, and try to win the pot. You start with 10 coins.'))}</p>
<div class="card dreidel-game" data-dreidel>
  <div class="dr-stage"><div class="dreidel" aria-hidden="true"><span class="dr-letter">נ</span></div></div>
  <p class="dr-msg" role="status" aria-live="polite">${esc(t('Ready? Tap Spin!'))}</p>
  <div class="dr-score"><span>${esc(t('Your coins'))} <b data-dr-you>10</b></span><span>${esc(t('In the pot'))} <b data-dr-pot>4</b></span></div>
  <p class="btns"><button type="button" class="btn gold" data-dr-spin>${esc(t('Spin!'))}</button><button type="button" class="btn ghost" data-dr-reset hidden>${esc(t('Play again'))}</button></p>
  <script type="application/json" data-dr-letters>${JSON.stringify(LETTERS.map(([he, name, what]) => ({ he, name: t(name), what: t(what) }))).replace(/</g, '\\u003c')}</script>
</div>
<h2>${esc(t('How to play'))}</h2>
<ul class="dr-rules">${LETTERS.map(([he, name, what]) => `<li><b class="he" lang="he">${he}</b> <strong>${esc(t(name))}</strong>: ${esc(t(what))}</li>`).join('')}</ul>
<p>${esc(t('The four letters stand for Nes Gadol Hayah Sham, "a great miracle happened there." In Israel the last letter is a Pei, for Po: "a great miracle happened here."'))}</p>
<p class="btns"><a class="btn ghost" href="/holidays/chanukah">${esc(t('Chanukah with Chabad of Lamorinda'))}</a><a class="btn ghost" href="/learn/dreidel">${esc(t('The story of the dreidel'))}</a><a class="btn ghost" href="/menorah">${esc(t('Light the menorah'))}</a></p>
</section>`;
    await render(res, { path: '/dreidel', title: t('Spin the dreidel: a Chanukah game'), description: t('Spin a dreidel online: Nun, Gimmel, Hei, Shin. A Chanukah game for the whole family from Chabad of Lamorinda in Lafayette, Moraga and Orinda.'), body });
  }));
  // Light the menorah: tonight's night during Chanukah (and a countdown before it), candles placed from the right and
  // lit from the newest (left) one, with the shamash first.
  r.get('/menorah', wrap(async (req, res) => {
    const X = ctxOf(req), { t } = X, today = Z.ymd(Z.todayLocal());
    const ht = await require('./yearly.js').holidayTimes('chanukah', today).catch(() => null);
    const nights = ((ht && ht.rows) || []).map((e) => { const m = /^Chanukah: (\d)/.exec(e.desc); return m && { n: +m[1], date: e.date, e }; }).filter(Boolean);
    const tonight = nights.find((x) => x.date === today), first = nights[0];
    const days = first ? Math.round((Date.parse(first.date) - Date.parse(today)) / 864e5) : null;
    const when = (x) => { const dow = new Date(x.date + 'T12:00:00Z').getUTCDay(), tm = X.tm(x.e);
      return dow === 5 ? t('Friday: light before the Shabbat candles, by {time}', { time: tm }) : dow === 6 ? t('Saturday night: light after Havdalah, at about {time}', { time: tm }) : t('Light at about {time}', { time: tm }); };
    const status = tonight ? `<p class="mn-tonight"><strong>${esc(t('Tonight is night {n} of Chanukah', { n: tonight.n }))}</strong><br>${esc(when(tonight))} ${esc(t('in Lafayette, Moraga and Orinda.'))}</p>`
      : first && days > 0 ? `<p class="mn-tonight"><strong>${esc(days === 1 ? t('Chanukah begins tomorrow night!') : t('Chanukah begins in {n} days', { n: days }))}</strong><br>${esc(t('First candle: {date}.', { date: X.longDate(first.date) }))} ${esc(when(first))}</p>` : '';
    const start = tonight ? tonight.n : 1;
    const holder = (i) => `<button type="button" class="mn-c" data-i="${i}" aria-label="${esc(t('Candle {n}', { n: i }))}"><span class="mn-flame" aria-hidden="true"></span></button>`;
    const blessings = [
      ['בָּרוּךְ אַתָּה אֲ-דֹנָי אֱ-לֹהֵינוּ מֶלֶךְ הָעוֹלָם, אֲשֶׁר קִדְּשָׁנוּ בְּמִצְוֹתָיו וְצִוָּנוּ לְהַדְלִיק נֵר חֲנֻכָּה.', 'Baruch atah Ado-nai, Elo-heinu Melech ha-olam, asher kideshanu b’mitzvotav v’tzivanu l’hadlik ner Chanukah.', 'Blessed are You, L-rd our G-d, King of the universe, who has made us holy with His commandments and commanded us to light the Chanukah light.', false],
      ['בָּרוּךְ אַתָּה אֲ-דֹנָי אֱ-לֹהֵינוּ מֶלֶךְ הָעוֹלָם, שֶׁעָשָׂה נִסִּים לַאֲבוֹתֵינוּ בַּיָּמִים הָהֵם בַּזְּמַן הַזֶּה.', 'Baruch atah Ado-nai, Elo-heinu Melech ha-olam, she-asah nissim la-avoteinu ba-yamim hahem bi-zman hazeh.', 'Blessed are You, L-rd our G-d, King of the universe, who performed miracles for our ancestors in those days, at this time.', false],
      ['בָּרוּךְ אַתָּה אֲ-דֹנָי אֱ-לֹהֵינוּ מֶלֶךְ הָעוֹלָם, שֶׁהֶחֱיָנוּ וְקִיְּמָנוּ וְהִגִּיעָנוּ לַזְּמַן הַזֶּה.', 'Baruch atah Ado-nai, Elo-heinu Melech ha-olam, shehecheyanu v’kiyemanu v’higiyanu la-zman hazeh.', 'Blessed are You, L-rd our G-d, King of the universe, who has given us life, sustained us and brought us to this time.', true],
    ];
    const body = `<section class="wrap sec narrow fun">
<h1>${esc(t('Light the menorah'))}</h1>
<p class="lead-d">${esc(t('Learn to light the Chanukah menorah, one night at a time: place the candles from the right, light the shamash, say the blessings, then light the newest candle first.'))}</p>
${status}
<div class="card menorah-game" data-menorah data-night="${start}">
  <div class="chips mn-nights" role="group" aria-label="${esc(t('Which night?'))}">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<button type="button" class="chip pick${n === start ? ' on' : ''}" data-n="${n}">${esc(t('Night {n}', { n }))}</button>`).join('')}</div>
  <div class="mn-stage" dir="ltr"><div class="mn-row">${[8, 7, 6, 5].map(holder).join('')}<button type="button" class="mn-c mn-shamash" data-i="0" aria-label="${esc(t('The shamash'))}"><span class="mn-flame" aria-hidden="true"></span></button>${[4, 3, 2, 1].map(holder).join('')}</div><div class="mn-base" aria-hidden="true"></div></div>
  <p class="mn-msg" role="status" aria-live="polite"></p>
  <p class="btns"><button type="button" class="btn ghost" data-mn-reset>${esc(t('Start again'))}</button></p>
  <script type="application/json" data-mn-text>${JSON.stringify({ shamash: t('First light the shamash, the helper candle in the middle. Tap it.'), next: t('Now say the blessings below, then light the newest candle, on the left. Tap it.'), more: t('Lovely! Now the next one, moving to the right.'), wrong: t('Almost: we light the newest candle (on the left) first, then move right.'), done: t('The menorah is lit. Happy Chanukah! Place it in a window, so its light reaches the street.') }).replace(/</g, '\\u003c')}</script>
</div>
<h2>${esc(t('The blessings'))}</h2>
${blessings.map(([he, tr, en, firstOnly]) => `<div class="card mn-bless${firstOnly ? ' mn-first' : ''}"><p class="he" lang="he" dir="rtl">${he}</p><p><em>${esc(tr)}</em></p><p class="muted">${esc(t(en))}</p>${firstOnly ? `<p class="small hand">${esc(t('Only on the first night (or the first time you light this year).'))}</p>` : ''}</div>`).join('')}
<h2>${esc(t('Good to know'))}</h2>
<ul class="list"><li>${esc(t('Candles are placed from right to left, adding one each night, and lit from left to right, starting with the newest.'))}</li><li>${esc(t('The candles should burn for at least half an hour after nightfall (on Friday, light larger candles before Shabbat).'))}</li></ul>
<p class="btns"><a class="btn gold" href="/holidays/chanukah">${esc(t('Chanukah with Chabad of Lamorinda'))}</a><a class="btn ghost" href="/learn/chanukah-menorah">${esc(t('All about the menorah'))}</a><a class="btn ghost" href="/dreidel">${esc(t('Spin the dreidel'))}</a></p>
</section>`;
    await render(res, { path: '/menorah', title: t('Light the menorah: a Chanukah guide you can tap'), description: t('Light the Chanukah menorah online, night by night: which candles, in what order, the blessings and tonight’s time for Lafayette, Moraga and Orinda.'), body });
  }));
}
module.exports = { mountFun };
