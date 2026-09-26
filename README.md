# http.nyc AI

A family of deterministic AI apps, each on its own subdomain, one shared license and token pool:

| App | Host | Does |
|---|---|---|
| CalcAI | calc.http.nyc | Arithmetic |
| DateAI | date.http.nyc | Days between dates, weekday, date arithmetic, business days, ISO week |
| TimeAI | time.http.nyc | Current time, timezone conversion, future time |
| JsonAI | json.http.nyc | Puts your prompt in a JSON, escapes included |

Fully vibecoded with AI in a few minutes while drinking coffee.

## Run locally

```
npm install
cp .env.example .env
npm start
```

Open http://calc.localhost:3000, http://date.localhost:3000, http://time.localhost:3000. Chrome and Firefox resolve `*.localhost` to 127.0.0.1 without any hosts-file changes. http://localhost:3000 is the landing page.

Without Stripe keys the free tier works and the upgrade buttons say payments are not configured.

## Layout

```
server.js          routes by subdomain, API, static files
lib/billing.js     license keys, token metering, Stripe checkout + webhooks
apps/<id>/model.js meta (name, tagline, per-plan feature list) + infer(level, body)
apps/<id>/public/  that app's index.html
public/            shared: style.css, ai.js (account, pricing, trace UI), success.html, landing page
data/db.json       state (gitignored); back it up
deploy/            Caddyfile + systemd unit for the Pi
```

### Adding an app

Create `apps/<id>/model.js` exporting `meta` and `infer(level, body)` where `level` is 0 free, 1 pro, 2 max, and `body` is whatever the page posts to `/api/infer`. Return `{ result, cost, trace }` or `{ error, code: 'plan' }`. Create `apps/<id>/public/index.html` with `<div id="ai-status">`, `<div id="ai-trace">`, `<section id="ai-pricing">`, include `/ai.js`, call `AI.init()`, and use `AI.infer({...})`. Add `<id>.http.nyc` to the Caddyfile.

## Stripe (one account for all apps)

1. Create a Stripe account at stripe.com. Activate it (business details, bank account) to receive real money. Test mode works before activation.
2. Products → add "http.nyc AI Pro" at $20/month recurring and "http.nyc AI Max" at $200/month recurring. Copy each Price ID into `.env`.
3. Developers → API keys → secret key into `STRIPE_SECRET_KEY`.
4. Developers → Webhooks → add endpoint `https://http.nyc/api/webhook` for events `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`. Signing secret into `STRIPE_WEBHOOK_SECRET`. Any one subdomain is fine; the key store is shared.
5. Settings → Billing → Customer portal → enable, so "Manage subscription" works.

Test card: 4242 4242 4242 4242, any future date, any CVC. Locally, `stripe listen --forward-to localhost:3000/api/webhook` gives a `whsec_` for testing.

Payment is optional for the app to run. Checkout is disabled until all four Stripe variables are set.

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
