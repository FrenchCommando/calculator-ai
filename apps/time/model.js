// TimeAI-1. Tells the time. With AI.
export const meta = {
  id: 'time', name: 'TimeAI', model: 'TimeAI-1', tagline: 'The first AI that knows what time it is. Right now. Deterministically*.',
  features: {
    0: ['Current time in UTC', 'Refreshes on every inference', 'Second-level precision'],
    1: ['Any IANA timezone', 'Time-zone conversion', 'Millisecond precision'],
    2: ['Future time: "what time will it be in N hours"', 'Unix epoch output', 'Extended AI context: up to 1,000 years ahead'],
  },
};

const tzValid = tz => { try { Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
// dateStyle/timeStyle cannot be combined with fractionalSecondDigits, so spell the components out.
const fmt = (t, tz, ms) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short', ...(ms ? { fractionalSecondDigits: 3 } : {}) }).format(t);

export function infer(level, { task = 'now', tz = 'UTC', hours = 0, keystrokes }) {
  if (tz !== 'UTC' && level < 1) return { error: 'Timezones other than UTC require the Pro plan.', code: 'plan' };
  if (!tzValid(tz)) return { error: 'Unknown timezone.' };
  const h = Number(hours) || 0;
  if (task === 'future' && level < 2) return { error: 'Future time requires the Max plan.', code: 'plan' };
  if (Math.abs(h) > 8766000) return { error: 'The AI cannot see more than 1,000 years ahead.', code: 'plan' };

  const t = Date.now() + (task === 'future' ? h * 3600000 : 0);
  let result = fmt(t, tz, level >= 1);
  if (level >= 2) result += ` · epoch ${Math.floor(t / 1000)}`;
  const input = Math.max(1, Math.min(200, Number(keystrokes) || 1));
  const out = result.replace(/[^0-9]/g, '').length;
  const cost = input + 3 + out;
  const trace = [
    `Received prompt: ${task === 'future' ? `time in ${h} hours` : 'current time'} in ${tz}`,
    'Consulting the AI clock (a quartz crystal, but AI)…',
    task === 'future' ? `Reasoning: extrapolating ${h} hours forward at a rate of 1 hour per hour.` : 'Reasoning: the time is now.',
    'Checking answer against safety policy… OK',
    "Checking answer against yesterday's answer… different (*this is expected; time is the one non-deterministic input we allow)",
    `Billing ${cost} tokens (${input} input + 3 reasoning + ${out} output).`,
  ];
  return { result, cost, trace };
}
