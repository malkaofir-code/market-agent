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
 * Whether the account may post this message's picture.
 *
 * Only an image the channel credits to Wikimedia Commons under a
 * Creative Commons licence — the licence line is printed with it.
 * Everything else (a "תמונה: CNBC" screenshot, an uncredited picture
 * that may be a screenshot of X or a chart) gets a text card. Decided
 * with the owner on 8 Nov 2026: most images are mixed, don't use them.
 */
export function imageOf(row, lines = linesOf(row.text)) {
  const cred = lines.find(l => CREDIT.test(l))?.replace(CREDIT, '').trim() ?? null;
  const ok = !!(row.media_url && row.has_media !== false && cred
    && /wikimedia/i.test(cred) && /\bCC\b|creative commons|public domain/i.test(cred));
  return { url: ok ? row.media_url : null, credit: ok ? `תמונה: ${cred}` : null, raw: cred };
}

const firstSentence = s => (String(s ?? '').match(/^.*?[.!?](?=\s|$)/)?.[0] ?? String(s ?? '')).trim();

/** One message as one story, or null when it says nothing (photo only). */
export function storyOf(row) {
  const lines = linesOf(row.text);
  const headline = headlineOf(row.text);
  if (!headline || headline.length < 8) return null;
  const rest = lines.slice(lines.findIndex(l => stripLeadEmoji(l).replace(/^מבזק\s*:\s*/, '').trim() === headline) + 1);

  let meaning = null, opinion = null, where = null, next = null;
  const bullets = [], prose = [];
  for (const l of rest) {
    if (MEANING.test(l)) meaning = l.replace(MEANING, '').trim();
    else if (OPINION.test(l)) opinion = l.replace(OPINION, '').trim();
    else if (WHERE.test(l)) where = l.replace(WHERE, '').trim();
    else if (NEXT.test(l)) next = l.replace(NEXT, '').trim();
    else if (CREDIT.test(l)) continue;
    else if (BULLET.test(l)) bullets.push(l.replace(BULLET, '').trim());
    else prose.push(l);
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
    bullets, meaning, opinion, where, next,
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
