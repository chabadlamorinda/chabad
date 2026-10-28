# Putting My Pushka on Google Play: step by step

The Android app is a thin shell around the live website (a "Trusted Web Activity"). Whenever the website updates, the Android app updates with it, with no new store release needed.

## What is already done in this repository
- Installable web app: manifest, icons (including the Android adaptive icon), offline support. Verified in Chrome.
- Privacy policy (English and Hebrew) at `/pushka/privacy.html`, support page at `/pushka/support.html`.
- The verification file Google checks, at `/.well-known/assetlinks.json` (filled in from the `ANDROID_SHA256` setting in Render).
- Store assets in `store/android/`: 512 icon, 1024x500 feature graphic, 7 phone screenshots (1080x2160).
- Listing text in English and Hebrew: `store/listing.md`.

## Your steps

### 1. Start now (these take days)
1. **D-U-N-S number** for Chabad of Lamorinda (free): https://www.dnb.com/duns/get-a-duns.html. Google and Apple both use it to verify an organization.
2. **Google Play Console organization account**: https://play.google.com/console (one-time $25). Choose "Organization", use the D-U-N-S number and the organization's legal details.
3. For iPhone later: apply for Apple's nonprofit fee waiver (developer.apple.com, "Fee waivers").

### 2. Before building: make the address final
The Android app is tied to one web address. Finish these first, or the app will need rebuilding:
- Connect your final subdomain (for example `pushka.chabadoflamorinda.com`, see README).
- Add the **live** Stripe keys and run one real test gift.

### 3. Build the Android package (no software to install)
1. Go to **https://www.pwabuilder.com**, enter `https://<your-subdomain>/pushka/`, press Start. You should see green checks for the manifest and service worker.
2. Choose **Package for stores → Android**. Use:
   - Package ID: `com.chabadoflamorinda.pushka`
   - App name: `My Pushka · Chabad of Lamorinda`, short name: `My Pushka`
   - Signing key: **Create new**. **Download the zip and keep the keystore file and password somewhere safe; if they are lost you cannot update the app.**
   - Notification delegation: on. Play Billing: off. Location: off.
3. Download the zip. It contains the `.aab` file to upload.
   (Engineers can instead use Bubblewrap with `android/twa-manifest.json`.)

### 4. Upload and connect the website
1. In Play Console create the app (name, English, App, Free) and open **Testing → Internal testing → Create release**. Upload the `.aab`.
2. Turn on **Play App Signing** if asked. Then open **Test and release → App integrity → App signing** and copy the **SHA-256 certificate fingerprint**.
3. In Render → chabad-lamorinda-app → Environment, set `ANDROID_SHA256` to that fingerprint (you may add the upload-key fingerprint from PWABuilder after a comma). Save.
4. Open `https://<your-subdomain>/.well-known/assetlinks.json`. It should now show your fingerprint. This is what removes the browser address bar so the app looks fully native.

### 5. Fill in the store listing
Use `store/listing.md` for the text, and the images in `store/android/`. Complete: Data safety, Content rating, Target audience (18+), Ads (none), Financial features (charitable donations), and the privacy policy URL.

### 6. Test, then publish
1. Add your own email as an internal tester, install from the link, and try a gift.
2. Create a **Production** release and submit. Review usually takes from a few hours to a few days.
3. Organization accounts are generally exempt from the "20 testers for 14 days" rule that applies to new personal accounts. Confirm in Play Console.

## If Google asks questions
- *Why does the app take donations?* Charitable donations to a registered 501(c)(3) (Tax ID 47-4642750), processed by Stripe.
- *Where is account deletion?* More → Profile → Delete account, and by email to rabbi@chabadoflamorinda.com.
