// ─────────────────────────────────────────────────────────────
// budget.js — how many words a board may carry. One table, every board.
//
// The account kept publishing walls: a story whose "what was reported"
// block ran seven lines over the headline, a cover whose standfirst
// was the wire paragraph. Each archetype trimmed its own text in its
// own way, or forgot to, and the walls came back through whichever
// path nobody had trimmed yet.
//
// So the limit now lives in ONE place and is applied to EVERY deck
// after it is composed, whatever built it. A board is read on a phone
// at arm's length for about two seconds: a headline is ten words, a
// meaning line is twenty, a supporting line is one, and the paragraph
// goes in the caption, where a reader who wants it can scroll.
//
// Cuts land on a sentence, else a clause, else a word that does not
// promise a continuation — never mid-phrase. The full text is never
// lost: captions are composed from the messages, not from the boards.
// ─────────────────────────────────────────────────────────────

/** Words a field may hold. `[n, w]`: at most n items of w words each. */
export const BUDGET = {
  // The day strip rides on any board that carries it (day.js).
  _day:         { money: 12, ron: 14 },
  // ── digests ──
  cover:        { headline: 12, stand: 20 },
  coverRule:    { headline: 12, stand: 20 },
  coverFramed:  { headline: 12, stand: 20 },
  coverBand:    { headline: 12, stand: 20 },
  coverPoster:  { headline: 12, stand: 20 },
  coverEdge:    { headline: 12, stand: 20 },
  coverStack:   { headline: 12, stand: 20 },
  coverSplit:   { headline: 12, stand: 20 },
  coverIndex:   { headline: 12, stand: 20 },
  coverBracket: { headline: 12, stand: 20 },
  coverFigure:  { headline: 12, stand: 20 },
  coverMargin:  { headline: 12, stand: 20 },
  coverBleed:   { headline: 12, stand: 20 },
  brief:        { title: 8, rows: { headline: 12, meaning: 18 } },
  outlook:      { up: { name: 6, why: 9 }, dn: { name: 6, why: 9 } },
  lesson:       { title: 8, steps: [3, 12], takeaway: 16 },
  detail:       { title: 10, facts: [3, 16] },
  voice:        { text: 24, about: 12 },
  item:         { text: 20, headline: 12 },
  list:         { rows: { text: 12, headline: 12 } },
  watch:        { text: 20, headline: 12 },
  chart:        { title: 10, text: 16 },
  // ── stories ──
  hero:         { quote: 18 },
  // The story that failed: a 7-line "what was reported" block. One
  // line of it now, and the meaning in a sentence.
  note:         { about: 12, text: 24, basis: [1, 16] },
  // ── proof ──
  coverProof:   { stand: 16 },
  proofCert:    { said: 14, why: 16 },
  proofVerdict: { said: 14, why: 16 },
  proofOrig:    { caption: 8 },
  record:       { note: 24, items: { said: 10 } },
  recordRows:   { note: 20, items: { said: 10 } },
  // ── analysts ──
  analysts:     { rows: { text: 16 } },
  // ── reels ──
  scene:        { headline: 9, sub: 6 },
  sceneProof:   { headline: 12, sub: 22 },
};

const DANGLE = new Set(['למרות', 'אחרי', 'לאחר', 'לפני', 'בעקבות', 'בגלל', 'מול',
  'על', 'של', 'את', 'עם', 'כי', 'כאשר', 'בזמן', 'תוך', 'ללא', 'לפי', 'בין',
  'כדי', 'אם', 'אך', 'אבל', 'או', 'וגם', 'גם', 'ו', 'ה', 'ב', 'ל', 'מ', 'ש']);

export const words = t => String(t ?? '').trim().split(/\s+/).filter(Boolean);

/**
 * `text` in at most `max` words. A sentence, else a clause, else a cut
 * that ends on a word that can end a sentence. HTML is never trimmed —
 * a marked reel line carries <em> and is already counted by fitCard.
 */
export function tight(text, max) {
  if (text == null || typeof text !== 'string' || /<[a-z]/i.test(text)) return text;
  const t = text.replace(/\s+/g, ' ').trim();
  const w = words(t);
  if (w.length <= max) return t;
  const fits = s => { const n = words(s).length; return n >= 3 && n <= max; };
  const first = t.split(/(?<=[.!?])\s+/)[0];
  if (fits(first)) return first;
  const clause = t.split(/\s*[—–,:;]\s*/)[0];
  if (fits(clause)) return clause;
  const cut = w.slice(0, max);
  while (cut.length > 3 && DANGLE.has(cut[cut.length - 1].replace(/[,.:;—–]+$/, ''))) cut.pop();
  return cut.join(' ').replace(/[,.:;—–\s]+$/, '') + '…';
}

function apply(value, rule) {
  if (value == null) return value;
  if (typeof rule === 'number') return typeof value === 'string' ? tight(value, rule) : value;
  if (Array.isArray(rule)) {
    const [n, w] = rule;
    if (!Array.isArray(value)) return value;
    return value.slice(0, n).map(v => typeof v === 'string' ? tight(v, w) : v);
  }
  if (typeof rule === 'object') {
    if (Array.isArray(value)) return value.map(v => (v && typeof v === 'object') ? budgetFields(v, rule) : v);
    if (typeof value === 'object') return budgetFields(value, rule);
  }
  return value;
}

function budgetFields(obj, rules) {
  const out = { ...obj };
  for (const [k, rule] of Object.entries(rules)) if (k in out) out[k] = apply(out[k], rule);
  return out;
}

/** One slide, inside its budget. Unknown types pass through untouched. */
export function budgetSlide(slide) {
  const rules = BUDGET[slide?.type];
  let out = rules ? budgetFields(slide, rules) : slide;
  if (out?.day) out = { ...out, day: budgetFields(out.day, BUDGET._day) };
  return out;
}

/** A whole deck. A skipped deck has no slides and comes back as it is. */
export function budgeted(deck) {
  if (!deck || !Array.isArray(deck.slides)) return deck;
  return { ...deck, slides: deck.slides.map(budgetSlide) };
}

/**
 * Every field of a slide that is over budget — for the test, and for
 * the dry run's log. Empty means the board is inside its budget.
 */
export function overBudget(slide) {
  const rules = BUDGET[slide?.type];
  if (!rules) return [];
  const bad = [];
  const walk = (val, rule, path) => {
    if (val == null) return;
    if (typeof rule === 'number') { if (typeof val === 'string' && !/<[a-z]/i.test(val) && words(val).length > rule) bad.push(`${path}: ${words(val).length} > ${rule}`); return; }
    if (Array.isArray(rule)) { if (!Array.isArray(val)) return; if (val.length > rule[0]) bad.push(`${path}: ${val.length} items > ${rule[0]}`);
      val.forEach((v, i) => walk(v, rule[1], `${path}[${i}]`)); return; }
    if (Array.isArray(val)) { val.forEach((v, i) => { for (const [k, r] of Object.entries(rule)) if (v && k in v) walk(v[k], r, `${path}[${i}].${k}`); }); return; }
    if (typeof val === 'object') for (const [k, r] of Object.entries(rule)) if (k in val) walk(val[k], r, `${path}.${k}`);
  };
  for (const [k, r] of Object.entries(rules)) if (k in slide) walk(slide[k], r, k);
  return bad;
}
