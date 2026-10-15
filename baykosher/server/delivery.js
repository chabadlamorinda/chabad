// Delivery pricing (by distance, free over a basket threshold), geocoding and Uber Direct.
// NOTE: the Uber Direct calls follow Uber's public docs but have not been run against live credentials;
// test with Uber's sandbox/test-mode first.
'use strict';

function miles(a, b) {
  const R = 3958.8, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// tiers: [{max_miles, fee_cents, free_over_cents}] ascending; beyond the last tier we do not deliver.
function deliveryFee(distanceMiles, subtotalCents, tiers) {
  const t = tiers.find((x) => distanceMiles <= x.max_miles);
  if (!t) return { deliverable: false, fee_cents: 0, reason: 'Outside our delivery area' };
  const free = t.free_over_cents != null && subtotalCents >= t.free_over_cents;
  return { deliverable: true, fee_cents: free ? 0 : t.fee_cents, free, free_over_cents: t.free_over_cents, tier_max_miles: t.max_miles };
}

function createGeocoder(fetchImpl = globalThis.fetch, env = process.env) {
  return {
    async geocode(addr) {
      const text = `${addr.street}, ${addr.city}, ${addr.state || 'CA'} ${addr.zip || ''}`;
      if (env.GOOGLE_MAPS_KEY) {
        const r = await fetchImpl('https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(text) + '&key=' + env.GOOGLE_MAPS_KEY);
        const j = await r.json(); const g = j.results && j.results[0];
        return g ? { lat: g.geometry.location.lat, lng: g.geometry.location.lng } : null;
      }
      const r = await fetchImpl('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(text), { headers: { 'User-Agent': 'BayKosher/1.0 (baykosher.com)' } });
      const j = await r.json();
      return j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
    },
  };
}

function createUber({ clientId, clientSecret, customerId, fetchImpl = globalThis.fetch }) {
  let tok = null, exp = 0;
  const token = async () => {
    if (tok && Date.now() < exp) return tok;
    const r = await fetchImpl('https://auth.uber.com/oauth/v2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials', scope: 'eats.deliveries' }) });
    if (!r.ok) throw new Error('Uber auth ' + r.status);
    const j = await r.json(); tok = j.access_token; exp = Date.now() + (j.expires_in - 60) * 1000; return tok;
  };
  const call = async (path, body) => {
    const r = await fetchImpl(`https://api.uber.com/v1/customers/${customerId}${path}`, { method: 'POST', headers: { Authorization: 'Bearer ' + (await token()), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('Uber ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return r.json();
  };
  const addr = (a) => JSON.stringify({ street_address: [a.street, a.unit].filter(Boolean), city: a.city, state: a.state || 'CA', zip_code: a.zip, country: 'US' });
  return {
    kind: 'uber',
    async quote({ pickup, dropoff }) { const j = await call('/delivery_quotes', { pickup_address: addr(pickup), dropoff_address: addr(dropoff) }); return { id: j.id, fee_cents: j.fee, eta_minutes: j.duration }; },
    async create({ quote_id, pickup, dropoff, items, order_id, ready_by }) {
      const j = await call('/deliveries', {
        quote_id, pickup_name: pickup.name, pickup_address: addr(pickup), pickup_phone_number: pickup.phone,
        dropoff_name: dropoff.name, dropoff_address: addr(dropoff), dropoff_phone_number: dropoff.phone, dropoff_notes: dropoff.notes || '',
        manifest_items: items.map((i) => ({ name: i.name, quantity: Math.max(1, Math.round(i.qty)) })), external_id: 'order-' + order_id,
        pickup_ready_dt: ready_by || undefined,
      });
      return { id: j.id, tracking_url: j.tracking_url, status: j.status };
    },
  };
}

function fakeUber() {
  const created = [];
  return { kind: 'fake', created, async quote() { return { id: 'q_fake', fee_cents: 899, eta_minutes: 35 }; }, async create(a) { created.push(a); return { id: 'dlv_fake_' + created.length, tracking_url: 'https://example.test/track/' + created.length, status: 'pending' }; } };
}

module.exports = { miles, deliveryFee, createGeocoder, createUber, fakeUber };
