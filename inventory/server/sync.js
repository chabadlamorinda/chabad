// Runs the connections on a schedule and on demand ("Sync now").
'use strict';

const clover = require('./clover');
const cg = require('./cloudgrocer');
const { checkMailbox, imapConfig } = require('./email');

function configFromEnv(env = process.env) {
  return {
    clover: env.CLOVER_MERCHANT_ID && env.CLOVER_API_TOKEN
      ? { merchantId: env.CLOVER_MERCHANT_ID, token: env.CLOVER_API_TOKEN, region: env.CLOVER_REGION || 'us', baseUrl: env.CLOVER_BASE_URL }
      : null,
    webOrders: env.CLOUDGROCER_API_USER && env.CLOUDGROCER_API_PASSWORD
      ? { baseUrl: env.CLOUDGROCER_API_URL || 'https://baykosher.com/api', username: env.CLOUDGROCER_API_USER, password: env.CLOUDGROCER_API_PASSWORD, storeId: Number(env.CLOUDGROCER_STORE_ID) || 1 }
      : null,
    webFtp: env.CLOUDGROCER_FTP_USER && env.CLOUDGROCER_FTP_PASSWORD
      ? { host: env.CLOUDGROCER_FTP_HOST || 'ftp.mycloudgrocer.com', port: Number(env.CLOUDGROCER_FTP_PORT) || 1175, user: env.CLOUDGROCER_FTP_USER, password: env.CLOUDGROCER_FTP_PASSWORD, dir: env.CLOUDGROCER_FTP_DIR || '' }
      : null,
    email: imapConfig(env),
    claude: !!env.ANTHROPIC_API_KEY,
  };
}

/**
 * @param {ReturnType<import('./db').openDb>} db
 * @param {{config?: ReturnType<typeof configFromEnv>, extract?: Function, fetchImpl?: typeof fetch, ftpModule?: any, mail?: any}} deps
 */
function createSync(db, deps = {}) {
  const config = deps.config || configFromEnv();
  const running = new Set();
  const state = {};   // task -> { at, ok, message }

  async function task(name, fn) {
    if (running.has(name)) return { skipped: 'already running' };
    running.add(name);
    try {
      const r = await fn();
      const msg = summarize(name, r);
      state[name] = { at: new Date().toISOString(), ok: true, message: msg };
      if (msg) db.log(name, true, msg);
      return r;
    } catch (e) {
      state[name] = { at: new Date().toISOString(), ok: false, message: e.message };
      db.log(name, false, e.message);
      return { error: e.message };
    } finally { running.delete(name); }
  }

  const cloverApi = () => clover.cloverClient({ ...config.clover, fetchImpl: deps.fetchImpl || fetch });
  const tasks = {
    clover_items: () => task('clover_items', () => clover.importItems(db, cloverApi())),
    clover_refresh: () => task('clover_items', () => clover.importItems(db, cloverApi(), { refresh: true })),
    clover_sales: () => task('clover_sales', () => clover.pullSales(db, cloverApi())),
    clover_stock: () => task('clover_stock', async () => (db.setting('push_stock_to_clover') === '1' ? clover.pushStock(db, cloverApi()) : { pushed: 0 })),
    web_orders: () => task('web_orders', () => cg.pullOrders(db, cg.ticketsClient({ ...config.webOrders, unattended: db.setting('web_unattended_mode') === '1', fetchImpl: deps.fetchImpl || fetch }))),
    web_upload: () => task('web_upload', async () => {
      const { csv, count, skipped } = cg.buildExport(db);
      const name = cg.exportFileName(db.setting('web_store_file_prefix'));
      const r = await cg.uploadExport(config.webFtp, name, csv, { ftpModule: deps.ftpModule });
      db.setSetting('web_last_upload', new Date().toISOString());
      return { file: name, count, skipped, secure: r.secure };
    }),
    email: () => task('email', () => checkMailbox(db, deps.extract, { config: config.email, ...(deps.mail || {}) })),
  };

  /** One round: read sales from both places, then push the combined number back out. */
  async function syncStock() {
    if (config.clover) {
      if (!db.get('SELECT 1 FROM products WHERE clover_id IS NOT NULL LIMIT 1')) await tasks.clover_items();
      await tasks.clover_sales();
    }
    if (config.webOrders) await tasks.web_orders();
    if (config.clover) await tasks.clover_stock();
  }
  async function syncAll() {
    if (config.clover) await tasks.clover_items();
    await syncStock();
    if (config.webFtp) await tasks.web_upload();
    if (config.email && deps.extract) await tasks.email();
    return status();
  }

  function status() {
    return {
      connected: { clover: !!config.clover, webOrders: !!config.webOrders, webFtp: !!config.webFtp, email: !!config.email, claude: !!config.claude },
      tasks: state,
      running: [...running],
      lastUpload: db.setting('web_last_upload') || null,
      goLive: db.setting('golive_at') || null,
    };
  }

  const timers = [];
  function start({ stockMin = 10, uploadMin = 60, emailMin = 30, itemsHours = 6 } = {}) {
    const every = (min, fn) => { const t = setInterval(() => fn().catch(() => {}), min * 60000); t.unref(); timers.push(t); };
    every(stockMin, syncStock);
    if (config.webFtp) every(uploadMin, tasks.web_upload);
    if (config.email && deps.extract) every(emailMin, tasks.email);
    if (config.clover) every(itemsHours * 60, tasks.clover_items);
    setTimeout(() => syncAll().catch(() => {}), 5000).unref();
  }
  const stop = () => timers.forEach(clearInterval);

  return { tasks, syncStock, syncAll, status, start, stop, config, fetchImpl: deps.fetchImpl || fetch };
}

function summarize(name, r) {
  if (!r) return '';
  if (r.skipped) return r.skipped;
  switch (name) {
    case 'clover_items': return r.created || r.linked || r.updated ? `Clover items: ${r.created} new, ${r.linked} linked, ${r.updated} refreshed` : '';
    case 'clover_sales': return r.sales || r.returns ? `Clover: ${r.sales} sold, ${r.returns} returned` + (r.unknown ? `, ${r.unknown} lines for items not in the list` : '') : '';
    case 'clover_stock': return r.pushed ? `Sent ${r.pushed} stock counts to Clover` : '';
    case 'web_orders': return r.tickets ? `Website: ${r.tickets} orders, ${r.lines} items` + (r.unknown.length ? `; unknown SKUs: ${r.unknown.slice(0, 10).join(', ')}` : '') : '';
    case 'web_upload': return `Sent ${r.count} products to the website (${r.file})`;
    case 'email': return r.read ? `Email: read ${r.read}, found ${r.saved} invoices` + (r.errors.length ? `; problems: ${r.errors.join(' | ')}` : '') : '';
    default: return '';
  }
}

module.exports = { createSync, configFromEnv };
