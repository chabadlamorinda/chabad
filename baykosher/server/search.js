// Typo-tolerant product search held in memory (a few thousand products is tiny).
// Handles misspellings (edit distance), sounds-alike spellings common in kosher shopping
// (challah / chalah / hallah, matzo / matzah / matza, humus / hummus), prefixes, and word order.
'use strict';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9֐-׿ ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Sounds-alike key: drop vowels after the first letter, fold common digraphs, collapse repeats.
function skeleton(w) {
  let s = w.replace(/ch|kh|h/g, 'h').replace(/tz|ts/g, 'z').replace(/ph/g, 'f').replace(/ck|c|q/g, 'k').replace(/w/g, 'v');
  if (s.length > 3) s = s.replace(/h$/, '');
  s = s[0] + s.slice(1).replace(/[aeiouy]/g, '');
  return s.replace(/(.)\1+/g, '$1');
}

// Optimal-string-alignment distance with early exit.
function dist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = [];
  for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

function createIndex() {
  let docs = [];
  return {
    build(products) {
      docs = products.map((p) => {
        const nameToks = norm(p.name).split(' ').filter(Boolean);
        const extra = norm([p.brand, p.category_name, p.tags, p.upc].join(' ')).split(' ').filter(Boolean);
        return { id: p.id, upc: String(p.upc || ''), name: norm(p.name), nameToks, extraToks: extra, skel: nameToks.map(skeleton), skelExtra: extra.map(skeleton), inStock: p.track_stock ? Number(p.stock) > 0 : true };
      });
    },
    size: () => docs.length,
    // returns [{id, score}] best first
    search(query, limit = 40) {
      const q = norm(query);
      if (!q) return [];
      if (/^\d{8,14}$/.test(q)) return docs.filter((d) => d.upc === q || d.upc.endsWith(q)).slice(0, limit).map((d) => ({ id: d.id, score: 100 }));
      const qt = q.split(' ');
      const out = [];
      for (const d of docs) {
        let total = 0, matched = 0;
        for (const t of qt) {
          const sk = skeleton(t);
          let best = 0;
          const test = (toks, skels, weight) => {
            for (let i = 0; i < toks.length; i++) {
              const w = toks[i];
              let s = 0;
              if (w === t) s = 10;
              else if (w.startsWith(t) && t.length >= 2) s = 8 - Math.min(2, (w.length - t.length) / 4);
              else if (t.length >= 4 && dist(t, w, t.length >= 7 ? 2 : 1) <= (t.length >= 7 ? 2 : 1)) s = 6;
              else if (t.length >= 3 && skels[i] === sk) s = 5;
              else if (t.length >= 3 && w.length > t.length && w.includes(t)) s = 3;
              if (s * weight > best) best = s * weight;
            }
          };
          test(d.nameToks, d.skel, 1);
          test(d.extraToks, d.skelExtra, 0.6);
          if (best > 0) { matched++; total += best; }
        }
        // every typed word must match something (so "chicken soup" does not return all soup)
        if (matched < qt.length) continue;
        let score = total / qt.length;
        if (d.name.startsWith(q)) score += 3;
        else if (d.name.includes(q)) score += 1.5;
        if (!d.inStock) score -= 2;
        out.push({ id: d.id, score });
      }
      return out.sort((a, b) => b.score - a.score).slice(0, limit);
    },
    // fast typeahead: product names and words that start with the typed text
    suggest(prefix, limit = 8) {
      const q = norm(prefix);
      if (q.length < 2) return [];
      const seen = new Set(), res = [];
      for (const d of docs) {
        if (d.name.startsWith(q) || d.nameToks.some((w) => w.startsWith(q))) {
          if (!seen.has(d.id)) { seen.add(d.id); res.push(d.id); if (res.length >= limit) break; }
        }
      }
      return res;
    },
  };
}

module.exports = { norm, skeleton, dist, createIndex };
