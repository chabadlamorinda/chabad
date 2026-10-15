# Bay Kosher: online store, back office, order picking, delivery

A replacement for the MyKosherGrocer site. Node + Postgres + Stripe, same stack as the My Pushka app in this repo. No build step.

## Try it now (nothing is charged or sent)
```
cd baykosher && npm install && npm run dev
```
Opens a throwaway database with demo products: store at `/`, back office `/admin` (password `demo-password-123`), packer screen `/pick` (PIN `1234`). `npm test` runs 29 tests against a real Postgres.

## What is built
| Area | Status |
|---|---|
| Catalog: per-item or per-lb, 12 departments, supplier, cost, photos, ingredients, nutrition | Done |
| Typo-tolerant search and typeahead (hallah/chalah, matzo/matzah, misspellings, barcode) | Done |
| Sales by % off, "% over my cost", or fixed price, by everything / department / supplier / brand / products, with dates, preview and never-below-cost guard | Done |
| Invoices: paste CSV/Excel lines, match by barcode, shipping spread into real cost, stock added, price from supplier markup | Done |
| Supplier markup with preview-then-apply repricing, price lock per product | Done |
| Barcode lookup (Open Food Facts, UPCitemdb) for name, size, ingredients, nutrition, photo | Written; needs a live-network check |
| Clover sync (stock, price either direction, unknown items arrive hidden) | Written, **not yet tested against a real Clover account** |
| Storefront: search, departments, sales, buy again, similar / bought together, sticky cart, saved details | Done |
| Checkout: pickup slots (hours, lead time, capacity, up to 30 days ahead), Uber delivery with distance fee + free threshold, co-op drops | Done |
| Payment: card held at checkout, exact amount charged after picking, extra charged to the same card if the total grows, flagged if that fails | Done with Stripe; Apple/Google Pay appear in Stripe's payment form |
| Packer screen (phone): scan or tap, weigh, substitute (honors the customer's choice, forces a call when requested), not in stock, add item; cannot finish until every item is answered | Done |
| Ready notification (email, text) with receipt of what was / wasn't in stock | Done; needs Resend / Twilio keys |
| Abandoned-cart reminder (text if consented, else email), 2 reminders max | Done; needs keys |
| Weekly email from current sales + new items, unsubscribe | Done; needs Resend key |
| Reorder suggestions from sell rate and days of stock left | Done |
| SEO: server-rendered pages, sitemap, robots, Schema.org (GroceryStore, Product, Breadcrumb), canonical | Done |
| Uber Direct dispatch | Written, **not yet tested against real Uber credentials** |

## Go live checklist
1. Create a **new** Render web service for `baykosher/` (root directory `baykosher`, build `npm install --omit=dev`, start `node server/index.js`) and a Postgres database. `render.yaml` is intentionally untouched so nothing existing changes.
2. Environment variables: `DATABASE_URL`, `SESSION_SECRET` (random), `ADMIN_PASSWORD` (12+ chars), `PICKER_PIN`, `PUBLIC_URL` (https://baykosher.com), `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` (endpoint `/api/stripe/webhook`, event `payment_intent.amount_capturable_updated`), `RESEND_API_KEY` + `EMAIL_FROM`, `TWILIO_SID`/`TWILIO_TOKEN`/`TWILIO_FROM`, `CLOVER_MERCHANT_ID` + `CLOVER_TOKEN`, `UBER_CLIENT_ID`/`UBER_CLIENT_SECRET`/`UBER_CUSTOMER_ID`, optional `GOOGLE_MAPS_KEY`.
3. Test Clover against its sandbox (`CLOVER_BASE=https://apisandbox.dev.clover.com`) before the real store; test Uber in Uber's test mode.
4. Test with Stripe test keys, then switch to live keys.
5. Point `baykosher.com` at the new service **last**, after a week of real test orders. Keep MyKosherGrocer running until then, and redirect old product/category URLs to protect your Google ranking.

## Things to decide or check
* **SNAP/EBT**: Stripe does not accept EBT. Online EBT needs a separate processor (e.g. Forage) and USDA approval. Treat as phase 2; in-store EBT via Clover is unaffected.
* **Sales tax**: CA grocery food is exempt; only products marked *taxable* (household, beauty, some Judaica) are taxed. Confirm the rate and items with your accountant.
* **Texting customers** requires consent. The checkout opt-in is unchecked by default; keep it that way.
* **Product photos** are linked from Open Food Facts / UPCitemdb. Copy them to your own storage (phase 2) so they never disappear.
* **In-app push notifications**: not built yet. Email and text work now.

See `ROADMAP.md` for what to build next.
