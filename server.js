// One server for every *.http.nyc AI app. Routes by subdomain: calc.http.nyc, date.http.nyc, time.http.nyc.
import express from 'express';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createBilling, PLANS, LEVEL_NAME } from './lib/billing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv(path.join(__dirname, '.env'));

const PORT = process.env.PORT || 3000;
const ROOT_DOMAIN = process.env.ROOT_DOMAIN || 'localhost';                 // http.nyc in production
const SCHEME = process.env.SCHEME || (ROOT_DOMAIN === 'localhost' ? 'http' : 'https');
const portSuffix = ROOT_DOMAIN === 'localhost' ? `:${PORT}` : '';
const baseUrlFor = app => `${SCHEME}://${app}.${ROOT_DOMAIN}${portSuffix}`;
const COOKIE_DOMAIN = ROOT_DOMAIN === 'localhost' ? undefined : `.${ROOT_DOMAIN}`;
const SALES_EMAIL = process.env.SALES_EMAIL || '';

// Load every app in apps/<id>/{model.js,public/}.
const APPS = {};
for (const id of readdirSync(path.join(__dirname, 'apps'))) {
  const mod = await import(pathToFileURL(path.join(__dirname, 'apps', id, 'model.js')).href);
  APPS[id] = { ...mod.meta, infer: mod.infer, dir: path.join(__dirname, 'apps', id, 'public') };
}

const billing = createBilling({
  dataDir: path.join(__dirname, 'data'),
  stripeKey: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  prices: { pro: process.env.STRIPE_PRICE_PRO, max: process.env.STRIPE_PRICE_MAX },
  baseUrlFor,
});

const app = express();
app.set('trust proxy', true);

// Which app is this request for? calc.http.nyc → calc. Unknown host → landing page.
app.use((req, _res, next) => {
  const sub = req.hostname.split('.')[0];
  req.app_ = APPS[sub] || null;
  next();
});

// Stripe webhook must see the raw body.
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  try { res.json({ received: billing.handleWebhook(req.body, req.headers['stripe-signature']) }); }
  catch (e) { res.status(400).send(`Webhook error: ${e.message}`); }
});
app.use(express.json());

const setKeyCookie = (res, key) => res.cookie('ai_key', key, { domain: COOKIE_DOMAIN, path: '/', maxAge: 365 * 86400000, sameSite: 'lax' });
const keyFrom = req => req.body?.key || req.query.key || (req.headers.cookie || '').match(/(?:^|;\s*)ai_key=([^;]+)/)?.[1];
const publicApp = a => ({ id: a.id, name: a.name, model: a.model, tagline: a.tagline, features: a.features });

app.get('/api/config', (req, res) => res.json({
  payments: billing.paymentsEnabled, salesEmail: SALES_EMAIL, plans: PLANS, levelNames: LEVEL_NAME,
  app: req.app_ ? publicApp(req.app_) : null,
  apps: Object.values(APPS).map(a => ({ ...publicApp(a), url: baseUrlFor(a.id) })),
}));

app.post('/api/free-key', (_req, res) => {
  const key = billing.newKey('free');
  setKeyCookie(res, key);
  res.json(billing.view(key));
});

app.get('/api/me', (req, res) => {
  const key = keyFrom(req);
  if (!billing.account(key)) return res.status(404).json({ error: 'Unknown license key.' });
  setKeyCookie(res, key);
  res.json(billing.view(key));
});

app.post('/api/infer', (req, res) => {
  if (!req.app_) return res.status(404).json({ error: 'No app on this host.' });
  const key = keyFrom(req);
  const acct = billing.account(key);
  if (!acct) return res.status(401).json({ error: 'Unknown license key.', code: 'auth' });
  const out = req.app_.infer(PLANS[acct.plan].level, req.body);
  if (out.error) return res.status(400).json({ ...out, account: billing.view(key) });
  if (!billing.charge(acct, out.cost)) return res.status(402).json({ error: 'Token limit reached.', code: 'quota', cost: out.cost, account: billing.view(key) });
  res.json({ ...out, confidence: 1, account: billing.view(key) });
});

app.post('/api/checkout', async (req, res) => {
  try { res.json({ url: await billing.checkout(req.body.plan, req.app_?.id || Object.keys(APPS)[0]) }); }
  catch (e) { res.status(503).json({ error: e.message }); }
});

app.get('/api/session', async (req, res) => {
  try { const key = await billing.keyForSession(req.query.session_id); setKeyCookie(res, key); res.json(billing.view(key)); }
  catch (e) { res.status(402).json({ error: e.message }); }
});

app.post('/api/recover', (req, res) => {
  const keys = billing.recover(req.body.email);
  if (!keys.length) return res.status(404).json({ error: 'No paid license found for that email.' });
  res.json({ keys });
});

app.post('/api/portal', async (req, res) => {
  try { res.json({ url: await billing.portalUrl(keyFrom(req), req.app_?.id || Object.keys(APPS)[0]) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Static: app page first, then shared assets (style.css, ai.js, success.html, landing index).
app.use((req, res, next) => req.app_ ? express.static(req.app_.dir)(req, res, next) : next());
app.use(express.static(path.join(__dirname, 'public')));

// Always answer API errors as JSON (bad JSON bodies, thrown handlers).
app.use((err, req, res, _next) => {
  if (req.path.startsWith('/api/')) return res.status(err.status || 500).json({ error: err.status === 400 ? 'Malformed request body.' : 'Server error.' });
  res.status(err.status || 500).send('Server error.');
});

app.listen(PORT, () => {
  console.log(`Apps: ${Object.keys(APPS).map(baseUrlFor).join('  ')}`);
  if (!billing.paymentsEnabled) console.log('Stripe not fully configured: free tier works, paid checkout disabled.');
});

function loadDotenv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
