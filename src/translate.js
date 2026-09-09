// ─────────────────────────────────────────────────────────────
// translate.js — the Hebrew line, in English, with a lock on it.
//
// The voice used to say the topic and the figure and nothing else:
// "Chip stocks, up three point seven five percent." True, safe, and
// not news. A stranger scrolling past learns that a number moved,
// never what happened.
//
// So this translates the headline. It is the ONE place in the whole
// pipeline where a model writes a sentence, and everything about it
// is built around not trusting that sentence.
//
// The rule the account is built on has not changed: every number it
// publishes must be traceable to something the source actually said.
// A translator cannot be argued into that, so it is not asked to be —
// it is checked. Every digit in the English must already appear in
// the Hebrew, or the translation is thrown away and the card falls
// back to the structured line compose.js already built. A model may
// rephrase; it may not introduce a number.
//
// That guard is mechanical, it runs on every line, and it is the
// reason this file is allowed to exist at all.
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.TRANSLATE_MODEL || 'claude-haiku-4-5-20251001';
const MS = Number(process.env.TRANSLATE_TIMEOUT_SEC || 45) * 1000;

// The free one. Runs on the runner like the voice does — no key, no
// bill, no third party that can rate-limit a reel at 17:06. It is a
// small many-to-one model rather than a dedicated Hebrew pair, which
// is the price of it being 45MB of npm instead of a gigabyte of
// torch, and it reads rougher than a large model would.
//
// That is survivable ONLY because of the guard below. A rough
// sentence is a rough sentence; a wrong number would be a lie, and
// the guard is what makes the difference between the two.
const MT_MODEL = process.env.MT_MODEL || 'Xenova/opus-mt-mul-en';
const MT_CACHE = process.env.MT_CACHE || '.mt';

/**
 * Every number in a string, in a form two languages can be compared in.
 *
 * Three normalisations, each one a way the same figure gets written
 * differently on either side of a translation:
 *
 *   61,400  ->  61400    a comma before exactly three digits is a
 *                        thousands separator, the same rule parse.js
 *                        uses — and getting this wrong is literally
 *                        how SPX was published as +46.06%
 *   3,75    ->  3.75     any other comma is a decimal point
 *   0.40    ->  0.4      trailing zeros are the same number, and a
 *                        model writes 0.40% for 0.4% constantly
 */
export function numbersIn(text) {
  const out = new Set();
  for (const m of String(text ?? '').matchAll(/\d+(?:[.,]\d+)*/g)) {
    out.add(m[0]
      .replace(/,(\d{3})(?!\d)/g, '$1')
      .replace(',', '.')
      .replace(/(\.\d*?)0+$/, '$1')
      .replace(/\.$/, ''));
  }
  return out;
}

/**
 * Does this English line invent anything countable?
 *
 * Direction is deliberately NOT checked here — "up" and "down" carry
 * no digits — because the board behind the line is already drawing
 * the direction from the same parsed field, and a mismatch there
 * would be visible rather than silent.
 */
export function keepsItsNumbers(english, hebrew) {
  const src = numbersIn(hebrew);
  for (const n of numbersIn(english)) if (!src.has(n)) return false;
  return true;
}

const PROMPT = `You translate Hebrew financial news headlines into English for a spoken voiceover.

Rules, in order of importance:
1. Translate ONLY what the Hebrew says. Never add a fact, a number, a company, a cause or a consequence that is not in the source.
2. Every number must appear exactly as in the Hebrew. Do not round, convert, recalculate or infer one.
3. Plain spoken English, at most 14 words. It is read aloud, so no brackets, no quotes, no abbreviations a reader would have to unpack.
4. Keep the tense and the certainty of the original. If the Hebrew says something is expected, say expected.
5. No opinion, no framing, no "breaking", no hype.

Reply with a JSON array of strings, one per input headline, in the same order. Nothing else.`;

/**
 * Is this sentence shaped like a translation, or like a model falling over?
 *
 * The number guard catches the dangerous failure. This catches the
 * embarrassing one: a small MT model handed an unfamiliar headline
 * emits Hebrew it never translated, or the same word eight times, or
 * three words where the source had fifteen. None of those is unsafe.
 * All of them sound broken read aloud over a card, and the structured
 * line they would replace does not.
 */
export function looksTranslated(en, he) {
  const t = String(en ?? '').trim();
  if (!t) return false;
  if (/[\u0590-\u05FF]/.test(t)) return false;              // Hebrew left in
  const words = t.split(/\s+/);
  if (words.length > 18) return false;
  // Degenerate repetition: the same word three times running, or one
  // word making up more than half a long sentence.
  for (let i = 2; i < words.length; i++)
    if (words[i].toLowerCase() === words[i - 1].toLowerCase()
      && words[i] === words[i - 2]) return false;
  const counts = new Map();
  for (const w of words) counts.set(w.toLowerCase(), (counts.get(w.toLowerCase()) ?? 0) + 1);
  if (words.length >= 6 && Math.max(...counts.values()) > words.length / 2) return false;
  // A fifteen-word headline rendered as two words dropped the story.
  const src = String(he ?? '').trim().split(/\s+/).length;
  if (src >= 6 && words.length < 3) return false;
  return true;
}

/** The free backend: a small translation model, on this machine. */
async function localLines(texts) {
  const { pipeline, env } = await import('@xenova/transformers');
  env.cacheDir = MT_CACHE;
  env.allowLocalModels = true;
  const pipe = await pipeline('translation', MT_MODEL, { quantized: true });
  const out = [];
  for (const t of texts) {
    const r = await pipe(t, { max_new_tokens: 60 });
    out.push(String(r?.[0]?.translation_text ?? '').replace(/\s+/g, ' ').trim());
  }
  return out;
}

/** The paid backend, used only when a key is present. */
async function claudeLines(texts) {
  const key = process.env.ANTHROPIC_API_KEY;
  const body = {
    model: MODEL, max_tokens: 1000, system: PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(texts) }],
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), MS);
  let json;
  try {
    const res = await fetch(API, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key,
        'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    json = await res.json().catch(() => null);
    if (!res.ok || json?.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? `no reply in ${MS / 1000}s` : e.message);
  } finally { clearTimeout(timer); }
  const text = (json?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('');
  const m = /\[[\s\S]*\]/.exec(text);
  if (!m) return null;
  const arr = JSON.parse(m[0]);
  return Array.isArray(arr) ? arr.map(x => String(x ?? '').replace(/\s+/g, ' ').trim()) : null;
}

/**
 * Hebrew headlines -> English lines, or null.
 *
 * Null on any failure at all — no key, a refused model, a timeout, a
 * malformed reply, the wrong number of lines back. The caller keeps
 * the structured narration it already has, which is worse English and
 * has never once been wrong.
 */
export async function translate(lines) {
  const wanted = lines.map((t, i) => ({ i, t: String(t ?? '').trim() })).filter(x => x.t);
  if (!wanted.length) return null;

  // A key upgrades the translator and is never required. Without one
  // the free model runs; without either, the caller keeps the
  // structured narration it already built.
  const backend = process.env.ANTHROPIC_API_KEY ? 'claude' : 'local';
  let arr;
  try {
    arr = backend === 'claude'
      ? await claudeLines(wanted.map(x => x.t))
      : await localLines(wanted.map(x => x.t));
  } catch (e) {
    throw new Error(`translate (${backend}): ${e.message}`);
  }
  if (!Array.isArray(arr) || arr.length !== wanted.length) return null;

  const out = Array(lines.length).fill(null);
  const rejected = [];
  wanted.forEach((w, k) => {
    const en = String(arr[k] ?? '').replace(/\s+/g, ' ').trim();
    if (!looksTranslated(en, w.t)) { rejected.push({ he: w.t, en, why: 'shape' }); return; }
    if (!keepsItsNumbers(en, w.t)) { rejected.push({ he: w.t, en, why: 'invented a number' }); return; }
    out[w.i] = en;
  });
  return { lines: out, rejected, backend };
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
  'eighty', 'ninety'];
const intWords = n => n < 20 ? ONES[n]
  : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '')
  : `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${intWords(n % 100)}` : ''}`;

/**
 * Digits into words, AFTER the guard has run.
 *
 * The guard compares digits to digits and has to, so this happens
 * last: "up 3.75%" becomes "up three point seven five percent"
 * because a synthesiser reading "3.75%" aloud is a coin toss between
 * that and "three point seventy five". Anything a thousand or over is
 * a level rather than a rate and is left alone — piper reads those
 * correctly and spelling them out loses the listener.
 */
export function speakable(line) {
  return String(line ?? '').replace(/(\d+)(?:[.,](\d+))?%/g, (all, whole, frac) => {
    const n = Number(whole);
    if (!Number.isFinite(n) || n > 999) return all;
    const head = intWords(n);
    const tail = frac ? ` point ${[...frac].map(d => ONES[Number(d)]).join(' ')}` : '';
    return `${head}${tail} percent`;
  });
}
