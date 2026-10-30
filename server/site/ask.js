// "Ask the Rabbi" answers: real questions people asked (in the chat or by message) that the Rabbi answers in the
// Rabbi area and publishes. Each becomes a page (/ask/<slug>) with Q&A markup, so Google and AI assistants can
// find and cite the Rabbi's own answers. Nothing personal is published: the Rabbi edits the question before posting.
'use strict';
const crypto = require('crypto');
const express = require('express');
const { md, esc, plain } = require('./md.js');

const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9֐-׿Ѐ-ӿ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'question';

function mountAsk(r, { store, render, wrap, ctxOf, base, faqLd, crumbs }) {
  const pool = store && store.pool, q = (t, p) => pool.query(t, p);
  const published = async () => (pool ? (await q("SELECT slug, question, answer, lang, published_at FROM qa WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT 500")).rows : []);

  r.get('/ask', wrap(async (req, res) => {
    const X = ctxOf(req), t = X.t, list = await published().catch(() => []);
    const body = `<section class="wrap sec narrow"><h1>${esc(t('Ask the Rabbi'))}</h1>
<p class="lead-d">${esc(t('Real questions from our community, answered by Rabbi Yisroel Labkowski. Have a question? Ask it in the chat, or send it to the Rabbi privately.'))}</p>
<p class="btns"><a class="btn gold" href="/help/talk-to-the-rabbi">${esc(t('Ask the Rabbi'))}</a></p>
${list.length ? `<p><input type="search" class="search" data-filter=".qa-list .tile" placeholder="${esc(t('Search the answers'))}" aria-label="${esc(t('Search the answers'))}"></p><div class="grid qa-list">${list.map((x) => `<a class="card tile" href="/ask/${encodeURIComponent(x.slug)}" lang="${x.lang}"><h3>${esc(x.question)}</h3><p>${esc(plain(x.answer).slice(0, 140))}…</p></a>`).join('')}</div>` : `<p class="muted">${esc(t('The first answers will appear here soon.'))}</p>`}</section>`;
    await render(res, { path: '/ask', title: t('Ask the Rabbi: questions and answers'), description: t('Questions about Judaism and Jewish life answered by Rabbi Yisroel Labkowski of Chabad of Lamorinda in Lafayette, California.'), body, ld: list.length ? [faqLd(list.slice(0, 50).map((x) => ({ q: x.question, a: x.answer })))] : [] });
  }));
  r.get('/ask/:slug', wrap(async (req, res, next) => {
    if (!pool) return next();
    const X = ctxOf(req), t = X.t, x = (await q('SELECT * FROM qa WHERE slug=$1 AND published_at IS NOT NULL', [req.params.slug])).rows[0];
    if (!x) return next();
    const body = `<article class="wrap sec narrow"><p class="crumbs"><a href="/ask">${esc(t('Ask the Rabbi'))}</a> ›</p>
<h1 lang="${x.lang}">${esc(x.question)}</h1><div lang="${x.lang}">${md(x.answer)}</div>
<p class="muted">${esc(t('Answered by Rabbi Yisroel Labkowski'))} · ${esc(X.longDate(new Date(x.published_at).toISOString().slice(0, 10)))}</p>
<p class="btns"><a class="btn gold" href="/help/talk-to-the-rabbi">${esc(t('Ask your own question'))}</a><a class="btn ghost" href="/ask">${esc(t('More questions and answers'))}</a></p></article>`;
    await render(res, { path: '/ask/' + x.slug, title: x.question, description: plain(x.answer).slice(0, 155), body,
      ld: [faqLd([{ q: x.question, a: x.answer }]), crumbs(base, [[t('Ask the Rabbi'), '/ask'], [x.question, '/ask/' + x.slug]])] });
  }));

  return {
    published,
    mountAdmin(r2, { authed, wrap: w }) {
      if (!pool) return;
      r2.get('/api/site/qa', authed, w(async (req, res) => res.json({ items: (await q('SELECT * FROM qa ORDER BY created_at DESC LIMIT 300')).rows })));
      // Publish (or update) an answer. The Rabbi writes the question as it should appear publicly.
      r2.post('/api/site/qa', authed, express.json({ limit: '32kb' }), w(async (req, res) => {
        const b = req.body || {}, question = String(b.question || '').trim().slice(0, 300), answer = String(b.answer || '').trim().slice(0, 8000), lang = ['he', 'ru'].includes(b.lang) ? b.lang : 'en';
        if (!question || !answer) return res.status(400).json({ code: 'invalid', error: 'Please write the question and the answer.' });
        let slug = slugify(question);
        if ((await q('SELECT 1 FROM qa WHERE slug=$1 AND id<>$2', [slug, String(b.id || '')])).rowCount) slug += '-' + crypto.randomBytes(2).toString('hex');
        const id = b.id ? String(b.id).slice(0, 40) : 'q_' + crypto.randomBytes(10).toString('hex');
        await q(`INSERT INTO qa (id, slug, question, answer, lang, published_at) VALUES ($1,$2,$3,$4,$5, CASE WHEN $6 THEN now() ELSE NULL END)
          ON CONFLICT (id) DO UPDATE SET question=EXCLUDED.question, answer=EXCLUDED.answer, lang=EXCLUDED.lang, published_at=CASE WHEN $6 THEN COALESCE(qa.published_at, now()) ELSE NULL END`, [id, slug, question, answer, lang, b.publish !== false]);
        res.json({ ok: true, id, url: `${base}${lang === 'en' ? '' : '/' + lang}/ask/${slug}` });
      }));
      r2.post('/api/site/qa/:id/unpublish', authed, w(async (req, res) => { await q('UPDATE qa SET published_at=NULL WHERE id=$1', [req.params.id]); res.json({ ok: true }); }));
    },
  };
}
module.exports = { mountAsk, slugify };
