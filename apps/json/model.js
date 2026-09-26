// JsonAI-1. Puts your prompt in a JSON. With all the right escapes.
export const meta = {
  id: 'json', name: 'JsonAI', model: 'JsonAI-1', tagline: 'Takes a prompt. Puts it in a JSON. Every escape, every time.',
  features: {
    0: ['Prompts up to 100 characters', 'Standard escapes: quotes, backslashes, newlines', 'Compact output'],
    1: ['Prompts up to 2,000 characters', 'Pretty-printed output', 'Custom key name'],
    2: ['Prompts up to 50,000 characters', 'Nested output: {"messages":[{"role":"user","content":…}]}', 'Unicode escaping (\\uXXXX) for maximum AI compatibility'],
  },
};
const MAX = [100, 2000, 50000];

export function infer(level, { prompt, name = 'prompt', pretty = false, nested = false, ascii = false }) {
  if (typeof prompt !== 'string') return { error: 'Prompt must be a string.' };
  if (prompt.length > MAX[level]) return { error: `Prompts over ${MAX[level].toLocaleString()} characters require a higher plan.`, code: 'plan' };
  if (name !== 'prompt' && level < 1) return { error: 'Custom key names require the Pro plan.', code: 'plan' };
  if (pretty && level < 1) return { error: 'Pretty printing requires the Pro plan.', code: 'plan' };
  if ((nested || ascii) && level < 2) return { error: 'Nested output and Unicode escaping require the Max plan.', code: 'plan' };
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) return { error: 'Key must be a plain identifier.' };

  const obj = nested ? { messages: [{ role: 'user', [name === 'prompt' ? 'content' : name]: prompt }] } : { [name]: prompt };
  let result = JSON.stringify(obj, null, pretty ? 2 : 0);
  if (ascii) result = result.replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

  const escapes = (result.match(/\\./g) || []).length;
  const cost = Math.max(1, prompt.length) + 3 + result.length;
  const trace = [
    `Received prompt: ${prompt.length} characters`, 'Tokenizing into characters (1:1, the AI standard)…',
    `Reasoning: ${escapes} character${escapes === 1 ? '' : 's'} require escaping. Escaping ${escapes === 0 ? 'nothing, but with confidence' : 'them'}.`,
    'Validating against RFC 8259… OK', 'Checking answer against safety policy… OK', "Checking answer against yesterday's answer… identical",
    `Billing ${cost} tokens (${Math.max(1, prompt.length)} input + 3 reasoning + ${result.length} output).`,
  ];
  return { result, cost, trace };
}
