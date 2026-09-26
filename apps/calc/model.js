// CalcAI-1. Deterministic arithmetic.
export const meta = {
  id: 'calc', name: 'CalcAI', model: 'CalcAI-1', tagline: 'The first AI calculator that is fully deterministic AI.',
  features: {
    0: ['Addition and subtraction', 'Results capped at 3 digits'],
    1: ['Multiplication and division', 'Decimal point and the "%" key', 'Results up to 8 digits'],
    2: ['Negative numbers', 'Extended AI context: up to 16 digits', 'CalcAI-1 Thinking (same answer, slower)'],
  },
};
const DIGITS = [3, 8, 16];

export function infer(level, { a, op, b, keystrokes }) {
  if (!['+', '-', '*', '/'].includes(op)) return { error: 'Unknown operator.' };
  if ((op === '*' || op === '/') && level < 1) return { error: `Operator "${op}" requires the Pro plan.`, code: 'plan' };
  if ((String(a).includes('.') || String(b).includes('.')) && level < 1) return { error: 'Decimal point requires the Pro plan.', code: 'plan' };
  if ((String(a).startsWith('-') || String(b).startsWith('-')) && level < 2) return { error: 'Negative numbers require the Max plan.', code: 'plan' };
  const x = Number(a), y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: 'Inputs must be numbers.' };

  let r;
  switch (op) { case '+': r = x + y; break; case '-': r = x - y; break; case '*': r = x * y; break; case '/': r = y === 0 ? NaN : x / y; break; }
  let out = Number.isNaN(r) ? 'Refused' : String(parseFloat(r.toPrecision(15)));
  const digits = out.replace(/[^0-9]/g, '').length;
  if (digits > DIGITS[level]) out = out.slice(0, DIGITS[level] + (out.includes('.') ? 1 : 0) + (out.startsWith('-') ? 1 : 0)) + '…';

  const input = Math.max(1, Math.min(200, Number(keystrokes) || 0));
  const cost = input + 3 + digits;
  const name = { '+': 'sum', '-': 'difference', '*': 'product', '/': 'quotient' }[op];
  const trace = [
    `Received prompt: ${a} ${op} ${b}`, 'Retrieving relevant arithmetic from knowledge base…',
    `Reasoning: ${a} ${op} ${b} is a well-known ${name}.`, 'Checking answer against safety policy… OK',
    "Checking answer against yesterday's answer… identical", 'Asking a second AI to verify the first AI… agrees',
    `Billing ${cost} tokens (${input} input + 3 reasoning + ${digits} output).`,
  ];
  if (Number.isNaN(r)) trace.push('Division by zero blocked by guardrails. This incident has been reported.');
  return { result: out, cost, trace };
}
