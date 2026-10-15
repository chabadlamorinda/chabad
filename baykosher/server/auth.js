// Signed tokens (HMAC) for customers (email-code login) and staff (admin password / picker PIN).
'use strict';
const crypto = require('crypto');

function createAuth(secret) {
  const sign = (payload, ttlSeconds) => {
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
    return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url');
  };
  const verify = (token) => {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [body, mac] = token.split('.');
    const good = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    const a = Buffer.from(mac), b = Buffer.from(good);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() / 1000 ? p : null; } catch { return null; }
  };
  const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  const cookie = (req, name) => { const m = String(req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '=')); return m ? decodeURIComponent(m.slice(name.length + 1)) : null; };
  return { sign, verify, same, cookie, token: (n = 24) => crypto.randomBytes(n).toString('hex') };
}

// Small in-memory rate limiter (per key, per window) for login and lookup endpoints.
function rateLimiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now(), h = (hits.get(key) || []).filter((t) => now - t < windowMs);
    h.push(now); hits.set(key, h);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return h.length <= max;
  };
}

module.exports = { createAuth, rateLimiter };
