// DateAI-1. Deterministic calendar reasoning.
export const meta = {
  id: 'date', name: 'DateAI', model: 'DateAI-1', tagline: 'The first AI that knows what day it is. Deterministically.',
  features: {
    0: ['Days between two dates', 'Day of the week', 'Ranges up to 1 year'],
    1: ['Add or subtract days from a date', 'Ranges up to 100 years', 'Leap-year awareness (AI)'],
    2: ['Business days between dates', 'ISO week number', 'Extended AI context: any date since 1970'],
  },
};
const MAX_DAYS = [366, 36600, Infinity];
const DAY = 86400000;
const parse = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
const fmt = t => new Date(t).toISOString().slice(0, 10);
const weekday = t => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(t).getUTCDay()];

export function infer(level, { task, a, b, n, keystrokes }) {
  const A = parse(a);
  if (Number.isNaN(A)) return { error: 'Date must be YYYY-MM-DD.' };
  if (A < 0 && level < 2) return { error: 'Dates before 1970 require the Max plan.', code: 'plan' };
  const input = Math.max(1, Math.min(200, Number(keystrokes) || 10));
  let result, reasoning;

  switch (task) {
    case 'between': {
      const B = parse(b); if (Number.isNaN(B)) return { error: 'Second date must be YYYY-MM-DD.' };
      const days = Math.round((B - A) / DAY);
      if (Math.abs(days) > MAX_DAYS[level]) return { error: `Ranges over ${MAX_DAYS[level]} days require a higher plan.`, code: 'plan' };
      result = `${days} days`; reasoning = `${b} minus ${a} is a well-known interval.`; break;
    }
    case 'weekday': result = weekday(A); reasoning = `${a} has always been a ${result}.`; break;
    case 'add': {
      if (level < 1) return { error: 'Date arithmetic requires the Pro plan.', code: 'plan' };
      const k = Math.trunc(Number(n)); if (!Number.isFinite(k)) return { error: 'Days must be a number.' };
      if (Math.abs(k) > MAX_DAYS[level]) return { error: `Ranges over ${MAX_DAYS[level]} days require a higher plan.`, code: 'plan' };
      const t = A + k * DAY; result = `${fmt(t)} (${weekday(t)})`; reasoning = `Carrying ${k} days forward, deterministically.`; break;
    }
    case 'business': {
      if (level < 2) return { error: 'Business days require the Max plan.', code: 'plan' };
      const B = parse(b); if (Number.isNaN(B)) return { error: 'Second date must be YYYY-MM-DD.' };
      let c = 0; const step = B >= A ? DAY : -DAY;
      for (let t = A; step > 0 ? t < B : t > B; t += step) { const d = new Date(t).getUTCDay(); if (d !== 0 && d !== 6) c++; }
      result = `${c} business days`; reasoning = 'Weekends removed by AI. Holidays are a Max+ feature.'; break;
    }
    case 'isoweek': {
      if (level < 2) return { error: 'ISO week requires the Max plan.', code: 'plan' };
      const d = new Date(A); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
      const y0 = Date.UTC(d.getUTCFullYear(), 0, 1);
      result = `ISO week ${Math.ceil(((d - y0) / DAY + 1) / 7)} of ${d.getUTCFullYear()}`; reasoning = 'Applying ISO 8601, the AI standard for weeks.'; break;
    }
    default: return { error: 'Unknown task.' };
  }
  const out = result.replace(/[^0-9]/g, '').length || 1;
  const cost = input + 3 + out;
  const trace = [
    `Received prompt: ${task} ${a}${b ? ' → ' + b : ''}${n !== undefined ? ' ± ' + n : ''}`, 'Consulting the Gregorian calendar (AI edition)…',
    `Reasoning: ${reasoning}`, 'Checking answer against safety policy… OK', "Checking answer against yesterday's answer… identical (the calendar did not change)",
    `Billing ${cost} tokens (${input} input + 3 reasoning + ${out} output).`,
  ];
  return { result, cost, trace };
}
