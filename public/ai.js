// Shared client for every *.http.nyc AI app: account, tokens, checkout, reasoning trace, pricing section.
window.AI = (() => {
  const $ = id => document.getElementById(id);
  const api = async (path, opts) => {
    const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, ...d };
  };
  let config = { payments: false, salesEmail: '', plans: {}, app: null, apps: [] };
  let acct = null;
  const listeners = [];

  // ---------- UI ----------
  function toast(msg) {
    let t = $('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function trace(msg, strong) {
    const ul = $('trace'); if (!ul) return;
    const li = document.createElement('li');
    if (strong) { const s = document.createElement('span'); s.textContent = msg; li.appendChild(s); } else li.textContent = msg;
    ul.prepend(li);
    while (ul.children.length > 40) ul.lastChild.remove();
  }
  function think(steps) {
    const el = $('think');
    return new Promise(done => {
      let i = 0; if (el) { el.textContent = 'AI thinking (AI)…'; el.className = 'thinking'; }
      const tick = () => { if (i < steps.length) { trace(steps[i++]); setTimeout(tick, 180); } else { if (el) { el.textContent = 'AI model idle'; el.className = ''; } done(); } };
      tick();
    });
  }

  function mountStatus() {
    const host = $('ai-status'); if (!host) return;
    host.innerHTML = `
      <div class="status"><span id="think">AI model idle</span><span>AI tokens: <b id="tok">–</b> / <span id="lim">–</span></span></div>
      <div class="meter"><div class="bar"><div class="fill" id="fill"></div></div><small id="quota">Connecting to AI…</small></div>
      <div class="acct">
        <span class="badge-plan" id="planBadge">free</span>
        <input id="keyInput" placeholder="License key (ai_…)" spellcheck="false">
        <button id="keySave">Use key</button>
        <button id="keyRecover" title="Email the key to the address used at checkout">Lost key?</button>
        <button id="portal" hidden>Manage subscription</button>
      </div>`;
    $('keySave').onclick = () => loadAccount($('keyInput').value.trim());
    $('keyRecover').onclick = async () => {
      const email = prompt('Email used at checkout:'); if (!email) return;
      const d = await api('/api/recover', { method: 'POST', body: JSON.stringify({ email }) });
      toast(d.ok ? d.message : d.error);
    };
    $('portal').onclick = async () => { const d = await api('/api/portal', { method: 'POST', body: JSON.stringify({ key: acct.key }) }); if (d.url) location.href = d.url; else toast(d.error); };
  }
  function mountTrace() {
    const host = $('ai-trace'); if (!host) return;
    host.innerHTML = `<h3>AI reasoning trace (fully deterministic AI)</h3><ul id="trace"><li>AI awaiting AI user AI prompt…</li></ul>
      <p style="color:var(--muted);font-size:13px;margin:14px 0 0">AI traces are AI-generated with AI temperature 0, AI top-p 0, and an AI random seed of 0. We also removed the AI random number generator. Also there was never an AI model. But it is AI.</p>`;
  }
  function mountPricing() {
    const host = $('ai-pricing'); if (!host) return;
    const f = config.app?.features || {};
    const li = arr => arr.map(x => `<li>${x}</li>`).join('');
    host.innerHTML = `
      <h2>Simple, transparent, AI-token-based AI pricing</h2>
      <p class="sub">One license key works on every AI app under http.nyc, with one shared token pool. Each inference bills input + 3 reasoning + output tokens. Monthly through Stripe. Cancel anytime.</p>
      <div class="tiers">
        <div class="tier"><h3>Free</h3><div class="price">$0<small>/mo</small></div><div class="tokens">250 AI tokens / day</div>
          <ul>${li(f[0] || [])}<li>All http.nyc AI apps</li><li>No account required</li></ul><a class="cta secondary" href="#product" data-plan="free">Current plan</a></div>
        <div class="tier hot"><div class="badge">Most popular AI</div><h3>Pro</h3><div class="price">$20<small>/mo</small></div><div class="tokens">5,000 AI tokens / mo</div>
          <ul>${li(f[1] || [])}<li>Priority AI inference during peak hours</li></ul><a class="cta" href="#" data-plan="pro">Upgrade to Pro</a></div>
        <div class="tier"><h3>Max</h3><div class="price">$200<small>/mo</small></div><div class="tokens">100,000 AI tokens / mo</div>
          <ul><li>Everything in Pro</li>${li(f[2] || [])}<li>Email support (48h SLA, deterministic)</li></ul><a class="cta" href="#" data-plan="max">Go Max</a></div>
        <div class="tier"><h3>Enterprise AI</h3><div class="price">Custom</div><div class="tokens">Unlimited* AI tokens</div>
          <ul><li>*Fair use: 2M AI tokens / mo</li><li>AI SOC 2, AI HIPAA, AI ISO 8601</li><li>On-prem AI deployment (we mail you a Raspberry Pi)</li><li>Dedicated forward-deployed AI engineer</li></ul><a class="cta secondary" href="#" data-plan="enterprise">Talk to AI sales</a></div>
      </div>
      <p class="fine">Tokens do not roll over. Prices exclude VAT, AI GPU surcharge, and the AI Alignment Fee. Payments processed by Stripe.</p>`;
    host.querySelectorAll('[data-plan]').forEach(a => a.addEventListener('click', async e => {
      const p = a.dataset.plan;
      if (p === 'free') return;
      e.preventDefault();
      if (p === 'enterprise') {
        if (config.salesEmail) location.href = `mailto:${config.salesEmail}?subject=${encodeURIComponent(config.app?.name || 'AI')}%20Enterprise%20AI&body=We%20need%20more%20AI.`;
        else toast('AI sales will reach out within 3 to 5 AI business quarters.');
        return;
      }
      if (p === acct?.plan) return;
      const label = a.textContent; a.textContent = 'Redirecting to AI checkout…';
      const d = await api('/api/checkout', { method: 'POST', body: JSON.stringify({ plan: p }) });
      if (d.url) location.href = d.url; else { toast(d.error || 'Checkout unavailable.'); a.textContent = label; }
    }));
    if (!config.payments) host.querySelectorAll('[data-plan="pro"],[data-plan="max"]').forEach(a => a.title = 'Payments not configured on this server yet');
  }
  function mountFamily() {
    const host = $('ai-family'); if (!host) return;
    host.innerHTML = config.apps.map(a => `<a class="card" style="text-decoration:none;color:inherit${a.id === config.app?.id ? ';border-color:var(--accent)' : ''}" href="${a.url}"><h3>${a.name}</h3><p>${a.tagline}</p></a>`).join('');
  }
  function mountCounter() {
    const nav = document.querySelector('nav'); if (!nav) return;
    const el = document.createElement('span'); el.style.cssText = 'font-size:12px;color:var(--muted);margin-left:16px'; nav.appendChild(el);
    // textContent, not innerText: innerText forces a full layout of the page on every call.
    // Count only the rendered regions (scripts live outside them) and skip the counter's own text.
    const regions = ['header', 'main', 'footer'].map(t => document.querySelector(t)).filter(Boolean);
    let queued = false;
    const update = () => {
      queued = false;
      el.textContent = '';
      const n = regions.reduce((s, r) => s + (r.textContent.match(/\bAI\b/g) || []).length, 0);
      el.textContent = `AI mentions on this AI page: ${n} AI`;
    };
    new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(update); } }).observe(document.body, { childList: true, subtree: true, characterData: true });
    update();
  }

  function renderAccount() {
    if (!acct || !$('tok')) return;
    $('tok').textContent = acct.used; $('lim').textContent = acct.limit.toLocaleString();
    $('fill').style.width = Math.min(100, acct.used / acct.limit * 100) + '%';
    $('planBadge').textContent = acct.plan; $('keyInput').value = acct.key;
    $('quota').textContent = `${config.levelNames[acct.level]} · ${acct.limit.toLocaleString()} AI tokens per ${acct.period} · resets ${new Date(acct.resetAt).toLocaleString()}`;
    $('portal').hidden = !acct.hasSubscription;
    document.querySelectorAll('[data-plan]').forEach(a => { if (a.dataset.plan === acct.plan) { a.textContent = 'Current plan'; a.classList.add('secondary'); } });
    listeners.forEach(fn => fn(acct));
  }

  // ---------- account ----------
  async function loadAccount(key, quiet = false) {
    if (!key) return false;
    const d = await api('/api/me?key=' + encodeURIComponent(key));
    if (d.ok) { acct = d; try { localStorage.setItem('ai_key', key); } catch {} renderAccount(); if (!quiet) toast(`Using ${config.levelNames[d.level]} key ${key}`); return true; }
    // Rejected: make the active state unambiguous by snapping the box back to the key in use.
    if (acct && $('keyInput')) $('keyInput').value = acct.key;
    if (!quiet) toast(`${d.error || 'Unknown AI license key.'}${acct ? ` Still using your ${config.levelNames[acct.level]} key.` : ''}`);
    return false;
  }
  function storedKey() {
    const c = document.cookie.match(/(?:^|;\s*)ai_key=([^;]+)/)?.[1];
    if (c) return c;
    try { return localStorage.getItem('ai_key'); } catch { return null; }
  }

  // ---------- public ----------
  async function init() {
    config = await api('/api/config');
    mountStatus(); mountTrace(); mountPricing(); mountFamily(); mountCounter();
    if (config.home) document.querySelectorAll('a.home').forEach(l => l.href = config.home);
    if (!(await loadAccount(storedKey(), true))) {
      const d = await api('/api/free-key', { method: 'POST' });
      acct = d; try { localStorage.setItem('ai_key', d.key); } catch {}
      renderAccount();
      trace('Free AI license issued. 250 AI tokens per day across all http.nyc AI apps. Upgrade for more AI.');
    }
    return { config, acct };
  }
  // Runs the app's model. Handles quota/plan errors and the trace; resolves with the result string or null.
  async function infer(body) {
    const d = await api('/api/infer', { method: 'POST', body: JSON.stringify({ key: acct.key, ...body }) });
    if (d.account) { acct = d.account; renderAccount(); }
    if (!d.ok) {
      if (d.code === 'quota') trace('AIRateLimitError: insufficient AI tokens. See pricing.', true);
      else trace(d.error || 'AI error', true);
      if (d.code === 'plan') toast(d.error);
      return { error: d.error, code: d.code };
    }
    await think(d.trace);
    trace(`AI output: ${d.result} (AI confidence: ${(d.confidence * 100).toFixed(1)}%)`, true);
    return { result: d.result };
  }
  return { init, infer, trace, toast, onAccount: fn => listeners.push(fn), get account() { return acct; }, get level() { return acct?.level ?? 0; } };
})();
