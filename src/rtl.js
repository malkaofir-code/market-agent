// ─────────────────────────────────────────────────────────────
// rtl.js — the four bidi rules from design.html §06.
// Every one of these cost a published mistake. Do not "simplify".
// ─────────────────────────────────────────────────────────────

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
export const esc = s => String(s ?? '').replace(/[&<>]/g, c => ESC[c]);

// Every line in the source channel is prefixed with U+200F (RLM).
// Invisible, and it sits BEFORE the emoji — so an emoji-anchored
// regex finds nothing until these are gone. Strip all bidi controls
// on the way in; the slide sets direction:rtl on the container and
// does not need them.
const BIDI_CTRL = /[‎‏‪-‮⁦-⁩]/g;
export const clean = s => String(s ?? '').replace(BIDI_CTRL, '').trim();

// Rule 1 — the maqaf serves two masters.
// U+05BE is both a prefix hyphen (כ־5% = "about 5%") and a minus
// ((־2.62%) = minus). A leading hyphen is a minus ONLY when nothing
// word-like precedes it. The inner lookbehind is what stops six
// figures on one deck from flipping sign; the [.,] in the outer one
// is what stops (־2.62%) matching as 62%.
export const PCT = /(?<![\w.,])((?:(?<![֐-׿])[+\-−־])?\d+(?:[.,]\d+)?%)/gu;

// Rule 2 — isolate RANGES before numbers. A dash between two
// isolates takes the paragraph direction and renders 23:00–23:15
// backwards, so the whole range goes in ONE span.
const RANGE = /(?<![\w.])(\d{1,2}[:.]\d{2}\s*[–—\-־]\s*\d{1,2}[:.]\d{2})/gu;

// Then one isolate per NUMBER — never per digit group, or 14/05
// renders 05/14. Currency rides inside, or $325 renders 325$.
const SINGLE = /(?<![\w.])([$€£₪]?[+\-−]?\d+(?:[.,:\/]\d+)*%?)/gu;

// Latin runs need isolating too, or NVDA inside Hebrew drifts.
// An ampersand pair is ONE run: isolating "NQ" and "ES" separately
// let the & take the paragraph direction and broke the CTA line.
const LATIN = /\b([A-Za-z][A-Za-z0-9.]{1,11}(?:\s*&\s*[A-Za-z][A-Za-z0-9.]{1,11})?)\b/gu;

// §07 — one leading decorative emoji is stripped from every slide
// string. They stay in the caption.
const LEAD_EMOJI = /^\s*(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]+)\s*/u;
export const stripLeadEmoji = s => clean(s).replace(LEAD_EMOJI, '');

/**
 * Escape and isolate in ONE pass over the original string.
 *
 * Sequential .replace() passes cannot work here: a sentinel holding an
 * earlier match gets re-matched by a later pass (the digit inside a
 * placeholder is itself a number), and escaping first lets LATIN match
 * the "quot" inside &quot; — which put a literal &quot; on a cover.
 * So: collect spans, earlier passes win overlaps, build output once.
 * Priority: ranges -> numbers -> latin.
 */
export function bidi(raw, { emoji = 'strip' } = {}) {
  let s = emoji === 'strip' ? stripLeadEmoji(raw) : clean(raw);

  const taken = [];
  const free = (a, b) => !taken.some(t => a < t.end && b > t.start);
  const collect = (re, cls) => {
    for (const m of s.matchAll(re)) {
      const start = m.index, end = start + m[0].length;
      if (free(start, end)) taken.push({ start, end, cls, text: m[0] });
    }
  };
  collect(RANGE, 'range');
  collect(SINGLE, 'num');
  collect(LATIN, 'lat');
  taken.sort((a, b) => a.start - b.start);

  let out = '', pos = 0;
  for (const t of taken) {
    out += esc(s.slice(pos, t.start));
    // A range is ONE span carrying an inner isolate per number, or the
    // dash between two isolates takes the paragraph direction and
    // renders 21:00–21:15 backwards.
    out += t.cls === 'range'
      ? `<span class="num">${esc(t.text).replace(SINGLE, n => `<span class="num">${n}</span>`)}</span>`
      : `<span class="${t.cls}">${esc(t.text)}</span>`;
    pos = t.end;
  }
  return out + esc(s.slice(pos));
}

/** Signed percentages found in a string, sign-normalised. */
export function percents(raw) {
  const out = [];
  for (const m of String(raw ?? '').matchAll(PCT)) {
    const t = m[1].replace(/[−־]/g, '-').replace(',', '.');
    out.push({ text: m[1], value: parseFloat(t.replace('%', '')) });
  }
  return out;
}

/** Every standalone figure, for the "4+ figures is a table read aloud" test. */
export function figureCount(raw) {
  return [...String(raw ?? '').matchAll(SINGLE)].length;
}
