// Shared license keys, token metering, and Stripe billing for every *.http.nyc AI app.
import Stripe from 'stripe';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

export const PLANS = {
  free: { level: 0, tokens: 250, period: 'day', priceUsd: 0 },
  pro: { level: 1, tokens: 5000, period: 'month', priceUsd: 20 },
  max: { level: 2, tokens: 100000, period: 'month', priceUsd: 200 },
};
export const LEVEL_NAME = ['Free', 'Pro', 'Max'];

export function createBilling({ dataDir, stripeKey, webhookSecret, prices, baseUrlFor, onKeyMinted = () => {} }) {
  const stripe = stripeKey ? new Stripe(stripeKey) : null;
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'db.json');
  const db = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { keys: {}, sessions: {} };
  const save = () => writeFileSync(file, JSON.stringify(db, null, 2));

  function nextReset(plan) {
    const d = new Date();
    if (PLANS[plan].period === 'day') d.setUTCDate(d.getUTCDate() + 1); else d.setUTCMonth(d.getUTCMonth() + 1);
    return d.getTime();
  }
  function newKey(plan, extra = {}) {
    const key = 'ai_' + randomBytes(12).toString('hex');
    db.keys[key] = { plan, used: 0, resetAt: nextReset(plan), created: Date.now(), ...extra };
    save();
    return key;
  }
  function account(key) {
    // Only real keys: own properties with the expected prefix, so "__proto__" and friends can't reach the prototype.
    const acct = typeof key === 'string' && key.startsWith('ai_') && Object.hasOwn(db.keys, key) ? db.keys[key] : undefined;
    if (!acct) return null;
    if (Date.now() > acct.resetAt) { acct.used = 0; acct.resetAt = nextReset(acct.plan); save(); }
    return acct;
  }
  function view(key) {
    const acct = account(key);
    const p = PLANS[acct.plan];
    return { key, plan: acct.plan, level: p.level, used: acct.used, limit: p.tokens, remaining: p.tokens - acct.used, resetAt: acct.resetAt, period: p.period, hasSubscription: !!acct.subscription };
  }
  // Returns false if the account cannot afford `cost`; otherwise debits and returns true.
  function charge(acct, cost) {
    if (acct.used + cost > PLANS[acct.plan].tokens) return false;
    acct.used += cost; save();
    return true;
  }

  const paymentsEnabled = !!(stripe && prices.pro && prices.max);

  async function checkout(plan, app) {
    if (!paymentsEnabled || !prices[plan]) throw new Error('Payments are not configured for this plan.');
    const base = baseUrlFor(app);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: prices[plan], quantity: 1 }],
      metadata: { plan, app },
      allow_promotion_codes: true,
      success_url: `${base}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/#pricing`,
    });
    return session.url;
  }

  function mintFromSession(s) {
    if (db.sessions[s.id]) return db.sessions[s.id];
    const key = newKey(s.metadata.plan, { email: s.customer_details?.email || s.customer_email || null, customer: s.customer, subscription: s.subscription, app: s.metadata.app });
    db.sessions[s.id] = key; save();
    onKeyMinted(key, db.keys[key]);
    return key;
  }

  async function keyForSession(id) {
    if (db.sessions[id]) return db.sessions[id];
    if (!stripe) throw new Error('Stripe not configured');
    const s = await stripe.checkout.sessions.retrieve(id);
    if (s.payment_status !== 'paid' || !PLANS[s.metadata?.plan]) throw new Error('Payment not completed.');
    return mintFromSession(s);
  }

  function handleWebhook(rawBody, signature) {
    if (!stripe) throw new Error('Stripe not configured');
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    const obj = event.data.object;
    if (event.type === 'checkout.session.completed' && PLANS[obj.metadata?.plan]) mintFromSession(obj);
    else if (event.type === 'invoice.paid') {
      for (const a of Object.values(db.keys)) if (a.subscription === obj.subscription) { a.used = 0; a.resetAt = nextReset(a.plan); }
      save();
    } else if (event.type === 'customer.subscription.deleted') {
      for (const a of Object.values(db.keys)) if (a.subscription === obj.id) { a.plan = 'free'; a.used = 0; a.resetAt = nextReset('free'); }
      save();
    }
    return event.type;
  }

  function recover(email) {
    email = String(email || '').trim().toLowerCase();
    return Object.entries(db.keys).filter(([, a]) => a.email && a.email.toLowerCase() === email && a.plan !== 'free').map(([k, a]) => ({ key: k, plan: a.plan }));
  }

  async function portalUrl(key, app) {
    const acct = account(key);
    if (!stripe || !acct?.customer) throw new Error('No subscription on this key.');
    const s = await stripe.billingPortal.sessions.create({ customer: acct.customer, return_url: `${baseUrlFor(app)}/` });
    return s.url;
  }

  return { stripe, paymentsEnabled, newKey, account, view, charge, checkout, keyForSession, handleWebhook, recover, portalUrl };
}
