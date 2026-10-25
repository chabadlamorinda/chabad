// Per-visitor context: the language, the translator t(), the content in that language, and date/time formats.
'use strict';
const { LOCALE, preferred, withLang, localizeLinks } = require('./i18n.js');
const { splitFaq } = require('./content.js');
const Z = require('./zmanim.js');

const parseLocal = (s) => { const [d, t = '00:00'] = s.split('T'); const [y, m, da] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return { y, m, d: da, h, mi }; };
const utc = (y, m, d, h = 12, mi = 0) => new Date(Date.UTC(y, m - 1, d, h, mi));

function makeCtx({ content, i18n }) {
  return function ctxOf(req) {
    const lang = req.lang || 'en', loc = LOCALE[lang], t = i18n.makeT(lang), C = i18n.localize(content(), lang, splitFaq);
    const f = (opts) => new Intl.DateTimeFormat(loc, { timeZone: 'UTC', ...opts });
    const day = (ymd, opts) => { const [y, m, d] = ymd.split('-').map(Number); return f(opts).format(utc(y, m, d)); };
    const clock = (h, mi) => f({ hour: 'numeric', minute: mi ? '2-digit' : undefined }).format(utc(2000, 1, 1, h, mi));
    const X = {
      lang, t, C, req,
      longDate: (ymd) => day(ymd, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      shortDate: (ymd) => day(ymd, { weekday: 'short', month: 'short', day: 'numeric' }),
      mon: (m) => f({ month: 'short' }).format(utc(2000, m, 1)),
      tm: (e) => (e && e.time ? Z.fmtTime(e.time, loc) : ''),
      // Hebcal names: Hebrew from Hebcal itself, Russian and English through the dictionary.
      hc: (e) => (lang === 'he' && e.titleHe ? e.titleHe : t(e.title)),
      when(e) {
        const a = parseLocal(e.start), b = e.end ? parseLocal(e.end) : null;
        const date = day(e.start.slice(0, 10), { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
        if (!b) return `${date} · ${clock(a.h, a.mi)}`;
        if (e.end.slice(0, 10) === e.start.slice(0, 10)) return `${date} · ${clock(a.h, a.mi)} – ${clock(b.h, b.mi)}`;
        return `${date} ${clock(a.h, a.mi)} – ${day(e.end.slice(0, 10), { weekday: 'long', month: 'short', day: 'numeric' })} ${clock(b.h, b.mi)}`;
      },
      async hebrewDate(d) {
        const h = await Z.hebrewDate(d);
        return lang === 'he' ? h.he : lang === 'ru' ? `${h.day} ${t(h.month)} ${h.year}` : h.en;
      },
      path: (p) => withLang(lang, p),
      links: (html) => { const h = localizeLinks(html, lang); return lang === 'he' ? h.replace(/ →/g, ' ←') : h; },
      // English page, visitor prefers another language: send them there (search engines are never redirected).
      redirectTo() { const p = preferred(req); return lang === 'en' && p !== 'en' && req.method === 'GET' ? withLang(p, req.originalUrl) : null; },
    };
    return X;
  };
}
module.exports = { makeCtx, parseLocal };
