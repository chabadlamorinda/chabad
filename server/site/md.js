// A small, safe Markdown renderer for the website's content files (headings, paragraphs, lists,
// quotes, bold/italic, links, images, horizontal rules). Raw HTML in content is escaped, never run.
'use strict';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeUrl = (u) => (/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(u) ? u : '#');

function inline(text) {
  let s = esc(text);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => `<img src="${safeUrl(url)}" alt="${alt}" loading="lazy" decoding="async">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const u = safeUrl(url), ext = /^https?:/i.test(u);
    return `<a href="${u}"${ext ? ' rel="noopener" target="_blank"' : ''}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s;
}

function md(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n'), out = [];
  let para = [], list = null;
  const flushPara = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>` + list.items.map((i) => '<li>' + inline(i) + '</li>').join('') + `</${list.tag}>`); list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) {
      flushPara(); flushList();
      const lvl = Math.min(Math.max(m[1].length, 2), 5), id = m[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      out.push(`<h${lvl} id="${id}">${inline(m[2])}</h${lvl}>`); continue;
    }
    if (/^---+$/.test(line)) { flushPara(); flushList(); out.push('<hr>'); continue; }
    if ((m = /^>\s?(.*)$/.exec(line))) { flushPara(); flushList(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); continue; }
    if ((m = /^\s*[-*]\s+(.*)$/.exec(line)) || (m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      flushPara();
      const tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push(m[1]); continue;
    }
    flushList(); para.push(line.trim());
  }
  flushPara(); flushList();
  return out.join('\n');
}
// Plain text (for meta descriptions, llms.txt, JSON-LD).
const plain = (src) => String(src || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*_`]/g, '').replace(/\s+/g, ' ').trim();

// "---\nkey: value\n---\nbody" front matter (values are plain strings; lists as comma-separated).
function frontMatter(src) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(String(src).replace(/\r\n?/g, '\n'));
  if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const l of m[1].split('\n')) { const i = l.indexOf(':'); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
  return { meta, body: m[2] };
}

module.exports = { md, inline, esc, plain, frontMatter, safeUrl };
