# What to build next (in order)
1. **Go-live verification**: Clover sandbox, Uber test mode, real Stripe test payments, real Resend/Twilio sends. Fix whatever the real services reveal.
2. **Bulk import** of the current catalog (CSV from MyKosherGrocer/Clover), filling photos, ingredients and nutrition from barcodes in batch.
3. **Image hosting**: copy product photos to your own storage and resize.
4. **301 redirects** from current baykosher.com URLs.
5. **EBT/SNAP online** via a separate processor.
6. **Phone app**: the site is installable (PWA); a store-listed wrapper can reuse `android/` from My Pushka.
7. **Push notifications** for ready / cart reminders (reuse My Pushka's web-push code).
8. **Easier shopping ideas**: saved lists and one-tap "Shabbos box" bundles; "Reorder last order" on the home page; Apple/Google Pay button on the cart (Stripe Express Checkout); pre-Shabbos/Yom Tov order cutoff banner; Pesach filter and Hebrew search aliases; per-item notes (thin slice, ripe); back-in-stock alerts; printable pick tickets.
