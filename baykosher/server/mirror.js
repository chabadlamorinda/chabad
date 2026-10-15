// Copies product photos from other websites into our own storage so they never disappear or slow the site.
// Safety: only https, no private/internal addresses (also checked on every redirect), images only, size capped,
// SVG refused (it can carry scripts), and the file's real type is checked from its first bytes.
'use strict';
const dns = require('dns').promises, net = require('net'), crypto = require('crypto');

function isPrivateIp(ip) {
  if (net.isIPv6(ip)) { const x = ip.toLowerCase(); return x === '::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:127.') || x.startsWith('::ffff:10.') || x.startsWith('::ffff:192.168.') || x === '::'; }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
const sniff = (b) => (b.length > 12 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG' ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b.toString('latin1', 0, 3) === 'GIF' ? 'image/gif' : b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' ? 'image/webp' : null);

function createMirror(db, { fetchImpl = globalThis.fetch, lookup = (h) => dns.lookup(h, { all: true }), allowPrivate = false, maxBytes = 6 * 1024 * 1024, timeoutMs = 15000 } = {}) {
  async function guard(u) {
    if (u.protocol !== 'https:' && !allowPrivate) throw new Error('only https links');
    if (!allowPrivate) {
      const addrs = net.isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname);
      if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('address not allowed');
    }
  }
  async function download(url) {
    let u = new URL(url);
    for (let hop = 0; hop < 4; hop++) {
      await guard(u);
      const r = await fetchImpl(u.href, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'BayKosher/1.0 (+https://baykosher.com)', Accept: 'image/*' } });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location'), u); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const len = Number(r.headers.get('content-length') || 0);
      if (len > maxBytes) throw new Error('image too large');
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > maxBytes) throw new Error('image too large');
      const type = sniff(buf);
      if (!type) throw new Error('not a PNG, JPEG, GIF or WebP image');
      return { buf, type };
    }
    throw new Error('too many redirects');
  }
  // returns "/img/<hash>"
  async function mirrorUrl(url) {
    if (/^\/img\/[a-f0-9]{64}$/.test(url)) return url;
    const { buf, type } = await download(url);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    await db.q('INSERT INTO images (hash, content_type, data, source_url) VALUES ($1,$2,$3,$4) ON CONFLICT (hash) DO NOTHING', [hash, type, buf, String(url).slice(0, 500)]);
    return '/img/' + hash;
  }
  async function pending() { return (await db.one(`SELECT count(*)::int n FROM products WHERE image_url ~ '^https?://'`)).n; }
  // copy up to `limit` products' photos; products whose photo cannot be fetched keep their old link and are reported
  async function run(limit = 25) {
    const rows = await db.rows(`SELECT id, name, image_url FROM products WHERE image_url ~ '^https?://' AND NOT EXISTS (SELECT 1 FROM sync_log WHERE kind = 'mirror_fail:' || products.id AND created_at > now() - interval '7 days') ORDER BY id LIMIT $1`, [limit]);
    const out = { done: 0, failed: [] };
    for (const p of rows) {
      try { const local = await mirrorUrl(p.image_url); await db.q('UPDATE products SET image_url=$2, updated_at=now() WHERE id=$1', [p.id, local]); out.done++; }
      catch (e) { out.failed.push({ id: p.id, name: p.name, url: p.image_url, error: e.message }); await db.q('INSERT INTO sync_log (kind, summary) VALUES ($1,$2)', ['mirror_fail:' + p.id, { error: e.message }]); }
    }
    out.remaining = await pending();
    return out;
  }
  return { mirrorUrl, run, pending, isPrivateIp };
}

module.exports = { createMirror, isPrivateIp, sniff };
