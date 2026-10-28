// Links between pages, so readers (and Google) always find the next useful page: every holiday page lists its guides,
// every program page the guides for that program, and every town page the local Lamorinda guides.
'use strict';
const { esc } = require('./md.js');

const HOLIDAY = {
  'rosh-hashanah': /rosh-hashanah|shofar|tashlich|elul|selichot|teshuvah/, 'yom-kippur': /yom-kippur|kol-nidre|yizkor|teshuvah/,
  sukkot: /sukk|four-kinds|ushpizin|hoshana/, 'simchat-torah': /hakafot|torah-reading|simchat/, chanukah: /chanukah|dreidel|al-hanissim|kislev|jewish-in-december/,
  'tu-bishvat': /tu-bishvat/, purim: /purim|megillah|mishloach/, passover: /passover|seder-plate|afikoman|four-questions|matzah|chametz|exodus|pesach/,
  'lag-baomer': /omer|lag-baomer/, shavuot: /shavuot|ten-commandments|omer/, 'tisha-bav': /three-weeks|tisha|holy-temple|western-wall/,
};
const PROGRAM = {
  'jewish-preschool': /preschool|kids-in|new-parents|parenting/, 'hebrew-school': /hebrew-school|kids-in|hebrew-alphabet|bar-bat-mitzvah-in/,
  'ckids-afterschool': /kids-in|parenting/, 'summer-camp': /kids-in|parenting/, 'adult-education': /torah-classes|tanya|weekly-parsha|daily-torah|talmud/,
  'womens-circle': /women|challah|shabbat-candles|mikvah/, 'mens-club': /jewish-men-in|tefillin|minyan/, 'kids-and-teens': /teens|kids-in/,
  'bar-bat-mitzvah': /bar-mitzvah|bat-mitzvah|bar-bat|tefillin/, 'bay-kosher': /kosher/, 'chai-club': /supporting|tzedakah|pushka|maaser/,
};
function guidesFor(C, path) {
  let m, list = [];
  if ((m = /^\/holidays\/([a-z-]+)$/.exec(path)) && HOLIDAY[m[1]]) list = C.learn.filter((a) => HOLIDAY[m[1]].test(a.slug));
  else if ((m = /^\/programs\/([a-z-]+)$/.exec(path)) && PROGRAM[m[1]]) list = C.learn.filter((a) => PROGRAM[m[1]].test(a.slug));
  else if ((m = /^\/jewish-([a-z-]+)$/.exec(path)) && C.towns.some((x) => x.slug === m[1])) {
    const local = C.learn.filter((a) => a.category === 'Lamorinda'), i = C.towns.findIndex((x) => x.slug === m[1]) * 3;
    list = [...local.slice(i % local.length), ...local.slice(0, i % local.length)];
  }
  // Local guides first, then the ones named after the holiday or program itself.
  const key = (m && m[1] || '').split('-')[0], rank = (a) => (a.category === 'Lamorinda' ? 0 : a.slug.includes(key) ? 1 : 2);
  return /^\/jewish-/.test(path) ? list.slice(0, 6) : list.sort((a, b) => rank(a) - rank(b) || a.slug.localeCompare(b.slug)).slice(0, 8);
}
function withGuides(X, body, path) {
  const list = guidesFor(X.C, path);
  if (!list.length) return body;
  const html = `<h2>${esc(X.t(/^\/jewish-/.test(path) ? 'Guides to Jewish life in Lamorinda' : 'Guides to read'))}</h2><div class="grid">${list.map((a) => `<a class="card tile" href="/learn/${a.slug}"><h3>${esc(a.title)}</h3><p>${esc(a.description)}</p></a>`).join('')}</div>`;
  const i = Math.max(body.lastIndexOf('</article>'), body.lastIndexOf('</section>'));
  return i < 0 ? body + html : body.slice(0, i) + html + body.slice(i);
}
// Links written as a bare address ("[/kaddish](/kaddish)") show the page's name instead.
function friendlyLinks(X, html) {
  const C = X.C, t = X.t, name = (p) => {
    const m = /^\/(learn|help|holidays|programs|forms)\/([a-z0-9-]+)$/.exec(p);
    if (m) { const list = { learn: C.learn, help: C.help || [], holidays: C.holidays, programs: C.programs, forms: C.forms || [] }[m[1]], x = list.find((y) => (y.slug || y.id) === m[2]); return x && (x.title || x.name); }
    const FIXED = { '/kaddish': 'Kaddish', '/tehillim': 'Tehillim for every occasion', '/sponsor': 'Sponsor in honor or memory', '/parsha': "This week's Torah portion", '/contact': 'Contact', '/events': 'Upcoming events', '/shabbat': 'Shabbat times and services in Lafayette', '/donate': 'Donate', '/account': 'My account', '/help': "We're here for you", '/learn': 'Learn about Judaism', '/calendar': 'Jewish calendar', '/community': 'Community board', '/welcome': 'New to the area?', '/sponsor-a-kiddush': 'Sponsor a Kiddush', '/chai-club': 'Chai Club', '/pushka/': 'My Pushka app' };
    return FIXED[p] && t(FIXED[p]);
  };
  return html.replace(/<a href="(\/[a-z0-9/-]*)">\1<\/a>/g, (m, p) => { const n = name(p); return n ? `<a href="${p}">${esc(n)}</a>` : m; });
}
module.exports = { guidesFor, withGuides, friendlyLinks };
