// Things to play: /dreidel (spin a dreidel, win or lose coins from the pot). site.js runs the game ([data-dreidel]).
'use strict';
const { esc } = require('./md.js');

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
<p class="btns"><a class="btn ghost" href="/holidays/chanukah">${esc(t('Chanukah with Chabad of Lamorinda'))}</a><a class="btn ghost" href="/learn/dreidel">${esc(t('The story of the dreidel'))}</a></p>
</section>`;
    await render(res, { path: '/dreidel', title: t('Spin the dreidel: a Chanukah game'), description: t('Spin a dreidel online: Nun, Gimmel, Hei, Shin. A Chanukah game for the whole family from Chabad of Lamorinda in Lafayette, Moraga and Orinda.'), body });
  }));
}
module.exports = { mountFun };
