# http.nyc AI

A family of deterministic AI apps, each on its own subdomain, one shared license and token pool:

| App | Host | Does |
|---|---|---|
| CalcAI | calc.http.nyc | + − (Free); × ÷ % decimals (Pro); negatives, 16 digits (Max) |
| DateAI | date.http.nyc | Today's date; tomorrow, week number, days left (Pro); any date, in N days, leap year (Max) |
| TimeAI | time.http.nyc | Current time in UTC; any timezone (Pro); time in N hours, epoch (Max) |
| JsonAI | json.http.nyc | Puts your prompt in a JSON, escapes included |

Fully vibecoded with AI in a few minutes while drinking coffee.

Live: https://http.nyc (landing), https://calc.http.nyc, https://date.http.nyc, https://time.http.nyc, https://json.http.nyc.

## How it works

- Every visitor gets a Free license key (250 tokens/day) automatically, kept in an `ai_key` cookie on `.http.nyc` so it works across all apps, with localStorage as fallback. The key is the only credential: no accounts, no passwords.
- Pro ($20/mo, 5,000 tokens) and Max ($200/mo, 100,000 tokens) are Stripe subscriptions. Checkout mints a key tied to the subscription; the key is shown on the success page, saved in the browser, and emailed to the checkout address. Renewal resets the allowance; cancellation drops the key to Free.
- Every inference runs server-side in `/api/infer`, which enforces the plan and bills input + 3 reasoning + output tokens. Locked features stay clickable and explain which plan unlocks them.
- "Lost key?" emails the key to the checkout address. "Manage subscription" opens Stripe's customer portal.
- Stripe is currently in **test mode**: card 4242 4242 4242 4242 subscribes for free and nothing is charged. Going live means activating the Stripe account and swapping the four Stripe values in `.env.production` for live ones.

## Run locally

```
npm install
cp .env.example .env
npm start
```

Open http://calc.localhost:3000, http://date.localhost:3000, http://time.localhost:3000, http://json.localhost:3000. Chrome and Firefox resolve `*.localhost` to 127.0.0.1 without any hosts-file changes. http://localhost:3000 is the landing page.

Without Stripe keys the free tier works and the upgrade buttons say payments are not configured.

## Layout

```
server.js          routes by subdomain, API, static files
lib/billing.js     license keys, token metering, Stripe checkout + webhooks
lib/mail.js        direct SMTP delivery of license keys
apps/<id>/model.js meta (name, tagline, per-plan feature list) + infer(level, body)
apps/<id>/public/  that app's index.html
public/            shared: style.css, ai.js (account, pricing, trace, family links, AI counter), success.html, landing page
data/db.json       state (gitignored); back it up
deploy/nginx/      host-nginx server block for the Pi
.github/workflows  push to master → dispatch event to the pi-deploy repo
```

### Adding an app

Create `apps/<id>/model.js` exporting `meta` and `infer(level, body)` where `level` is 0 free, 1 pro, 2 max, and `body` is whatever the page posts to `/api/infer`. Return `{ result, cost, trace }` or `{ error, code: 'plan' }`. Create `apps/<id>/public/index.html` with `<div id="ai-status">`, `<div id="ai-trace">`, `<section id="ai-pricing">`, include `/ai.js`, call `AI.init()`, and use `AI.infer({...})`. Add `<id>.http.nyc` to `deploy/nginx/http-nyc-ai.conf` (and the nginx config on the Pi, then re-run certbot with the new name), to the HOSTS line in pi-deploy's `deploy.yml`, and to the DNS wildcard nothing (it already covers it). Plan gating: return `{ error, code: 'plan' }` from `infer`, and mark UI controls with `data-level="1|2"`; the page's `AI.onAccount` callback toggles a `locked` class.

## Stripe (one account for all apps)

1. Create a Stripe account at stripe.com. Activate it (business details, bank account) to receive real money. Test mode works before activation.
2. Product catalog → add "http.nyc AI Pro" at $20/month recurring and "http.nyc AI Max" at $200/month recurring. Copy each **Price** ID (`price_…`, not `prod_…`) into `.env`.
3. Developers → API keys → secret key into `STRIPE_SECRET_KEY`.
4. Developers → Webhooks ("event destinations") → add endpoint `https://http.nyc/api/webhook` for events `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`. Signing secret into `STRIPE_WEBHOOK_SECRET`. Any one subdomain is fine; the key store is shared.
5. Settings → Billing → Customer portal → enable, so "Manage subscription" works.

Test card: 4242 4242 4242 4242, any future date, any CVC. Locally, `stripe listen --forward-to localhost:3000/api/webhook` gives a `whsec_` for testing.

Payment is optional for the app to run. Checkout is disabled until all four Stripe variables are set. Stripe has no monthly fee; it takes 2.9% + 30¢ plus 0.5% on subscriptions from real payments only.

## Email (license keys)

Keys are emailed at purchase and on "Lost key?". Delivery is direct from the host to the recipient's mail server over port 25, no relay (`lib/mail.js`). Requirements:

- Outbound port 25 open on the host's network.
- An SPF record on the sending domain that lists the host's public IP, or Gmail and Outlook refuse the mail outright (`550 5.7.26`). http.nyc's TXT record: `v=spf1 ip4:<pi public ip> include:spf.efwd.registrar-servers.com ~all`. Update the IP if it changes.
- Nothing in the env: the from address and EHLO name derive from `ROOT_DOMAIN`. `MAIL_FROM=off` disables it.

Expect spam folders anyway. There is no DKIM.

## Deploy on the Pi

Same pattern as wedding-planning: a standalone Docker container publishing a loopback port, a host-nginx server block in front, TLS at nginx. This one publishes `127.0.0.1:3010` because wedding-planning owns 3000. Redeploys go through the `pi-deploy` repo: a push to `master` here sends it a dispatch event and its runner on the Pi rebuilds this app.

First time:

1. DNS: `A` records (or one wildcard `*.http.nyc`) for `http.nyc`, `calc`, `date`, `time`, `json`.
2. On the Pi: `git clone` the repo to `/home/frenchcommando/calculator-ai`, `scp` a filled-in `.env.production` next to it (`ROOT_DOMAIN=http.nyc`, Stripe keys, `SALES_EMAIL`), then `docker compose build && docker compose up -d`.
3. nginx: copy `deploy/nginx/http-nyc-ai.conf` into the sites config, reload, then `sudo certbot --nginx -d http.nyc -d calc.http.nyc -d date.http.nyc -d time.http.nyc -d json.http.nyc` to add the TLS listener. If the Pi already has a wildcard cert for `*.http.nyc`, add the `listen 443 ssl` block by hand instead.
4. Check `curl -H 'Host: calc.http.nyc' http://127.0.0.1:3010/` returns the CalcAI page.

After that, every push to `master` deploys through pi-deploy (requires the `PI_DEPLOY_TOKEN` secret on this repo, see pi-deploy's README). Deploy logs are in pi-deploy's Actions tab. Manual fallback: `git pull && docker compose up -d --build` on the Pi. After an env-only change: `scp` the new `.env.production`, then `docker compose up -d`.

Stripe webhook URL: `https://http.nyc/api/webhook`.

State is `data/db.json`, bind-mounted from the clone so it survives rebuilds. Back it up alongside the wedding-planning data.
