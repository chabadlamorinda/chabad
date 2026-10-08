# Bay Kosher Market inventory

One app for running the store's stock:

* **One stock number for everything.** Every sale at the Clover register and every paid order on the website (My Cloud Grocer) comes off the same count. The combined number goes back to Clover every 10 minutes and to the website every hour.
* **Order lists for each supplier.** The app knows which days you order from each supplier and how long delivery takes. It tells you what to buy, how many cases, and on which day. You can copy, email, print or download each list, then mark it as ordered.
* **How fast things sell.** Each item shows its sales per week, days of stock left, and when it will run out. Recent weeks count more, so new favorites and slowdowns show up quickly.
* **Prices from your invoices.** Supplier invoices that arrive by email (PDF, photo, or the email itself) are read automatically. Shipping charges are spread over the items on that delivery, so each item's cost includes its share of freight. When a cost goes up, the Prices page suggests a new shelf price that keeps your margin. Approved prices go to Clover right away and to the website with the next update.
* **Easy counting.** With a barcode scanner (or by typing), count shelves or receive deliveries item by item.

## Try it with sample data

```
cd inventory
npm install
npm run demo        # open http://localhost:3100 and sign in with: demo1234
```

## How it works

Stock is a ledger. Every change is one line: a Clover sale, a web order, a delivery, a count, a damaged item. The stock number is the total of those lines. The app reads sales from Clover and the website and remembers each one, so a sale is never counted twice. It then sends its own number back out. Neither Clover's count nor the website's count is treated as the truth.

**Going live:** the first time the app connects to Clover, it takes Clover's current stock as the starting count. It also reads 8 weeks of past sales from Clover and the website. That history is only used to work out sales speed. It does not subtract from stock, because the starting count already reflects those sales. **Do a full shelf count soon after going live** (Products → Count / receive) to start from accurate numbers.

## Turning it on (one time)

Everything is set in Render: **Dashboard → baykosher-inventory → Environment**. Never put these passwords in the code or in email.

### 1. Hosting
`render.yaml` describes the service. In Render, choose **New → Blueprint** (or sync the existing Blueprint) to create **baykosher-inventory**. It uses the **Starter** plan ($7/month) plus a 1 GB disk (about $0.25/month). It has to stay awake to sync all day, and the disk keeps the data. Set:
* `APP_PASSWORD`: the password you will sign in with (pick a strong one).

### 2. Clover
1. In the Clover web dashboard: **Account & Setup → API Tokens → Create new token**. Give it **Inventory: Read and Write** and **Orders: Read**.
2. Your Merchant ID is on **Account & Setup → Merchants** (13 letters/numbers).
3. Set `CLOVER_MERCHANT_ID` and `CLOVER_API_TOKEN`.

### 3. Website (My Cloud Grocer)
My Cloud Grocer sent two sets of login details:
* **Orders API:** set `CLOUDGROCER_API_USER` (the `pos@…` login) and `CLOUDGROCER_API_PASSWORD`. Use `https://baykosher.com/api` as the address (`CLOUDGROCER_API_URL`, already filled in). The email said `baykoher.com`, but that address does not exist.
* **Product upload (FTP):** set `CLOUDGROCER_FTP_USER` and `CLOUDGROCER_FTP_PASSWORD`. The host (`ftp.mycloudgrocer.com`) and port (`1175`) are already filled in.

The product file uses their **MCG Data Export Format**: one row per product with price, stock on hand, last sold and last received dates. It is named `Bay_Kosher_YYYYMMDD_HHMMSS.csv`. Before turning on the upload, you can download the file from **Settings → Website file** and send it to My Cloud Grocer to check.

### 4. Email (for invoices)
For the Gmail / Google Workspace mailbox that gets supplier invoices:
1. Turn on 2-Step Verification for that account.
2. Go to **myaccount.google.com/apppasswords** and create an app password called "Inventory".
3. Set `IMAP_USER` (the email address) and `IMAP_PASSWORD` (the 16-letter app password).

The app looks only at emails that look like invoices, bills or freight charges, plus anything from a supplier's address (set under **Suppliers → Invoice emails come from**). It never changes, moves or deletes your email.

### 5. Invoice reader
Create a key at **console.anthropic.com → API Keys** and set `ANTHROPIC_API_KEY`. Reading one invoice usually costs a few cents.

### 6. First steps in the app
1. **Settings → Sync everything now.** Clover items come in with their stock.
2. **Suppliers:** add each supplier with its order days, delivery time and minimum order.
3. **Products:** set each product's supplier and case size. Faster: export **Products CSV**, fill in the `supplier` and `case_size` columns in a spreadsheet, and import it back. Applying invoices also fills these in.
4. Count the shelves.

## Day to day
* **Home** shows what to order today, what is running out, invoices to check, and sales.
* **Invoices:** check the matched products (lines marked "check" were matched by name), then press **Apply**. This adds the delivery to stock, updates costs, and closes the open order.
* **Prices:** approve or keep each suggested price.
* **Order lists:** adjust cases if needed, send the list to the supplier, and press **Mark as ordered**.

## For developers
* `server/`: Express API with SQLite (Node's built-in `node:sqlite`, Node 22.13+). `db.js` has the schema and ledger; `forecast.js` has sales speed and order quantities; `clover.js`, `cloudgrocer.js` and `email.js` are the connectors; `invoices.js` handles invoice reading (Claude with structured output), matching, landed cost and price suggestions; `sync.js` is the scheduler.
* `public/`: the web app (plain JS, no build step).
* `npm test` runs the tests with fake Clover, website, FTP, mailbox and invoice-reader services, so no network is needed.
* `SYNC_EVERY_MIN` changes how often sales are read (default 10). Time zone is `TZ` (default America/Los_Angeles).
