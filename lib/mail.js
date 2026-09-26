// Direct outbound email: look up the recipient's MX and speak SMTP to it. No relay, no dependency.
// Deliverability from a home IP is poor (spam folder). MAIL_FROM=off disables sending.
import { promises as dns } from 'node:dns';
import net from 'node:net';
import tls from 'node:tls';

const ROOT = process.env.ROOT_DOMAIN && process.env.ROOT_DOMAIN !== 'localhost' ? process.env.ROOT_DOMAIN : 'http.nyc';
const FROM = process.env.MAIL_FROM === 'off' ? '' : (process.env.MAIL_FROM || `${ROOT} AI <keys@${ROOT}>`);
const HELO = process.env.MAIL_HELO || ROOT;
const FROM_ADDR = (FROM.match(/<([^>]+)>/) || [, FROM])[1].trim();
export const mailEnabled = !!FROM_ADDR;

export async function send({ to, subject, text }) {
  if (!mailEnabled) return false;
  try {
    const domain = to.split('@')[1];
    const mx = (await resolveMx(domain)).sort((a, b) => a.priority - b.priority);
    const hosts = mx.length ? mx.map(m => m.exchange) : [domain];
    let lastErr;
    for (const host of hosts) {
      try { await deliver(host, { to, subject, text }); return true; }
      catch (e) { lastErr = e; }
    }
    throw lastErr;
  } catch (e) {
    console.error('mail failed', to, e.message);
    return false;
  }
}

// System resolver first; some hosts (Windows, odd containers) refuse MX queries, so fall back to public DNS.
async function resolveMx(domain) {
  try { return await dns.resolveMx(domain); }
  catch {
    const r = new dns.Resolver(); r.setServers(['1.1.1.1', '8.8.8.8']);
    return r.resolveMx(domain);
  }
}

function deliver(host, { to, subject, text }) {
  return new Promise((resolve, reject) => {
    let sock = net.connect(25, host);
    let buf = '';
    let step = 0;
    const timer = setTimeout(() => fail(new Error('timeout')), 30000);
    const fail = e => { clearTimeout(timer); sock.destroy(); reject(e); };
    const write = s => sock.write(s + '\r\n');
    const msg = [
      `From: ${FROM}`, `To: <${to}>`, `Subject: ${subject}`, `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${FROM_ADDR.split('@')[1]}>`,
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '',
      text.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..'),
    ].join('\r\n');

    const onData = d => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) !== -1) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (/^\d{3}-/.test(line)) continue;                    // multi-line reply, keep reading
        const code = +line.slice(0, 3);
        if (code >= 400) return fail(new Error(`${host}: ${line}`));
        switch (step++) {
          case 0: write(`EHLO ${HELO}`); break;
          case 1: write('STARTTLS'); break;
          case 2: {
            sock.removeListener('data', onData);
            sock = tls.connect({ socket: sock, servername: host, rejectUnauthorized: false }, () => { sock.on('data', onData); write(`EHLO ${HELO}`); });
            sock.on('error', fail);
            break;
          }
          case 3: write(`MAIL FROM:<${FROM_ADDR}>`); break;
          case 4: write(`RCPT TO:<${to}>`); break;
          case 5: write('DATA'); break;
          case 6: write(msg + '\r\n.'); break;
          case 7: write('QUIT'); clearTimeout(timer); sock.end(); resolve(); break;
        }
      }
    };
    sock.on('data', onData);
    sock.on('error', fail);
  });
}

export function keyEmail({ key, plan, baseUrl }) {
  const name = plan[0].toUpperCase() + plan.slice(1);
  return {
    subject: `Your http.nyc AI ${name} license key`,
    text: `Thank you for your AI.

Your ${name} license key:

    ${key}

It works on every AI app under http.nyc. Paste it into the "License key" box on any of them, or open ${baseUrl}/#product where it is already saved in the browser you paid from.

Manage or cancel the subscription from the "Manage subscription" button on any app page.

This key is the only credential for your plan. Keep it private.

http.nyc AI. Fully vibecoded with AI in a few minutes while drinking coffee.
`,
  };
}
