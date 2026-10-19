// ─────────────────────────────────────────────────────────────
// analysts.js — what the investment banks said this week, attributed.
//
// WHAT THIS IS, AND IS NOT
//
// The channel reports analyst moves all day: "Goldman upgraded Zeta",
// "UBS raised its Meta target to $884". This file lifts those out and
// sets them on one board per week. Every row names the firm that said
// it. Nothing here is our recommendation and the board says so on its
// face: this account is not a licensed investment adviser, and a board
// of "buy this" under its own name would be advice it cannot give.
//
// So the rules are narrow on purpose:
//   · a row needs a NAMED firm and a recognised action, or it is dropped;
//   · the words on the row are the channel's own sentence, never ours;
//   · the only things this file adds are the firm name, a label for the
//     kind of move, and the price target, all read straight off the text;
//   · nothing is ranked by whether we agree.
// ─────────────────────────────────────────────────────────────

import { assetsIn } from './claims.js';

const flat = s => String(s ?? '').replace(/["'׳״’“”]/g, '').replace(/[‎‏]/g, '');

export const FIRMS = [
  ['Goldman Sachs', /Goldman/i], ['Morgan Stanley', /Morgan Stanley/i],
  ['JPMorgan', /JP ?Morgan/i], ['Bank of America', /BofA|Bank of America/i],
  ['Citi', /\bCiti(?:group)?\b/i], ['Barclays', /Barclays/i], ['UBS', /\bUBS\b/],
  ['Bernstein', /Bernstein/i], ['Cantor Fitzgerald', /Cantor/i], ['Macquarie', /Macquarie/i],
  ['D.A. Davidson', /D\.?A\.? Davidson/i], ['Wells Fargo', /Wells Fargo/i],
  ['Jefferies', /Jefferies/i], ['Mizuho', /Mizuho/i], ['Piper Sandler', /Piper Sandler/i],
  ['Wedbush', /Wedbush/i], ['Evercore ISI', /Evercore/i], ['RBC', /\bRBC\b/],
  ['TD Cowen', /TD Cowen|\bCowen\b/i], ['Raymond James', /Raymond James/i],
  ['BMO', /\bBMO\b/], ['Morningstar', /Morningstar/i], ['Deutsche Bank', /Deutsche Bank/i],
  ['HSBC', /\bHSBC\b/], ['Truist', /Truist/i], ['KeyBanc', /KeyBanc/i],
  ['Oppenheimer', /Oppenheimer/i], ['Needham', /Needham/i], ['Loop Capital', /Loop Capital/i],
  ['Stifel', /Stifel/i], ['Baird', /\bBaird\b/], ['BlackRock', /BlackRock/i],
  ['Nomura', /Nomura/i], ['Bernstein', /Bernstein/i], ['Susquehanna', /Susquehanna/i],
  ['Truist', /Truist/i], ['Melius', /Melius/i], ['Rothschild & Co Redburn', /Redburn/i],
];

// Order is the point: a rating CHANGE outranks a target change, and a
// target raise inside a sentence that also says "kept the rating" is
// still a target raise.
const ACTIONS = [
  ['init', 'כיסוי חדש', 'nu', /כיסוי|המלצת (?:קנייה|מכירה) ראשונה|פתח(?:ה|ו)? (?:את )?(?:ה)?כיסוי|פתח(?:ה|ו)? ב(?:דירוג|המלצ)/],
  ['up', 'שדרוג', 'up', /שדרג|שדרוג|(?:העלה|העלתה|מעלה|מעלים)(?: את)? (?:ה)?(?:דירוג|המלצ)/],
  ['dn', 'הורדת דירוג', 'dn', /(?:הוריד|הורידה|הורידו|מוריד|מורידה|מורידים)(?: את)? (?:ה)?(?:דירוג|המלצ)|הורדת (?:ה)?(?:דירוג|המלצ)/],
  ['ptup', 'העלאת יעד', 'up', /(?:העלה|העלתה|העלו|מעלה|מעלים)(?: את)? (?:ה)?מחיר(?:י)? ?(?:ה)?יעד/],
  ['ptdn', 'הורדת יעד', 'dn', /(?:הוריד|הורידה|הורידו|מוריד|מורידה|מורידים)(?: את)? (?:ה)?מחיר(?:י)? ?(?:ה)?יעד/],
  ['same', 'אישור המלצה', 'nu', /שימר|שומר|שמרו|חזר(?:ה)? ואישר|אישוש|מחזק(?:ת)? (?:את )?(?:ה)?המלצ|מאשר(?:ת)? (?:את )?(?:ה)?המלצ/],
];
const RANK = { init: 0, up: 0, dn: 0, ptup: 1, ptdn: 1, same: 2 };

const RATING = /\b(Overweight|Outperform|Underweight|Underperform|Equal[- ]Weight|Neutral|Market Perform|Sector Perform|Buy|Sell|Hold)\b/i;

function targetOf(f) {
  const i = f.search(/יעד/);
  if (i < 0) return null;
  const tail = f.slice(i, i + 90);
  const to = tail.match(/(?:^|[^א-תA-Za-z\d])ל-?\s*\$?(\d[\d,]*(?:\.\d+)?)\s*(?:דולר|\$)/);
  const plain = tail.match(/יעד[^\d\n]{0,20}\$?(\d[\d,]*(?:\.\d+)?)\s*(?:דולר|\$)/);
  const v = (to ?? plain)?.[1];
  return v ? `$${v.replace(/,$/, '')}` : null;
}

const lineOf = t => String(t ?? '').split('\n').map(x => x.replace(/[‎‏]/g, '').trim())
  .filter(Boolean);
const strip = s => s.replace(/^[\s\p{Extended_Pictographic}️]+/u, '').trim();
const firstSentence = s => (s.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? s);

// Cut at a clause, not mid-phrase: a row ending "…, עם" reads as broken.
function shorten(t, max = 120) {
  if (t.length <= max) return t;
  const comma = t.lastIndexOf(',', max);
  if (comma > 50) return t.slice(0, comma).replace(/[,\s]+$/, '') + '.';
  return `${t.slice(0, t.lastIndexOf(' ', max - 2))}…`;
}

/** One message as one attributed analyst move, or null. */
export function analystCall(row) {
  const lines = lineOf(row.text).slice(0, 4);
  if (!lines.length) return null;
  // A weekly roundup of other people's roundups names no firm and
  // says nothing checkable; it never matches below, and a calendar
  // ("לוח המניות החמות") must not either. The line that carries the
  // firm AND the action is the one quoted back; the firm alone is not
  // enough, because "Goldman מתהפך" is a headline, not a rating.
  const hasFirm = l => FIRMS.some(([, p]) => p.test(l));
  const hasAct = l => ACTIONS.some(([, , , re]) => re.test(flat(l)));
  const firmLine = lines.find(l => hasFirm(l) && hasAct(l));
  if (!firmLine) return null;
  const f = flat(firmLine);
  const firm = FIRMS.find(([, p]) => p.test(firmLine))[0];
  const [id, label, dir] = ACTIONS.find(([, , , re]) => re.test(f));
  const text = strip(firstSentence(strip(firmLine.replace(/^(?:הסיבה|הרקע|לפי [^:]{2,30})\s*:\s*/, ''))));
  return {
    tg_id: Number(row.tg_id), ts: Number(row.ts ?? 0),
    firm, act: id, label, dir,
    target: targetOf(flat(lines.join(' '))),
    rating: (flat(lines.join(' ')).match(RATING) ?? [])[1] ?? null,
    text: shorten(text),
    blob: flat(lines.join(' ')),
  };
}

/**
 * The week's board: rating changes first, then targets, then
 * reiterations; newest first inside each; at most two per firm.
 */
export function analystsFrom(rows, { max = 8 } = {}) {
  const seen = new Set(), perFirm = new Map(), out = [];
  const all = (rows ?? []).map(analystCall).filter(Boolean)
    .sort((a, b) => RANK[a.act] - RANK[b.act] || b.ts - a.ts);
  for (const c of all) {
    const k = `${c.firm}|${c.text}`;
    if (seen.has(k) || (perFirm.get(c.firm) ?? 0) >= 2) continue;
    seen.add(k); perFirm.set(c.firm, (perFirm.get(c.firm) ?? 0) + 1);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

// ── the note on a movement post ───────────────────────────────
//
// Every post about a move carries one line from the analysts: what a
// named bank said about THIS company when the channel reported it, or,
// when it reported nothing about it, the week's strongest bank move,
// labelled as the week's and not as being about this story. Nothing is
// written by us: the firm, the label and the target are the ones
// analystCall read off the channel's own sentence.

const GENERIC = new Set(['THE', 'INC', 'CORP', 'LTD', 'PLC', 'USA', 'ETF', 'CEO', 'CFO', 'IPO', 'GDP',
  'CPI', 'PCE', 'FED', 'FOMC', 'EPS', 'SEC', 'OPEC', 'AI', 'US', 'EU', 'UK', 'GLOBAL', 'TECHNOLOGIES',
  'TECHNOLOGY', 'HOLDINGS', 'GROUP', 'SYSTEMS', 'PLATFORMS', 'INTERNATIONAL', 'CAPITAL', 'FINANCIAL',
  'BANK', 'AMERICA', 'EQUAL', 'WEIGHT', 'OVERWEIGHT', 'OUTPERFORM', 'NEUTRAL', 'BUY', 'SELL', 'HOLD',
  'NYSE', 'NASDAQ', 'DOW', 'WALL', 'STREET', 'AIStockSavvy'.toUpperCase()]);
const firmWords = new Set(FIRMS.flatMap(([n]) => n.toUpperCase().split(/[^A-Z]+/)).filter(Boolean));

/** Latin names and tickers in a text, in order, minus firms and filler. */
export function subjectsOf(text) {
  const out = [];
  for (const t of flat(text).match(/\b[A-Za-z][A-Za-z&.]{2,}\b/g) ?? []) {
    const u = t.toUpperCase().replace(/\.$/, '');
    if (GENERIC.has(u) || firmWords.has(u) || out.some(x => x.toUpperCase() === u)) continue;
    out.push(t);
  }
  return out;
}

/** The week's analyst moves, newest first, rating changes ahead of targets. */
export function analystPool(rows) {
  return (rows ?? []).map(analystCall).filter(Boolean)
    .sort((a, b) => RANK[a.act] - RANK[b.act] || b.ts - a.ts);
}

/**
 * The note for one story, or null when the pool is empty.
 * { firm, label, target, subject, about: 'story' | 'week' }
 */
export function noteFor(story, pool, { skip = null, seed = 0 } = {}) {
  const calls = (pool ?? []).filter(c => c.tg_id !== skip);
  if (!calls.length) return null;
  const mine = subjectsOf(`${story ?? ''}`).map(x => x.toUpperCase());
  const syms = new Set(assetsIn(String(story ?? '')).map(a => a.sym));
  const hit = calls.find(c => {
    const theirs = subjectsOf(c.blob).map(x => x.toUpperCase());
    return mine.some(m => theirs.includes(m)) ||
      assetsIn(c.blob).some(a => syms.has(a.sym));
  });
  const c = hit ?? calls[Math.abs(seed) % Math.min(calls.length, 4)];
  const shared = hit ? subjectsOf(hit.blob).find(x => mine.includes(x.toUpperCase())) : null;
  return { firm: c.firm, label: c.label, target: c.target, dir: c.dir,
    subject: shared ?? subjectsOf(c.blob)[0] ?? null, about: hit ? 'story' : 'week' };
}
