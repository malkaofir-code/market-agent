// ─────────────────────────────────────────────────────────────
// parse.js — one source message -> structured fields.
//
// Written against 299 real messages. The channel's schema turned
// out to be rigid, which is the whole reason template-only works:
//   line 1        headline        (p50 43 chars, 93% fit the cover)
//   lines 2..n    reporting       (goes to the caption, not a slide)
//   💡 משמעות:    interpretation  (54/54 use this exact label,
//                                  87% of the time as the last line)
// Every line arrives prefixed with U+200F; rtl.clean strips it.
// ─────────────────────────────────────────────────────────────
import { clean, percents, figureCount } from './rtl.js';

const NOTE = /^💡\s*משמעות\s*:\s*/;
const SOURCE = /(?:לפי|על פי|מקור)\s+([^,.\n]{2,40})/;
const TICKER = /\b(NQ|ES|YM|RTY|NDX|SPX)\b/g;

// A figure's sign is often carried by the Hebrew verb, not by a
// character: "ירידה של 3.2%" is a FALL written as a bare 3.2%.
// Publishing that in green on a finance account is the worst bug
// this pipeline can have, so: an explicit sign wins, a direction
// word is the fallback, and anything still ambiguous renders in
// plain ink. §02 - "colour appears only on signed values".
// Matched as STEMS, not whole words: Hebrew inflects the verb
// ("קפץ" / "קפצה" / "קפצו") and a word list misses two of the three.
// Both lists are deliberately over-inclusive - a false hit on BOTH
// sides falls through to ink, which is the safe direction to err in.
const UP   = /(עליי|עלייה|עולה|עלו |עלה |קפצ|קפיצ|זינק|זנק|מזנק|התחזק|מתחזק|טיפס|מטפס|שיא|ירוק|רווח|מרווי|התאושש)/;
const DOWN = /(ירידה|ירידו|ירד|יורד|צניח|צנח|צולל|נחלש|נחלשת|התרסק|מתרסק|מחק|נפל|אדום|הפסד|שפל|שוחק|נסוג|צלל|צונח|נופל|מאבד|נחתך|קורס|שוקע)/;

export function direction(figureText, sentence) {
  const t = String(figureText);
  if (/^[+]/.test(t)) return 'up';
  if (/^[-−־]/.test(t)) return 'dn';
  const up = UP.test(sentence), dn = DOWN.test(sentence);
  if (up && !dn) return 'up';
  if (dn && !up) return 'dn';
  return '';                       // ambiguous -> ink, never a guess
}

export function parse(row) {
  const lines = String(row.text ?? '').split('\n').map(clean).filter(Boolean);
  if (!lines.length) return null;

  const headline = lines[0];
  const rest = lines.slice(1);
  const noteAt = rest.findIndex(l => NOTE.test(l));
  const note = noteAt >= 0 ? rest[noteAt].replace(NOTE, '').trim() : null;
  const reporting = rest.filter((_, i) => i !== noteAt);

  const whole = lines.join(' ');
  const src = SOURCE.exec(whole);

  return {
    tg_id: row.tg_id,
    ts: row.ts,
    photo: row.media_url ? { src: row.media_url } : null,
    headline,
    stand: reporting[0] ?? null,      // one standfirst sentence, never the whole body
    reporting,                         // caption material
    note,
    source: src ? src[1].replace(/["']/g, '').trim() : null,
    tickers: [...new Set(String(row.text).match(TICKER) ?? [])],
    levels: levels(row.text),
    figures: percents(whole),
    figureCount: figureCount(whole),
    score: 0,
  };
}

/**
 * Futures levels quoted in the message - the tape's ONLY source.
 *
 * The channel's snapshot posts put the symbol on line 1 and the
 * numbers on line 2:
 *     NQ — תמונה טכנית
 *     מחיר 29,346.25 · שינוי +240.50 (+0.83%)
 * A single regex that forbade newlines matched none of them, so the
 * tape silently carried hours-old levels while a fresh snapshot sat
 * unparsed in the same window. Two shapes, handled separately.
 */
const SYM = /\b(NQ|ES|YM|RTY|NDX|SPX)\b/;
const PRICE = /מחיר\s*([\d][\d,]*(?:\.\d+)?)/;
const PAREN_PCT = /\(\s*([+\-−־]?\d+(?:[.,]\d+)?)\s*%\s*\)/;
// Tempered, so the gap between a symbol and "its" percentage cannot
// contain ANOTHER symbol. Untempered it crossed them freely:
// "NQ נסחר סביב 29,310 · ES עלה 1.03%" reported NQ at 1.03 — NQ had
// no percentage of its own, so it reached over and took ES's. Every
// row on the tape is an assertion about one instrument; a pattern
// that can wander to the next one has no business feeding it.
const INLINE = /\b(NQ|ES|YM|RTY|NDX|SPX)\b(?:(?!\b(?:NQ|ES|YM|RTY|NDX|SPX)\b)[^\n]){0,60}?((?<![\w.,])(?:(?<![֐-׿])[+\-−־])?\d+(?:[.,]\d+)?%)/g;

// A comma is a THOUSANDS separator in this channel — every price it
// quotes looks like 29,575.50 — and blindly reading it as a decimal
// point turned 46,061 into 46.061, which is very close to the wrong
// number that went out. Strip it where three digits follow; only then
// treat a remaining comma as the decimal mark some sources use.
const num = t => parseFloat(
  String(t).replace(/[−־]/g, '-').replace(/,(\d{3})(?!\d)/g, '$1').replace(',', '.'));

export function levels(text) {
  const raw = String(text ?? '');
  const lines = raw.split('\n').map(l => l.replace(/[‎‏]/g, '').trim()).filter(Boolean);
  const out = [];

  // shape 1 - the snapshot post: symbol heads the message
  const head = lines[0] && SYM.exec(lines[0]);
  if (head) {
    const body = lines.slice(1).join(' ');
    const pct = PAREN_PCT.exec(body);
    if (pct) {
      const price = PRICE.exec(body);
      out.push({ sym: head[1], last: price ? price[1] : null, chg: num(pct[1]) });
      return out;
    }
  }

  // shape 2 - a level mentioned inline in prose
  for (const m of raw.matchAll(INLINE)) {
    out.push({ sym: m[1], last: null, chg: num(m[2].replace('%', '')) });
  }
  return out;
}

/**
 * §05 cover rule: "The lead is chosen by score, not recency —
 * an interpretation is worth 4, an extractable figure 2, a named
 * source 1." Ties break toward the earlier message, so a burst
 * reads in the order it happened.
 */
export function score(p) {
  let s = 0;
  if (p.note) s += 4;
  if (p.figures.length) s += 2;
  if (p.source) s += 1;
  return s;
}
