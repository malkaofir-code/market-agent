// ─────────────────────────────────────────────────────────────
// story.js — one channel message → one story, in the channel's
// CURRENT format (Oct 2026 onward).
//
// parse.js was written for the old schema (headline, reporting lines,
// one 💡 line). The channel now writes:
//
//   🔴 מבזק                      a flash marker, its own first line
//   <headline>
//   <prose / bullets "•">
//   📌 מה הזיז:                   section header before bullets
//   📊 איפה אנחנו: …              where the indices stand
//   💡 משמעות: …                  what it means (the channel's own line)
//   💬 הדעה שלי: / 🧭 הקריאה שלי:  the channel's opinion
//   ⏭ הבא בתור: …                 what is next
//   ⬇️ ההרחבה… / 🔄 עודכן … / דעה אישית, לא ייעוץ…   chrome
//   תמונה: <credit>               where the picture came from
//
// Read it as it is written, without rewriting a word: every field
// below is a line, or the first sentence of a line, the channel wrote.
// ─────────────────────────────────────────────────────────────
import { clean, stripLeadEmoji, percents, figureCount } from './rtl.js';
import { direction } from './parse.js';

const CHROME = [
  /^🔴\s*מבזק\s*$/u, /^🔄\s*עודכן/u, /^⬇️?\s*ההרחבה/u, /^דעה אישית,?\s*לא ייעוץ/,
  /^📌\s*מה הזיז\s*:?\s*$/u,
];
const MEANING = /^💡\s*משמעות\s*:\s*/u;
const OPINION = /^(?:💬\s*הדעה שלי|🧭\s*הקריאה שלי)\s*:\s*/u;
const WHERE = /^📊\s*(?:איפה אנחנו\s*:\s*)?/u;
const NEXT = /^⏭\s*הבא בתור\s*:?\s*/u;
const CREDIT = /^תמונה\s*:\s*/;
const BULLET = /^[•▪·]\s*/;

/** The lines a message is made of, without the channel's chrome. */
export function linesOf(text) {
  return String(text ?? '').split('\n').map(clean).filter(Boolean)
    .filter(l => !CHROME.some(re => re.test(l)));
}

/** The text without chrome — for anything else that reads the message. */
export const stripChrome = text => linesOf(text).join('\n');

/**
 * The channel's headline: the first real line, with a leading
 * "מבזק:" and a leading emoji taken off. Exported for claims and the
 * claim recorder, so a flash is filed under its story, not under "מבזק".
 */
export function headlineOf(text) {
  const first = linesOf(text).find(l => !CREDIT.test(l)) ?? '';
  return stripLeadEmoji(first).replace(/^מבזק\s*:\s*/, '').trim();
}

/**
 * The message's picture.
 *
 * Every picture the channel posts is used, with its credit line where
 * the channel gave one (owner, 13 Nov 2026 — this replaces the 8 Nov
 * rule of Wikimedia-CC only).
 */
export function imageOf(row, lines = linesOf(row.text)) {
  const cred = lines.find(l => CREDIT.test(l))?.replace(CREDIT, '').trim() ?? null;
  const ok = !!(row.media_url && row.has_media !== false);
  return { url: ok ? row.media_url : null, credit: ok && cred ? `תמונה: ${cred}` : null, raw: cred };
}

// ── the channel's "📊 איפה אנחנו" line, as a board ────────────
// "נאסד״ק 100 ירד 1.4%, S&P 500 ירד 0.3%, VIX 17.2, תשואת 10 שנים 4.99%"
// Each comma item is read only when it is SHORT and SIMPLE: a name the
// table knows, at most a verb, then one number. "נסגר אתמול ב-1.38%-
// ל-29,402 נקודות וחוזיו יורדים כעת 2.6%" says two things about two
// moments and is dropped — a board must not pick one of them for us.
const INSTR = [
  [/נאסד["״']?ק\s*100|נאסד["״']?ק/u, 'נאסד״ק 100'], [/S&P\s*500|S&P/, 'S&P 500'], [/דאו/, 'דאו ג׳ונס'],
  [/ראסל/, 'ראסל 2000'], [/VIX|מדד הפחד/, 'VIX · מדד הפחד'], [/תשוא\S*\s*(?:ל-?)?10/, 'תשואה ל-10 שנים'],
  [/נפט|ברנט/, 'נפט'], [/זהב/, 'זהב'], [/ביטקוין|Bitcoin/i, 'ביטקוין'],
];
const UPW = /(?:^|\s)(?:עולה|עלה|עלתה|מוסיף|מוסיפה|הוסיף|מטפס|טיפס|קופץ|זינק|מזנק)(?:\s|$)/;
const DNW = /(?:^|\s)(?:יורד|ירד|ירדה|מאבד|איבד|צונח|צנח|נופל|נפל|נחלש)(?:\s|$)/;
export function boardOf(where) {
  if (!where) return [];
  const rows = [];
  for (const raw of String(where).split(/[,،]\s*/)) {
    const item = raw.replace(/[\u200e\u200f]/g, '').trim();
    const ins = INSTR.find(([re]) => re.test(item));
    if (!ins) continue;
    // The number is read AFTER the name ("S&P 500" carries a 500 of its
    // own), and a hyphen glued to a Hebrew letter ("ב-18.64") is a
    // prefix, not a minus.
    const after = item.slice(item.search(ins[0]) + (item.match(ins[0])?.[0].length ?? 0))
      .replace(/(?<=[\u0590-\u05FF])-/g, ' ').trim();
    if (after.split(/\s+/).filter(Boolean).length > 3) continue;   // too much going on
    if (/\(/.test(after)) continue;                                  // a second figure in brackets
    const num = after.match(/([+\-−]?\d[\d,]*(?:\.\d+)?)(%?)(-?)/);
    if (!num) continue;
    let v = num[1].replace('−', '-');
    const pct = num[2] === '%';
    if (num[3] === '-' && !v.startsWith('-')) v = `-${v}`;
    let dir = /^-/.test(v) ? 'dn' : /^\+/.test(v) ? 'up' : '';
    if (!dir && pct) dir = DNW.test(` ${after} `) ? 'dn' : UPW.test(` ${after} `) ? 'up' : '';
    if (pct && dir === 'dn' && !v.startsWith('-')) v = `-${v}`;
    if (pct && dir === 'up' && !v.startsWith('+')) v = `+${v}`;
    if (rows.some(r => r.name === ins[1])) continue;
    rows.push({ name: ins[1], value: `${v}${pct ? '%' : ''}`, dir: pct ? dir : '', pct });
  }
  return rows;
}

const firstSentence = s => (String(s ?? '').match(/^.*?[.!?](?=\s|$)/)?.[0] ?? String(s ?? '')).trim();

/** One message as one story, or null when it says nothing (photo only). */
export function storyOf(row) {
  const lines = linesOf(row.text);
  const headline = headlineOf(row.text);
  if (!headline || headline.length < 8) return null;
  const rest = lines.slice(lines.findIndex(l => stripLeadEmoji(l).replace(/^מבזק\s*:\s*/, '').trim() === headline) + 1);

  let meaning = null, opinion = null, where = null, next = null, inNext = false;
  const bullets = [], prose = [], nextItems = [];
  for (const l of rest) {
    if (MEANING.test(l)) { meaning = l.replace(MEANING, '').trim(); inNext = false; }
    else if (OPINION.test(l)) { opinion = l.replace(OPINION, '').trim(); inNext = false; }
    else if (WHERE.test(l)) { where = l.replace(WHERE, '').trim(); inNext = false; }
    else if (NEXT.test(l)) {
      next = l.replace(NEXT, '').trim() || null;
      if (next) nextItems.push(next);
      inNext = true;            // "⏭ הבא בתור:" may be a header over bullets
    }
    else if (CREDIT.test(l)) continue;
    else if (BULLET.test(l)) (inNext ? nextItems : bullets).push(l.replace(BULLET, '').trim());
    else { prose.push(l); inNext = false; }
  }
  const flash = /🔴\s*מבזק/u.test(String(row.text ?? ''));
  const read = /^\s*‏?\s*🧭/u.test(String(row.text ?? '')) || !!where;
  const kind = flash ? 'flash' : read ? 'read' : bullets.length >= 3 ? 'roundup' : 'plain';
  const whole = [headline, ...prose].join(' ');
  const figs = percents(headline).length ? percents(headline) : percents(prose[0] ?? '');
  const fig = figs.find(f => Math.abs(f.value) > 0 && Math.abs(f.value) <= 60) ?? null;
  const dir = fig ? direction(fig.text, `${headline} ${prose[0] ?? ''}`) : '';
  return {
    tg_id: Number(row.tg_id), ts: Number(row.ts ?? 0), kind, headline,
    lead: prose[0] ? firstSentence(prose[0]) : null,
    bullets, meaning, opinion, where, next, nextItems, board: boardOf(where),
    figure: fig && figureCount(headline) < 4 ? fig.text.replace(/[−־]/g, '-') : null,
    dir, image: imageOf(row, lines),
    text: lines.join('\n'),
    words: whole,
  };
}

// ── what matters most ────────────────────────────────────────
const BIG = /נאסד|S&P|הפד|ריבית|אינפלצי|CPI|PCE|תוצר|תמ"?ג|משרות|אבטלה|Nvidia|אנבידיה|Apple|Microsoft|Alphabet|Google|Amazon|Meta|Tesla|ביטקוין|נפט|מפולת|שיא/i;

/** How much a story matters, before age. */
export function weight(s) {
  let w = 0;
  if (s.kind === 'flash') w += 2;
  if (s.meaning) w += 2;
  if (s.figure) w += 1 + Math.min(2, Math.abs(parseFloat(s.figure)) / 5);
  if (BIG.test(s.headline)) w += 2;
  if (s.image.url) w += 1;
  if (s.kind === 'roundup') w -= 1;
  return w;
}

// The same story told six times (Eli Lilly, 29 Oct) is one story: the
// LATEST telling, which carries the most recent number. Same story =
// same Latin name in the headline, or most of the same words.
const nameOf = h => (String(h).match(/[A-Z][A-Za-z&.]{2,}/) ?? [null])[0];
const bag = h => new Set(String(h).replace(/["'׳״]/g, '').split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2));
function same(a, b) {
  const na = nameOf(a.headline), nb = nameOf(b.headline);
  if (na && nb && na === nb) return true;
  const A = bag(a.headline), B = bag(b.headline);
  const inter = [...A].filter(w => B.has(w)).length;
  return inter / Math.max(1, Math.min(A.size, B.size)) >= 0.6;
}

/** Messages → distinct stories, newest telling of each, best first. */
export function storiesOf(rows, { now = null, decayHours = 8 } = {}) {
  const all = (rows ?? []).map(storyOf).filter(Boolean).sort((a, b) => b.ts - a.ts);
  const kept = [];
  for (const s of all) if (!kept.some(k => same(k, s))) kept.push(s);
  const at = now ?? Math.max(0, ...kept.map(s => s.ts));
  const rank = s => weight(s) - (at - s.ts) / 3600 / decayHours;
  return kept.sort((a, b) => rank(b) - rank(a) || b.ts - a.ts);
}
