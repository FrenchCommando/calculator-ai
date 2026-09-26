// One server for every *.http.nyc AI app. Routes by subdomain: calc.http.nyc, date.http.nyc, time.http.nyc.
import express from 'express';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createBilling, PLANS, LEVEL_NAME } from './lib/billing.js';
import { send as sendMail, keyEmail, mailEnabled } from './lib/mail.js';

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
  // Email the key at purchase, so a closed tab on the success page loses nothing.
  onKeyMinted: (key, acct) => { if (acct.email) sendMail({ to: acct.email, ...keyEmail({ key, plan: acct.plan, baseUrl: baseUrlFor(acct.app || 'calc') }) }).catch(() => {}); },
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
  home: `${SCHEME}://${ROOT_DOMAIN}${portSuffix}`,
  payments: billing.paymentsEnabled, mail: mailEnabled, salesEmail: SALES_EMAIL, plans: PLANS, levelNames: LEVEL_NAME,
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

// Lost key: email it to the checkout address. Same reply whether or not a key exists.
// Enterprise lead: email it to SALES_EMAIL. Small, rate-limited per IP so the form can't be used to spam us.
const leadTimes = new Map();
app.post('/api/enterprise', async (req, res) => {
  if (!mailEnabled || !SALES_EMAIL) return res.status(503).json({ error: 'AI sales is not reachable yet. Email ' + (SALES_EMAIL || 'us') + ' directly.' });
  const email = String(req.body.email || '').trim().slice(0, 200), company = String(req.body.company || '').trim().slice(0, 200), message = String(req.body.message || '').trim().slice(0, 4000);
  if (!/^[^@s]+@[^@s]+.[^@s]+$/.test(email)) return res.status(400).json({ error: 'Invalid email.' });
  const ip = req.ip, now = Date.now();
  if (now - (leadTimes.get(ip) || 0) < 60000) return res.status(429).json({ error: 'One AI lead per minute, please.' });
  leadTimes.set(ip, now);
  const ok = await sendMail({ to: SALES_EMAIL, subject: `[http.nyc AI] Enterprise lead from ${email}${company ? ' (' + company + ')' : ''}`,
    text: `App: ${req.body.app || '?'}
From: ${email}
Company: ${company || '-'}
IP: ${ip}

${message || '(no message)'}
` });
  if (!ok) return res.status(502).json({ error: 'Could not deliver to AI sales. Try again later.' });
  res.json({ ok: true });
});

app.post('/api/recover', async (req, res) => {
  if (!mailEnabled) return res.status(503).json({ error: 'Key recovery is not set up yet. Reply to your Stripe receipt instead.' });
  const email = String(req.body.email || '').trim();
  const keys = billing.recover(email);
  for (const { key, plan } of keys) await sendMail({ to: email, ...keyEmail({ key, plan, baseUrl: baseUrlFor(req.app_?.id || 'calc') }) });
  res.json({ ok: true, message: 'If a paid license exists for that email, the key has been sent to it.' });
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
  if (!err.status || err.status >= 500) console.error(req.method, req.hostname, req.path, err.stack || err);
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
