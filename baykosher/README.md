# Bay Kosher: online store, back office, order picking, delivery

A replacement for the MyKosherGrocer site. Node + Postgres + Stripe, same stack as the My Pushka app in this repo. No build step.

## Try it now (nothing is charged or sent)
```
cd baykosher && npm install && npm run dev
```
Opens a throwaway database with demo products: store at `/` (Hebrew at `/he`), back office `/admin` (password `demo-password-123`), packer screen `/pick` (PIN `1234`). `npm test` runs 49 tests against a real Postgres.

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
| Hebrew: every customer page, email and text, right-to-left, `/he/` URLs with hreflang for Google, Hebrew product names and descriptions, search by Hebrew or English word | Done (translations should be proofread by a native speaker; `server/he.json`) |
| Meat sold as packs of an average weight priced per lb ("2 x 1.90 lb pack"): customer orders packs, packer weighs, customer pays the exact weight | Done |
| Coupons: % or $ off, "first / second / third order only", minimum order, dates; recalculated on what was packed | Done |
| Staff accounts: personal PINs, roles (shopper, cashier, data entry, manager), every action carries a name, activity log, hold / take over an order | Done |
| Order manager: filters (period, search, service), totals, Excel/CSV export, card capture / release by hand, resend confirmation, order history, box counts | Done |
| Items-to-pick totals across orders (for butchers / departments), customers list with CSV, stock reports from packers, banners, featured products, bulk edit, product import from a spreadsheet | Done |
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

## Passover, dairy/meat and holidays
* Every product has **Meat / Dairy / Pareve** and **Kosher for Passover: Yes / No / Not decided**. Only **Yes** ever appears under the customer's "Kosher for Passover only" switch, and nothing is set to Yes automatically: names like "matzah" or a label that mentions Passover only put an item on the **Passover: suggested (confirm)** list in the back office. Confirm in bulk with "Kosher for Passover: YES".
* The switch appears in the weeks before Pesach (Settings > Holidays: automatic / always / never) and filters every page, search and suggestion.
* Holiday pages (`/holiday/pesach`, Rosh Hashana, Sukkot, Chanukah, Tu BiShvat, Purim, Shavuot) list items tagged for that holiday (Pesach also lists Passover-certified items). Dates come from the Hebrew calendar automatically. A holiday gets a link in the top menu during its lead-up (Pesach 45 days).

## Your inventory app (baykosher-inventory.onrender.com)
That app already reads supplier invoices, tracks costs and freight, flags Passover and syncs Clover. The new site should take its products from it rather than redo that work: in the inventory app download **Products CSV** and use **Back office > Products > Import from spreadsheet** here (columns recognized: name, upc, sku, category, brand, supplier, supplier_sku, case_size, cost, price, stock, kosher_passover, snap, taxable, active, est weight, sold by). Tick "Create departments that do not exist yet" the first time. Running the import again updates items by barcode instead of duplicating.

## Photos
Product photos are copied into our own database and served from `/img/...` (Back office > Products > "Copy photos to our storage", and automatically 10 at a time every 10 minutes). Only https images, never internal addresses, no SVG, 6 MB max.

## Accounts
Customers sign in with a password or an emailed code. A new password only takes effect after the emailed code proves the email is theirs.

## Google (what the code does, and what only you can do)
Done in code: fast server-rendered pages; unique title/description per page; canonical + English/Hebrew hreflang; sitemap with all products, departments, holidays, cities and FAQ; structured data (GroceryStore with hours, Product with price and stock, Breadcrumb, ItemList, FAQPage); a page per city you serve (`/areas/orinda` ...) whose text comes from real distances and your live delivery prices; holiday pages; `robots.txt`. Nobody can promise a #1 ranking. What moves it most, and only you can do:
1. Claim and complete the **Google Business Profile** for 3477 Golden Gate Way (category *Kosher grocery store*, hours, photos, link to the site). This drives most "kosher near me" results.
2. Add the site in **Google Search Console** and submit `https://baykosher.com/sitemap.xml`.
3. Ask happy customers for Google reviews.
4. Keep the name, address and phone identical everywhere (Google, Yelp, Chabad.org, Facebook, the Chabad of Lamorinda site) and link to baykosher.com from them.
5. Real product photos, descriptions and ingredients on every item (thin pages rank poorly).
6. When switching from MyKosherGrocer, redirect old product/category URLs so existing rankings carry over.
