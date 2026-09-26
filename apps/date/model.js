// DateAI-1. Knows what day it is.
export const meta = {
  id: 'date', name: 'DateAI', model: 'DateAI-1', tagline: 'The first AI that knows what day it is. Deterministically.',
  features: {
    0: ["Today's date and weekday", 'UTC, the one true AI timezone'],
    1: ['Tomorrow and yesterday', 'Week number and day of the year', 'Days left in the year'],
    2: ['Any date: its weekday', '"What day is it in N days?"', 'Leap-year check'],
  },
};
const DAY = 86400000;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const iso = t => new Date(t).toISOString().slice(0, 10);
const weekday = t => DAYS[new Date(t).getUTCDay()];
const say = t => `${weekday(t)}, ${iso(t)}`;
const parse = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
const isoWeek = t => { const d = new Date(t); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day); return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY + 1) / 7); };

// Tasks: name, plan level, and the answer. `n` and `date` are the optional inputs.
const TASKS = {
  today: { level: 0, input: 1, run: t => [say(t), 'The AI checked the calendar. It is today.'] },
  tomorrow: { level: 1, input: 1, run: t => [say(t + DAY), 'Adding one day, deterministically.'] },
  yesterday: { level: 1, input: 1, run: t => [say(t - DAY), 'Subtracting one day. The AI remembers.'] },
  week: { level: 1, input: 1, run: t => [`Week ${isoWeek(t)}`, 'Applying ISO 8601, the AI standard for weeks.'] },
  dayofyear: { level: 1, input: 1, run: t => { const y = new Date(t).getUTCFullYear(); const n = Math.floor((t - Date.UTC(y, 0, 1)) / DAY) + 1; return [`Day ${n} of ${y}`, 'Counting from January 1st. All of them.']; } },
  left: { level: 1, input: 1, run: t => { const y = new Date(t).getUTCFullYear(); const n = Math.round((Date.UTC(y + 1, 0, 1) - t) / DAY) - 1; return [`${n} days left in ${y}`, 'The AI has seen the end of the year and is not worried.']; } },
  in: { level: 2, input: 1, run: (t, { n }) => { const k = Math.trunc(Number(n)); if (!Number.isFinite(k)) throw new Error('Days must be a number.'); if (Math.abs(k) > 3652500) throw new Error('The AI cannot see more than 10,000 years ahead.'); return [say(t + k * DAY), `Carrying ${k} days forward at a rate of one day per day.`]; } },
  weekdayof: { level: 2, input: 10, run: (_t, { date }) => { const d = parse(date); if (Number.isNaN(d)) throw new Error('Date must be YYYY-MM-DD.'); return [say(d), `${date} has always been a ${weekday(d)}.`]; } },
  leap: { level: 2, input: 10, run: (t, { date }) => { const d = date ? parse(date) : t; if (Number.isNaN(d)) throw new Error('Date must be YYYY-MM-DD.'); const y = new Date(d).getUTCFullYear(); const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; return [`${y} is ${leap ? '' : 'not '}a leap year`, leap ? 'February gets a bonus day. The AI approves.' : 'February stays short. The AI did not decide this.']; } },
};
const PLAN = ['Free', 'Pro', 'Max'];

export function infer(level, { task = 'today', n, date }) {
  const T = TASKS[task];
  if (!T) return { error: 'Unknown task.' };
  if (level < T.level) return { error: `"${task}" requires the ${PLAN[T.level]} plan.`, code: 'plan' };
  let result, reasoning;
  try { [result, reasoning] = T.run(Date.now(), { n, date }); } catch (e) { return { error: e.message }; }
  const input = T.input + (n !== undefined ? String(n).length : 0);
  const out = result.replace(/[^0-9]/g, '').length || 1;
  const cost = input + 3 + out;
  const trace = [
    `Received prompt: ${task}${n !== undefined ? ' ' + n : ''}${date ? ' ' + date : ''}`, 'Consulting the Gregorian calendar (AI edition)…',
    `Reasoning: ${reasoning}`, 'Checking answer against safety policy… OK', "Checking answer against yesterday's answer… off by one, as expected",
    `Billing ${cost} tokens (${input} input + 3 reasoning + ${out} output).`,
  ];
  return { result, cost, trace };
}
