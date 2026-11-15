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
      const lvl = Math.min(Math.max(m[1].length, 2), 5), id = m[2].toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section';
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
  return ltr(out.join('\n'));
}
// Phone numbers and "501(c)(3)" read left to right and never break, also inside Hebrew text (only in text, not tags).
const ltr = (html) => String(html).replace(/>([^<]+)</g, (m, txt) => '>' + txt.replace(/(\+?1[ -])?\b\d{3}-\d{3}-\d{4}\b|501\(c\)\(3\)/g, (x) => `<bdi dir="ltr" class="nw">${x}</bdi>`) + '<');
// Plain text (for meta descriptions, llms.txt, JSON-LD).
const plain = (src) => String(src || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*_`]/g, '').replace(/\s+/g, ' ').trim();

// "---\nkey: value\n---\nbody" front matter (values are plain strings; lists as comma-separated).
// A value written in quotes (title: "A \"Tree\"...") loses the quotes, as YAML would.
function unquote(v) {
  if (v.length > 1 && v[0] === '"' && v[v.length - 1] === '"') { try { return JSON.parse(v); } catch (e) { return v.slice(1, -1).replace(/\\"/g, '"'); } }
  if (v.length > 1 && v[0] === "'" && v[v.length - 1] === "'") return v.slice(1, -1).replace(/''/g, "'");
  return v;
}
function frontMatter(src) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(String(src).replace(/\r\n?/g, '\n'));
  if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const l of m[1].split('\n')) { const i = l.indexOf(':'); if (i > 0) meta[l.slice(0, i).trim()] = unquote(l.slice(i + 1).trim()); }
  return { meta, body: m[2] };
}

// The same for plain text that is about to be escaped (the legal line, a phone in a sentence).
const escLtr = (s) => ltr('>' + esc(s) + '<').slice(1, -1);
// "Ask the Rabbi" in the text becomes a link to /help/talk-to-the-rabbi, where the reader can call or message Rabbi Yisroel
// Labkowski or Rebbetzin Tzipora Labkowski. Skips links, headings, scripts. For pages only (not emails).
const ASK = /\b[Aa]sk the (?:Rabbi|Rebbetzin)(?: or (?:the )?Rebbetzin)?|שאל(?:ו|י)? את (?:הרב|הרבנית)(?: או (?:את )?הרבנית)?|[Сс]просите (?:у )?(?:раввина|ребецин)(?: или (?:у )?ребецин)?|[Оо]братитесь к (?:раввину|ребецин)/g;
function askRabbi(html, title, href) {
  let depth = 0;
  return String(html || '').split(/(<[^>]+>)/).map((part) => {
    if (part[0] === '<') {
      if (/^<(a|h[1-6]|script|style|button)\b/i.test(part)) depth++;
      else if (/^<\/(a|h[1-6]|script|style|button)>/i.test(part)) depth = Math.max(0, depth - 1);
      return part;
    }
    return depth ? part : part.replace(ASK, (m) => `<a class="ask-rabbi" href="${esc(href || '/help/talk-to-the-rabbi')}" title="${esc(title || 'Call or message the Rabbi or Rebbetzin')}">${m}</a>`);
  }).join('');
}

module.exports = { askRabbi, md, inline, esc, plain, frontMatter, safeUrl, ltr, escLtr };
