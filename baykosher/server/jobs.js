// Background jobs: abandoned-cart reminders and stale unpaid orders.
'use strict';
const { esc, money } = require('./core');

function createJobs({ db, settings, core, notifier, publicUrl = '' }) {
  async function abandonedCarts() {
    const cfg = (await settings.all()).abandoned;
    // first reminder after N minutes idle; later ones after N hours since the last reminder
    const due = await db.rows(`SELECT * FROM carts WHERE NOT completed AND jsonb_array_length(items) > 0 AND (email <> '' OR phone <> '') AND reminders_sent < $1
      AND ((reminders_sent = 0 AND updated_at < now() - ($2 || ' minutes')::interval)
        OR (reminders_sent > 0 AND last_reminded_at < now() - ($3 || ' hours')::interval AND updated_at > now() - interval '7 days'))`,
      [cfg.max_reminders, String(cfg.first_after_minutes), String(cfg.second_after_hours)]);
    let sent = 0;
    for (const c of due) {
      // skip if they have since placed an order
      if (c.customer_id && (await db.one(`SELECT 1 FROM orders WHERE customer_id=$1 AND created_at > $2 AND status <> 'cancelled'`, [c.customer_id, c.updated_at]))) { await db.q('UPDATE carts SET completed=TRUE WHERE id=$1', [c.id]); continue; }
      const { lines } = await core.priceCart(c.items);
      if (!lines.length) { await db.q('UPDATE carts SET completed=TRUE WHERE id=$1', [c.id]); continue; }
      const total = lines.reduce((a, l) => a + l.line_cents, 0);
      const link = `${publicUrl}/cart/resume/${c.id}`;
      const names = lines.slice(0, 3).map((l) => l.name).join(', ') + (lines.length > 3 ? ` and ${lines.length - 3} more` : '');
      let ok = false;
      if (c.phone && c.sms_ok) ok = await notifier.sms(c.phone, `Bay Kosher: you left ${names} in your cart (${money(total)}). Finish your order: ${link} Reply STOP to opt out.`);
      if (c.email && (!ok)) ok = await notifier.email(c.email, 'You left something in your cart', `<p>You left these in your Bay Kosher cart: ${esc(names)} (${money(total)}).</p><p><a href="${link}" style="background:#00209f;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Finish my order</a></p>`);
      // count the attempt even if providers are not configured, so we never spam when they come online
      await db.q('UPDATE carts SET reminders_sent = reminders_sent + 1, last_reminded_at = now() WHERE id=$1', [c.id]);
      if (ok) sent++;
    }
    return { due: due.length, sent };
  }
  let timers = [];
  return {
    abandonedCarts,
    start() {
      const safe = (fn) => () => fn().catch((e) => console.error('job failed', e.message));
      timers = [setInterval(safe(abandonedCarts), 5 * 60000), setInterval(safe(() => core.cancelStale()), 10 * 60000)];
      timers.forEach((t) => t.unref());
    },
    stop() { timers.forEach(clearInterval); timers = []; },
  };
}

module.exports = { createJobs };
