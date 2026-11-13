// ─────────────────────────────────────────────────────────────
// compose.js — channel messages → cards. (Nov 2026 rewrite)
//
// One design, used everywhere: the CARD. The channel's own headline,
// one line of what it means (the channel's "💡 משמעות"), the reader's
// money when the tape has an index move, and the picture only when
// the channel credits it to Wikimedia Commons under a CC licence.
//
//   composeEvening   21:00 "השוק בערב" — 3 cards: the day, then the
//                    two biggest stories.
//   composeStories   one card per story set (the hour's top story).
//   composeWeekReel  Sunday "השבוע בדקה" — the only reel of the week.
//
// The proof carousel and callback board live in proof.js. Everything
// a composer returns goes out through budget.js, so no board can carry
// a wall of text, whichever path built it.
//
// Deterministic. No model, no network: every word on a card is a word
// the channel wrote, cut at a sentence, a clause or a safe word.
// ─────────────────────────────────────────────────────────────
import { parse } from './parse.js';
import { clean, stripLeadEmoji } from './rtl.js';
import { budgeted } from './budget.js';
import { dayOf as dayLines, SERIES, SCHEDULE } from './day.js';
import { storiesOf } from './story.js';
import { insightOf } from './chart.js';
import { lessonAt, LESSONS } from './academy.js';
import 'dotenv/config';


const TZ = process.env.TZ || 'Asia/Jerusalem';
// 15 was the original design; hourly is what the free Actions tier
// affords, and it makes richer decks (~10-12 messages, not ~4).
export const WIN = Number(process.env.WINDOW_MINUTES || 60);
const WIN_S = WIN * 60;
// Minutes past the hour where a window starts and ends. 15 puts the
// boundary at XX:15 so the deck covers a full hour of trading and the
// tick at XX:16 always has a just-closed window to work on.
const OFFSET = Number(process.env.WINDOW_OFFSET_MIN || 15) % WIN;
const MAX = Number(process.env.MAX_SLIDES || 10);
const MIN_DECK = Number(process.env.MIN_SLIDES ?? 1);
const MAX_CTA = Number(process.env.MAX_SLIDES_WITH_CTA || 9);

export const fmt = (ts, o) => new Intl.DateTimeFormat('en-GB',
  { timeZone: TZ, hour12: false, ...o }).format(new Date(ts * 1000));
export const hhmm = ts => fmt(ts, { hour: '2-digit', minute: '2-digit' });
export const ddmmyy = ts => fmt(ts, { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '.');
export const dmy = ts => fmt(ts, { day: '2-digit', month: '2-digit' }).replace(/\//g, '.');
export const localDay = ts => fmt(ts, { year: 'numeric', month: '2-digit', day: '2-digit' })
  .split('/').reverse().join('-');

/**
 * What the masthead claims the deck covers.
 *
 * A digest is stamped from its window's START, which is right while a
 * deck is one hour long and wrong the moment windows merge. The
 * morning deck picks up where the evening one stopped — 21:15 the
 * night before — so it went out on 1 September announcing itself as
 * 31.08, and read as yesterday's paper. A post is dated the day it is
 * PUBLISHED; the span says how far back it reaches.
 */
const daysBack = w => Math.round(
  (Date.parse(localDay(w.end)) - Date.parse(localDay(w.start))) / 86400000);
export const span = w => {
  const d = daysBack(w);
  if (d <= 0) return `${hhmm(w.start)}\u2013${hhmm(w.end)}`;
  if (d === 1) return `\u05de\u05d0\u05de\u05e9 ${hhmm(w.start)}\u2013${hhmm(w.end)}`;
  return `${dmy(w.start)} ${hhmm(w.start)}\u2013${hhmm(w.end)}`;
};

/** Window key + bounds for any instant, snapped to the WIN grid. */
export function windowOf(ts) {
  const mins = Number(fmt(ts, { minute: '2-digit' }));
  // Windows are snapped to the OFFSET, not to the top of the hour, so
  // a window runs XX:15 -> XX+1:15 and the tick that closes it fires a
  // minute later. `into` is how far past the last boundary we are.
  const into = (mins - OFFSET + WIN) % WIN;
  const start = ts - into * 60 - Number(fmt(ts, { second: '2-digit' }));
  return { key: `${fmt(start, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .split('/').reverse().join('-')}T${hhmm(start)}`, start, end: start + WIN_S };
}

/**
 * The tape has no external feed: levels come from the channel's own
 * messages. 84% of windows quote at least one. When a symbol is
 * missing we carry the last known value forward — and the tape's
 * timestamp cell shows when that was, so staleness is visible on
 * the slide rather than hidden.
 */
/**
 * A daily move an index future can actually make.
 *
 * SPX went out on the 3 September deck reading "+46.06%". It is not a
 * percentage — it is the S&P's POINT change, about +0.7%, and it had
 * been sitting in the carry since 30 August being reprinted every day.
 * Cash-index circuit breakers halt trading at 7, 13 and 20 per cent,
 * so nothing above 25 is a real daily percentage; a number that large
 * is a misparse of points, and a misparse must never enter the tape.
 */
const PLAUSIBLE_PCT = Number(process.env.TAPE_MAX_PCT || 25);
const plausible = v => Number.isFinite(v) && Math.abs(v) <= PLAUSIBLE_PCT;

export function tape(parsed, carry = {}, now = null) {
  const at = now ?? Math.floor(Date.now() / 1000);
  const seen = { ...carry };
  for (const p of parsed) for (const l of p.levels) {
    if (!plausible(l.chg)) continue;
    seen[l.sym] = { ...l, at: p.ts, last: l.last ?? seen[l.sym]?.last ?? '—' };
  }

  // A quote is dropped once it is too old to be "the tape".
  //
  // The carry existed so a symbol quoted at 09:00 still showed at
  // 09:40, and it had no expiry at all — so YM was printing a figure
  // from two days earlier and SPX one from four days earlier, on a
  // board stamped with tonight's time. That is not a stale number, it
  // is a false one: the strip asserts these are the levels now.
  // Better to show two rows than four wrong ones.
  const maxAge = Number(process.env.TAPE_MAX_AGE_MIN || 360) * 60;
  const fresh = sym => seen[sym] && at - Number(seen[sym].at ?? 0) <= maxAge;

  // And the carry itself is pruned, or the table accumulates dead
  // symbols for ever and every read has to re-filter them.
  const keep = Number(process.env.TAPE_CARRY_HOURS || 48) * 3600;
  for (const k of Object.keys(seen))
    if (at - Number(seen[k].at ?? 0) > keep) delete seen[k];
  // design.html's specimen used NQ/ES/YM, but the channel actually
  // quotes NQ, ES and SPX - YM never appeared once in 7 days. Keeping
  // YM in and SPX out silently threw away a third of the tape, and
  // left the chart slide (which needs 3 points) unbuildable.
  const order = ['NQ', 'ES', 'SPX', 'YM', 'NDX', 'RTY'];
  const quotes = order.filter(fresh).map(s => seen[s]);
  // Stamped from the OLDEST row on the strip, not the newest. The
  // stamp is a promise about everything printed under it, and taking
  // the newest let one live quote certify three dead ones.
  const oldest = quotes.length ? Math.min(...quotes.map(q => Number(q.at) || 0)) : 0;
  return { quotes, carry: seen, stamp: oldest ? hhmm(oldest) : '' };
}

/**
 * The channel re-posts a "futures snapshot" several times an hour.
 * Those messages ARE the tape's data source, so they are consumed
 * into it and never become list rows - otherwise a 12-message
 * morning burst spends three slides restating the strip that is
 * already printed on all of them.
 */
const SNAPSHOT = /^(?:חוזים עתידיים|מצב החוזים|תמונת מצב)/;
export const isSnapshot = p =>
  SNAPSHOT.test(stripLeadEmoji(p.headline)) ||
  (p.levels.length >= 2 && p.reporting.length <= 1);


const esc = t => String(t ?? '').replace(/[&<>]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const CARD_WORDS = Number(process.env.REEL_CARD_WORDS || 9);
export function fitCard(headline) {
  const t = String(headline ?? '').replace(/\s+/g, ' ').trim();
  const words = t.split(' ');
  if (words.length <= CARD_WORDS) return { text: t, trimmed: false };

  // The FIRST clause only. Scanning on for any clause that happens to
  // fit picked the tail off "Trump announced a 25% tariff — markets
  // fell", and published "markets fell" as the headline: true, and
  // about a different story than the one the card was for.
  const first = t.split(/\s*[—–,:;]\s*/)[0].trim();
  const fn = first.split(' ').filter(Boolean).length;
  if (fn >= 3 && fn <= CARD_WORDS) return { text: first, trimmed: true };

  return { text: trimTail(words.slice(0, CARD_WORDS)).join(' '), trimmed: true };
}

/**
 * Never end a card on a word that was about to say something else.
 *
 * A hard cut landed one headline on "…בישיבה הקרובה למרות" — "despite"
 * with nothing after it, which does not read as a shortened sentence,
 * it reads as the opposite of one. These are the Hebrew words that
 * promise a continuation; if the cut lands on one, it goes.
 */
const DANGLE = new Set(['למרות', 'אחרי', 'לאחר', 'לפני', 'בעקבות', 'בגלל', 'מול',
  'על', 'של', 'את', 'עם', 'כי', 'כאשר', 'בזמן', 'תוך', 'ללא', 'לפי', 'בין',
  'כדי', 'אם', 'אך', 'אבל', 'או', 'וגם', 'גם']);
function trimTail(words) {
  const out = [...words];
  while (out.length > 3 && DANGLE.has(out[out.length - 1].replace(/[.,;:]$/, ''))) out.pop();
  return out;
}

const TOPICS = [
  { re: /נאסד|nasdaq|NQ\b/i,                    word: 'נאסד״ק',        tag: 'נאסדק',    en: 'the Nasdaq' },
  { re: /S&P|אס אנד פי|ES\b/i,                  word: 'S&P 500',       tag: 'SP500',    en: 'the S and P 500' },
  { re: /דאו|YM\b/i,                            word: 'דאו ג׳ונס',     tag: 'דאוגונס',  en: 'the Dow' },
  { re: /ריבית|הפד\b|פדרל|פאוול|FOMC/i,         word: 'ריבית הפד',     tag: 'ריביתהפד', en: 'the Fed' },
  { re: /אינפלצי|מדד המחירים|CPI|PCE/i,          word: 'אינפלציה',      tag: 'אינפלציה', en: 'inflation' },
  { re: /נפט|ברנט|אופ"?ק|OPEC/i,                 word: 'נפט',           tag: 'נפט',      en: 'oil' },
  { re: /זהב|gold/i,                             word: 'זהב',           tag: 'זהב',      en: 'gold' },
  { re: /ביטקוין|קריפטו|bitcoin|BTC/i,           word: 'קריפטו',        tag: 'קריפטו',   en: 'crypto' },
  { re: /תשואו?ת|אג"?ח|אגרות חוב|treasury/i,     word: 'תשואות אג״ח',   tag: 'אגח',      en: 'bond yields' },
  { re: /דולר|שקל|מטבע|forex/i,                  word: 'מט״ח',          tag: 'מטח',      en: 'currencies' },
  { re: /אנבידיה|NVDA|שבבים|semiconduct/i,       word: 'שבבים',         tag: 'שבבים',    en: 'chip stocks' },
  { re: /טראמפ|trump|מכס|tariff/i,               word: 'מכסים',         tag: 'מכסים',    en: 'tariffs' },
  { re: /דוחות|earnings|רווחי/i,                 word: 'עונת הדוחות',   tag: 'דוחות',    en: 'earnings' },
];

// ── the comment ask ──────────────────────────────────────────
// A comment is the strongest signal a post can earn, and the account
// has had none. One plain question at the end of every caption, never a
// question about what to buy or sell. Rotates by window, so the same
// line does not sit under every post.
export const ASKS = [
  'מה לדעתכם יקרה מחר? כתבו בתגובות: עולה או יורד',
  'מה הכי הפתיע אתכם היום? כתבו בתגובות',
  'על איזו חברה תרצו שנסביר מחר? כתבו בתגובות',
  'היה ברור, או שצריך הסבר? כתבו בתגובות',
];
export const askLine = (seed = 0) => process.env.CAPTION_ASK === '0' ? ''
  : `💬 ${ASKS[Math.abs(Math.floor(seed)) % ASKS.length]}`;
/** The reel's last card: the same ask, short enough for a moving card. */
export const REEL_ASK = 'עולה או יורד מחר? כתבו בתגובות';

// ── the card ─────────────────────────────────────────────────
const TOPIC_OF = s => TOPICS.find(t => t.re.test(`${s.headline} ${s.lead ?? ''}`))?.word ?? null;

/**
 * One story as one card. `label`/`mean` is the single line under the
 * headline: the channel's 💡 line when it wrote one ("מה זה אומר"),
 * else where the indices stand ("איפה אנחנו"), else its first
 * reported sentence ("מה קרה").
 */
// A figure is printed with its sign. The channel often writes "יורד
// 2.6%" with a bare number; the card says -2.6% in red, never a bare
// figure in a colour the reader has to decode.
export const signed = (fig, dir) => !fig ? null
  : /^[+-]/.test(fig) ? fig : dir === 'dn' ? `-${fig}` : dir === 'up' ? `+${fig}` : fig;

/**
 * One line a reader takes in at a glance: the first sentence, else its
 * first clause, when it is 3–12 words. Otherwise nothing — a card with
 * a headline only beats a card that ends in "…".
 */
export function oneLine(text, max = 12) {
  // A parenthetical is a second thought; a glance has room for one.
  const t = String(text ?? '').replace(/\s*\([^)]{1,60}\)/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const n = x => x.split(' ').filter(Boolean).length;
  const ok = (x, lo = 3) => n(x) >= lo && n(x) <= max;
  const sentence = (t.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? t).replace(/[.]$/, '').trim();
  if (ok(sentence)) return sentence;
  // A clause only when it still says something: "תחזית AWS החלשה" is
  // a subject without its verb.
  const clause = sentence.split(/\s*[—–;:]\s*|,\s+(?=\D)/)[0].trim();
  if (ok(clause, 5)) return clause;
  return null;
}

export function cardOf(s, { eyebrow = null, day = null, story = null, palette = null } = {}) {
  // The line under the headline: what it means, else what happened —
  // one sentence. Never the 📊 numbers: the board slide carries those.
  const cands = [['מה זה אומר', s.meaning], ['מה קרה', s.lead], ['מה קרה', s.bullets?.[0]]];
  let label = null, mean = null;
  for (const [l, t] of cands) { const one = oneLine(t); if (one && one !== s.headline) { label = l; mean = one; break; } }
  return {
    type: 'card', eyebrow: eyebrow ?? TOPIC_OF(s) ?? (s.kind === 'flash' ? 'מבזק' : 'וול סטריט'),
    headline: s.headline, label, mean,
    figure: signed(s.figure, s.dir), dir: s.dir,
    photo: s.image?.url ? { src: s.image.url } : null,
    credit: s.image?.credit ?? null,
    day, story, palette, tg_id: s.tg_id,
  };
}

/** The tape (index moves) from the old-format levels, for the ₪ line. */
function tapeOf(rows, carry, now) {
  const parsed = rows.map(parse).filter(Boolean);
  return tape(parsed, carry, now);
}

// ── 21:00 · השוק בערב — the day as one explainer ──────────────
//
// Built from what the best market pages do (research, 9 Nov 2026): a
// carousel of 6–8 slides read as ONE explainer of the day, one idea a
// slide, the headline stating it; numbers as stat cards; a real chart
// whose headline is computed from the line; what is coming next; and a
// last slide asking to send it on. Under five slides a carousel
// underperforms; three unrelated tiles was the old design's mistake.
//
//   1 cover    the day's insight (the channel's read), the index move,
//              a month of the index as a sparkline, the reader's money
//   2 board    "איפה השוק עומד" — the channel's 📊 numbers
//   3–5 card   the day's three biggest stories
//   6 chart    the chart of the day (chart.js), when closes are given
//   7 next     "מה מחכה לנו" — the channel's ⏭ calendar
//   8 close    send it to someone + one question
// ── what every caption ends on ───────────────────────────────
// The trust line (the ISA's influencer bill asks for exactly this
// disclosure), and the words people search Instagram for in Hebrew.
export const DISCLOSURE = 'ℹ️ התוכן להסברה בלבד: לא ייעוץ השקעות, לא המלצה ולא תחליף לייעוץ אישי.';
export const KEYWORDS = 'שוק ההון · מניות · וול סטריט · S&P 500 · נאסד״ק · השקעות למתחילים';
const TAIL = [DISCLOSURE, '@marketalert.il · השוק בעברית פשוטה', KEYWORDS];

// ── the map of the day ───────────────────────────────────────
// Two index tiles and the eight names everybody holds through them.
export const HEAT = [
  { sym: '^SPX', name: 'S&P 500', wide: true }, { sym: '^NDX', name: 'נאסד״ק 100', wide: true },
  { sym: 'NVDA', name: 'NVDA' }, { sym: 'AAPL', name: 'AAPL' }, { sym: 'MSFT', name: 'MSFT' }, { sym: 'GOOGL', name: 'GOOGL' },
  { sym: 'AMZN', name: 'AMZN' }, { sym: 'META', name: 'META' }, { sym: 'TSLA', name: 'TSLA' }, { sym: 'AVGO', name: 'AVGO' },
];
/** Tiles for the cover, or null when fewer than six moves are known. */
export function tilesOf(heat) {
  const by = new Map((heat ?? []).filter(h => h && Number.isFinite(Number(h.chg)) && Math.abs(Number(h.chg)) <= 25).map(h => [h.sym, Number(h.chg)]));
  const tiles = HEAT.filter(t => by.has(t.sym)).map(t => ({ ...t, chg: by.get(t.sym) }));
  // Two wide tiles fill a row; one wide tile alone leaves a hole.
  const wides = tiles.filter(t => t.wide).length;
  if (wides === 1) tiles.forEach(t => { t.wide = false; });
  return tiles.length >= 6 ? tiles : null;
}

/** A story as a page in the new look. */
export function kStoryOf(s, opts = {}) {
  const c = cardOf(s, opts);
  return { ...c, type: 'kStory', credit: null, source: s.image?.credit ?? null };
}

const TAPE_NAME = { SPX: 'S&P 500', ES: 'חוזי ה-S&P 500', NQ: 'חוזי הנאסד״ק', NDX: 'נאסד״ק 100', YM: 'חוזי הדאו', RTY: 'חוזי הראסל' };

function sendLine(stories) {
  const hay = stories.map(s => s.headline).join(' ');
  if (/נאסד/.test(hay)) return 'מכירים מישהו שמחזיק נאסד״ק?';
  if (/S&P/.test(hay)) return 'מכירים מישהו עם קרן על ה-S&P 500?';
  return 'מכירים מישהו שמשקיע בשוק האמריקאי?';
}

function composeEveningRaw(rows, { now = null, carry = {}, series = null, heat = null } = {}) {
  const at = now ?? Math.floor(Date.now() / 1000);
  const consumed = (rows ?? []).map(r => Number(r.tg_id));
  const stories = storiesOf(rows, { now: at });
  const { quotes, carry: nextCarry, stamp } = tapeOf(rows ?? [], carry, at);
  if (!stories.length) return { key: `E:${localDay(at)}`, skip: 'no story', slides: [], consumed, carry: nextCarry };

  const reads = stories.filter(s => s.kind === 'read').sort((a, b) => b.ts - a.ts);
  const lead = reads[0] ?? stories[0];
  const top = stories.filter(s => s !== lead && s.kind !== 'read').slice(0, 3);
  const seed = Math.floor(at / 86400);
  const day = dayLines(quotes, seed);
  const chart = series ? insightOf(series.points, series.sym) : null;

  // The numbers: the channel's own 📊 line first (newest read that has
  // one), else the tape it quoted. Never both mixed on one board.
  let board = (reads.find(r => r.board.length >= 2)?.board) ?? [];
  let boardSrc = 'לפי עדכון הערוץ';
  if (board.length < 2) {
    board = quotes.map(q => ({ name: TAPE_NAME[q.sym] ?? q.sym,
      value: `${q.chg > 0 ? '+' : ''}${Number(q.chg).toFixed(2)}%`, dir: q.chg > 0 ? 'up' : q.chg < 0 ? 'dn' : '', pct: true }));
    boardSrc = `לפי הערוץ · ${stamp}`;
  }
  const headline = board.find(r => r.pct && r.dir) ?? null;

  // What is coming: the calendar lines of the day's messages, newest
  // first, each said once.
  const nextItems = [];
  for (const st of [...stories].sort((a, b) => b.ts - a.ts))
    for (const t of st.nextItems ?? []) if (nextItems.length < 3 && !nextItems.some(x => x.slice(0, 18) === t.slice(0, 18))) nextItems.push(t);

  // ── the brand's evening (look.js): 5–6 pages ──
  // 1 the map of the day + the channel's read + Ron on the money
  // 2 the numbers (and what is coming)   3–4 the two biggest stories
  // 5 the chart, only when there is no map   6 send it on
  const src = chart ? `מקור: Yahoo Finance / Stooq · סגירה ${chart.lastDate}` : null;
  const big = headline ? { value: headline.value, name: headline.name, dir: headline.dir } : null;
  const tiles = tilesOf(heat);
  const slides = [{
    type: 'kCover', eyebrow: `${SERIES.digest} · ${dmy(at)}`, headline: lead.headline,
    tiles, big: tiles ? null : big, spark: !tiles && chart ? { points: chart.points.slice(-22), dir: chart.dir } : null,
    money: day?.parts ?? null, note: day?.note ?? null, line: oneLine(lead.meaning ?? lead.lead, 14),
    source: tiles ? 'מפת היום: שינוי יומי, לפי מחירי סגירה' : null, swipe: 'החליקו: המספרים והסיפורים',
  }];
  const boardNext = board.length >= 2 ? nextItems.slice(0, 2) : [];
  if (board.length >= 2) slides.push({ type: 'kBoard', eyebrow: 'המספרים של היום', title: 'איפה השוק עומד',
    rows: board.slice(0, boardNext.length ? 4 : 5), next: boardNext.length ? boardNext : null, source: boardSrc });
  const shown = top.slice(0, board.length >= 2 ? 2 : 3);
  shown.forEach((s, i) => slides.push({ ...kStoryOf(s), eyebrow: `${i + 1} מתוך ${shown.length} · ${TOPIC_OF(s) ?? (s.kind === 'flash' ? 'מבזק' : 'וול סטריט')}`,
    source: s.image?.credit ?? null }));
  if (chart && !tiles) slides.push({ type: 'kChart', eyebrow: 'הגרף של היום', ...chart, source: src });
  const variant = tiles ? 'map' : chart ? 'number' : 'plain';
  slides.push({ type: 'kClose', headline: sendLine([lead, ...top]), sub: 'שלחו לו את הפוסט הזה',
    ask: ASKS[Math.abs(seed) % ASKS.length], foot: 'כל ערב ב-21:00 אני מסביר את היום. נתראה מחר.' });

  const lines = shown.map((s, i) => `${['1️⃣', '2️⃣', '3️⃣'][i]} ${s.headline}${s.meaning ? `\n${s.meaning}` : ''}`).join('\n\n');
  const credits = shown.map(s => s.image?.credit).filter(Boolean);
  const caption = [
    `${SERIES.digest} | ${ddmmyy(at)}`, '',
    `📌 ${lead.headline}`,
    lead.meaning || lead.where ? (lead.meaning ?? lead.where) : null, '',
    lines, '',
    chart ? `📈 ${chart.headline}` : null,
    nextItems.length ? `⏭ ${nextItems[0]}` : null,
    day?.money ? `💰 ${day.money} (${day.note})` : null, day?.ron ?? null, '',
    `📩 ${sendLine([lead, ...top])} שלחו לו את הפוסט`,
    askLine(seed), '',
    SCHEDULE,
    credits.length ? credits.join(' · ') : null,
    ...TAIL, tagsOf(stories),
  ].filter(x => x !== null).join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 2120);

  return { key: `E:${localDay(at)}`, template: null, window: ddmmyy(at), date: ddmmyy(at),
    stamp, quotes, slides, caption, consumed, carry: nextCarry, format: 'brand-v1', chartSym: series?.sym ?? null, cover: variant };
}

function tagsOf(stories) {
  const hay = stories.map(s => `${s.headline} ${s.lead ?? ''}`).join(' ');
  const t = TOPICS.filter(x => x.re.test(hay)).slice(0, 3).map(x => x.tag);
  return ['שוקההון', 'וולסטריט', ...t].filter((v, i, a) => a.indexOf(v) === i).slice(0, 5).map(x => `#${x}`).join(' ');
}

// ── stories ──────────────────────────────────────────────────
const MAX_STORIES = Number(process.env.MAX_STORIES || 1);
export const TG_LINK = 't.me/hamal_shukhahon';

/**
 * The hour as story cards: the top story(ies) of the window, one card
 * each, the Telegram address printed every sixth board. Same return
 * shape the story runner has always read.
 */
function composeStoriesRaw(rows, { carry = {}, endTs = null, tally = 0, catchup = false } = {}) {
  const consumed = (rows ?? []).map(r => Number(r.tg_id));
  const first = Math.min(...(rows ?? []).map(r => Number(r.ts)).filter(Boolean));
  const w0 = Number.isFinite(first) ? windowOf(first) : null;
  const w = w0 && endTs && endTs > w0.end ? { ...w0, end: endTs } : w0;
  const { quotes, carry: nextCarry, stamp } = tapeOf(rows ?? [], carry, w?.end ?? null);
  const nothing = reason => ({ key: w ? `S:${w.key}` : null, skip: reason, slides: [], consumed, carry: nextCarry });
  if (!w) return nothing('empty');
  const stories = storiesOf(rows, { now: w.end }).filter(s => s.kind !== 'read' || rows.length < 3);
  if (!stories.length) return nothing('thin');

  const every = Number(process.env.STORY_CTA_EVERY || 6);
  let t = tally;
  const slides = stories.slice(0, MAX_STORIES).map(s => {
    const c = kStoryOf(s, { eyebrow: catchup ? hhmm(s.ts) : (TOPIC_OF(s) ?? 'עכשיו') });
    t++;
    if (t >= every) { t = 0; return { ...c, tgStrip: TG_LINK }; }
    return c;
  });
  return { key: `S:${w.key}`, template: null, tally: t, window: span(w), date: ddmmyy(w.end),
    stamp, quotes, slides, consumed, carry: nextCarry };
}

// ── Sunday · השבוע בדקה — the week's only reel ────────────────
const GEST = { up: 'yes', dn: 'pause', '': 'explain' };
const DARK = ['ink', 'deep', 'midnight', 'abyss', 'basalt', 'navy'];

/**
 * Six scenes, ~15 seconds: the week's biggest move, its three biggest
 * stories, how many of the week's calls came true, and the question.
 * Ron opens and closes; the middle is the news.
 */
function composeWeekReelRaw(rows, { now = null, score = null, span: kind = 'week' } = {}) {
  const at = now ?? Math.floor(Date.now() / 1000);
  // 'week' is Sunday's השבוע בדקה; 'days' is the midweek השוק בדקה —
  // the same six scenes over the last two days, ending on tomorrow.
  const wk = kind === 'week';
  const title = wk ? SERIES.week : SERIES.minute;
  const stories = storiesOf(rows, { now: at, decayHours: wk ? 72 : 24 }).filter(s => s.kind !== 'read');
  if (stories.length < 3) return { skip: wk ? 'thin week' : 'thin days', slides: [] };
  const top = stories.slice(0, 3);
  const seed = Math.floor(at / 86400);
  const ground = i => DARK[(seed + i) % DARK.length];
  const big = [...stories].filter(s => s.figure && (s.dir === 'up' || s.dir === 'dn'))
    .sort((a, b) => Math.abs(parseFloat(b.figure)) - Math.abs(parseFloat(a.figure)))[0] ?? null;

  // A reel card is read in two seconds: the parenthetical "(לפני שנה
  // $2.87)" goes, the rest is cut at a clause.
  const short = h => String(h).replace(/\s*\([^)]{1,40}\)/g, '').trim();
  const scene = (s, i) => {
    const fit = fitCard(short(s.headline));
    return { type: 'scene', k: true, chip: `${i} מתוך 3`, headline: fit.text, say: fit.text, marked: markWord(fit.text, s.figure ? [{ text: s.figure }] : null),
      sub: signed(s.figure, s.dir), subDir: s.dir || '', dir: s.dir || '', gesture: GEST[s.dir || ''], seed: seed + i * 7,
      photo: s.image?.url ? { src: s.image.url } : null, palette: ground(i), ron: null };
  };
  const tot = score ? (Number(score.hit) || 0) + (Number(score.miss) || 0) : 0;
  const slides = [
    big ? { type: 'scene', k: true, chip: title, lead: true, headline: TOPIC_OF(big) ?? fitCard(big.headline).text,
        marked: esc(TOPIC_OF(big) ?? fitCard(big.headline).text), big: signed(big.figure, big.dir), say: `${title}. ${fitCard(big.headline).text}`, dir: big.dir,
        gesture: GEST[big.dir], seed, palette: ground(0), own: true }
      : { type: 'scene', k: true, chip: title, say: title, headline: wk ? 'השבוע בשוק' : 'מה קרה בשוק', marked: wk ? 'השבוע ב<em>שוק</em>' : 'מה קרה ב<em>שוק</em>', sub: title,
        dir: '', gesture: 'welcome', seed, palette: ground(0), own: true },
    ...top.map((s, i) => scene(s, i + 1)),
    ...(wk && tot ? [{ type: 'scene', k: true, chip: 'צדקנו או טעינו?', say: `צדקנו ${score.hit} מתוך ${tot} תחזיות השבוע`, headline: `צדקנו ${score.hit} מתוך ${tot}`, marked: `צדקנו <em>${score.hit}</em> מתוך ${tot}`,
      sub: 'התחזיות של השבוע', dir: '', gesture: 'explain', seed: seed + 50, palette: ground(4), own: true, ron: null }] : []),
    { type: 'scene', k: true, say: wk ? 'עולה או יורד השבוע? כתבו בתגובות' : 'עולה או יורד מחר? כתבו בתגובות', headline: wk ? 'עולה או יורד השבוע?' : 'עולה או יורד מחר?', marked: wk ? 'עולה או יורד <em>השבוע</em>?' : 'עולה או יורד <em>מחר</em>?', sub: 'כתבו בתגובות',
      dir: '', gesture: 'point', seed: seed + 99, palette: ground(5), own: true },
  ];
  const caption = [
    wk ? `${title} | ${dmy(at - 6 * 86400)}–${dmy(at)}` : `${title} | ${dmy(at)}`, '',
    ...top.map((s, i) => `${['1️⃣', '2️⃣', '3️⃣'][i]} ${s.headline}`), '',
    wk && tot ? `🎯 צדקנו ${score.hit} מתוך ${tot} תחזיות השבוע. גם הפספוסים נספרים.` : null,
    `💬 ${wk ? WEEK_ASK : REEL_ASK}`, '',
    SCHEDULE, ...TAIL, tagsOf(stories),
  ].filter(x => x !== null).join('\n').slice(0, 2120);
  return { key: `R:${localDay(at)}`, window: dmy(at), date: ddmmyy(at), stamp: '', quotes: [],
    slides, caption, week: wk };
}
export const WEEK_ASK = 'עולה או יורד השבוע? כתבו בתגובות';

/** Kept for the voice path in run.js (off by default). */
export const connective = i => ['', 'Also, ', 'Meanwhile, ', 'And '][Math.min(i, 3)];

function markWord(headline, figures) {
  const fig = figures?.[0]?.text;
  const cands = [];
  if (fig) cands.push(fig);
  for (const t of TOPICS) { const m = t.re.exec(headline); if (m) cands.push(m[0]); }
  for (const c of cands) {
    const at = headline.indexOf(c);
    if (at < 0) continue;
    return esc(headline.slice(0, at)) + '<em>' + esc(c) + '</em>' + esc(headline.slice(at + c.length));
  }
  return esc(headline);
}

/** The words people type into Instagram search. */
export function searchLine() {
  return 'שוק ההון האמריקאי · מה קרה היום בשוק · חדשות וול סטריט\n'
       + '#שוקההון #וולסטריט #מסחר #בורסה #השקעות #נאסדק #מניות';
}

// ── every day · למה זה זז? — the daily reel ───────────────────
//
// What the Israeli pages people follow all do: not "the Nasdaq fell"
// but WHY, told by one host. Five or six scenes: the move as a
// question, the channel's own read as the answer, what it means, the
// day's biggest story with its picture, the move in shekels, and a
// question back. Every line is the channel's, shortened — never
// written here — and `say` is the same line for the Hebrew voice.
const VERB = { up: 'עלה', dn: 'ירד' };
const SPOKEN = { 'S&P 500': 'האס אנד פי חמש מאות', 'נאסד״ק 100': 'הנאסדק מאה', 'דאו ג׳ונס': 'הדאו ג׳ונס' };
const THE = { 'S&P 500': 'ה-S&P 500', 'נאסד״ק 100': 'הנאסד״ק', 'דאו ג׳ונס': 'הדאו', 'ראסל 2000': 'הראסל' };
const sayPct = v => String(v).replace(/^[+-]/, '').replace('%', ' אחוז');

function composeWhyReelRaw(rows, { now = null, carry = {} } = {}) {
  const at = now ?? Math.floor(Date.now() / 1000);
  const stories = storiesOf(rows, { now: at, decayHours: 12 });
  if (!stories.length) return { skip: 'no story', slides: [] };
  const reads = stories.filter(s => s.kind === 'read').sort((a, b) => b.ts - a.ts);
  const read = reads[0] ?? null;
  const news = stories.filter(s => s.kind !== 'read');
  const top = news[0] ?? null;
  if (!read && news.length < 2) return { skip: 'thin day', slides: [] };
  const { quotes } = tapeOf(rows ?? [], carry, at);
  const seed = Math.floor(at / 86400);
  const day = dayLines(quotes, seed);
  const move = (read?.board ?? []).find(r => r.pct && r.dir) ?? null;
  const short = h => String(h).replace(/\s*\([^)]{1,40}\)/g, '').trim();
  const pic = s => (s?.image?.url ? { src: s.image.url } : null);
  const line = (s, extra) => { const f = fitCard(short(s.headline)); return { type: 'scene', k: true, headline: f.text, say: f.text,
    marked: markWord(f.text, s.figure ? [{ text: s.figure }] : null), dir: s.dir || '', seed: seed + s.tg_id % 97, ...extra }; };

  const slides = [];
  if (move) {
    const the = THE[move.name] ?? move.name;
    const q = `למה ${the} ${VERB[move.dir]} היום?`;
    slides.push({ type: 'scene', k: true, lead: true, chip: SERIES.why, headline: q,
      marked: `למה <em>${esc(the)}</em> ${VERB[move.dir]} היום?`, big: move.value, dir: move.dir,
      say: `למה ${SPOKEN[move.name] ?? move.name} ${VERB[move.dir]} היום ${sayPct(move.value)}?`,
      gesture: 'pause', seed, own: true });
  } else {
    slides.push({ type: 'scene', k: true, chip: SERIES.why, headline: 'מה הזיז את השוק היום?', say: 'מה הזיז את השוק היום?',
      marked: 'מה הזיז את <em>השוק</em> היום?', dir: '', gesture: 'welcome', seed, own: true });
  }
  if (read) slides.push(line(read, { chip: 'בקצרה', gesture: 'explain', dir: move?.dir ?? '' }));
  const mean = oneLine(read?.meaning ?? top?.meaning, 9);
  if (mean) slides.push({ type: 'scene', k: true, chip: 'מה זה אומר', headline: mean, say: mean, dir: '', ron: null, seed: seed + 3 });
  for (const [i, s] of news.slice(0, read ? 1 : 2).entries())
    slides.push(line(s, { chip: i ? 'ועוד משהו' : 'הסיפור של היום', photo: pic(s), ron: null,
      sub: signed(s.figure, s.dir), subDir: s.dir || '' }));
  if (day?.parts?.amount) slides.push({ type: 'scene', k: true, chip: 'ובכסף שלכם', headline: `${day.parts.stake} ${day.parts.fund}`,
    marked: `<em>${esc(day.parts.stake)}</em> ${esc(day.parts.fund)}`, sub: `${day.parts.amount} היום, בערך`,
    subDir: day.parts.amount.startsWith('-') ? 'dn' : 'up', say: `עשרת אלפים שקל ${day.parts.fund}: ${day.parts.amount.startsWith('-') ? 'מינוס' : 'פלוס'} ${day.parts.amount.replace(/[^0-9]/g, '')} שקלים היום, בערך`,
    dir: '', ron: null, seed: seed + 5, own: true });
  slides.push({ type: 'scene', k: true, headline: 'עולה או יורד מחר?', marked: 'עולה או יורד <em>מחר</em>?', sub: 'כתבו בתגובות',
    say: 'ומה אתם חושבים? עולה או יורד מחר? כתבו בתגובות', dir: '', gesture: 'point', seed: seed + 99, own: true });

  const told = [read, ...news.slice(0, read ? 1 : 2)].filter(Boolean);
  const caption = [
    `${SERIES.why} | ${dmy(at)}`, '',
    move ? `${move.name}: ${move.value}` : null,
    ...told.map(s => `▪️ ${s.headline}`),
    mean ? `💡 ${mean}` : null,
    day?.money ? `💰 ${day.money} (${day.note})` : null, '',
    `💬 ${REEL_ASK}`, '',
    SCHEDULE, ...told.map(s => s.image?.credit).filter(Boolean), ...TAIL, tagsOf(stories),
  ].filter(x => x !== null).join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 2120);
  return { key: `R:${localDay(at)}`, window: dmy(at), date: ddmmyy(at), stamp: '', quotes: [], slides, caption, why: true };
}

// ── Thursday · צדקנו או טעינו? — the record, as a reel ─────────
// Misses first: an account that only shows its hits is selling.
function composeProofReelRaw(board, { now = null, score = null } = {}) {
  const at = now ?? Math.floor(Date.now() / 1000);
  const misses = (board?.misses ?? []).slice(0, 1), hits = (board?.hits ?? []).slice(0, 2);
  if (misses.length + hits.length < 2) return { skip: 'too few settled calls', slides: [] };
  const seed = Math.floor(at / 86400);
  const call = (c, ok) => {
    const m = Number(c.move_pct) || 0, fig = `${m > 0 ? '+' : ''}${m.toFixed(1)}%`;
    const said = c.dir === 'up' ? 'אמרנו: עלייה' : 'אמרנו: ירידה';
    return { type: 'scene', k: true, lead: true, chip: ok ? 'צדקנו ✓' : 'טעינו ✗', headline: `${c.asset}: ${said}`,
      marked: `<em>${esc(c.asset)}</em><br>${said}`, big: fig, dir: m >= 0 ? 'up' : 'dn',
      sub: ok ? 'וזה מה שקרה' : 'וקרה ההפך', say: `${c.asset}. ${said}. ${ok ? 'וזה מה שקרה' : 'וקרה ההפך'}`, ron: null, seed: seed + Number(c.id ?? 0) % 89 };
  };
  const tot = score ? (Number(score.hit) || 0) + (Number(score.miss) || 0) : 0;
  const slides = [
    { type: 'scene', k: true, chip: SERIES.proof, headline: 'בודקים את עצמנו', marked: 'בודקים את <em>עצמנו</em>', sub: 'קודם הטעויות',
      say: 'צדקנו או טעינו? בודקים את עצמנו. קודם הטעויות', dir: '', gesture: 'pause', seed, own: true },
    ...misses.map(c => call(c, false)), ...hits.map(c => call(c, true)),
    ...(tot ? [{ type: 'scene', k: true, chip: 'החודש האחרון', headline: `צדקנו ${score.hit} מתוך ${tot}`, marked: `צדקנו <em>${score.hit}</em> מתוך ${tot}`,
      sub: 'גם הפספוסים נספרים', say: `בחודש האחרון צדקנו ${score.hit} מתוך ${tot}. גם הפספוסים נספרים`, dir: '', gesture: 'explain', seed: seed + 50, own: true }] : []),
  ];
  const caption = [
    `${SERIES.proof} | ${dmy(at)}`, '',
    ...misses.map(c => `✗ ${c.asset}: ${cutWords(c.headline, 12)}`), ...hits.map(c => `✓ ${c.asset}: ${cutWords(c.headline, 12)}`), '',
    tot ? `🎯 ${score.hit} מתוך ${tot} תחזיות בחודש האחרון. נמדד ממחיר הסגירה שלפני הפוסט.` : null,
    '💬 איזו תחזית שלנו לבדוק בשבוע הבא? כתבו בתגובות', '',
    SCHEDULE, ...TAIL, '#שוקההון #וולסטריט #מניות',
  ].filter(x => x !== null).join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 2120);
  return { key: `R:${localDay(at)}`, window: dmy(at), date: ddmmyy(at), stamp: '', quotes: [], slides, caption, proof: true };
}
const cutWords = (t, n) => { const w = String(t ?? '').split(/\s+/); return w.length <= n ? w.join(' ') : `${w.slice(0, n).join(' ')}…`; };

// ── Mon · Wed · Fri — האקדמיה של רון ──────────────────────────
function composeAcademyRaw(n, { now = null } = {}) {
  const at = now ?? Math.floor(Date.now() / 1000);
  const l = lessonAt(n);
  const eyebrow = `${SERIES.academy} · שיעור ${l.n}`;
  const slides = [
    { type: 'kLesson', eyebrow: SERIES.academy, n: l.n, title: l.title, hook: l.hook, swipe: 'שלושה צעדים, דקה אחת' },
    ...l.steps.map((text, i) => ({ type: 'kStep', eyebrow, n: i + 1, text, source: l.title })),
    { type: 'kTake', eyebrow: 'בשורה אחת', text: l.take, foot: 'שמרו את זה לפעם הבאה שזה עולה בחדשות.' },
    { type: 'kClose', headline: 'מה להסביר בשיעור הבא?', sub: 'כתבו לי בתגובות', ask: 'מכירים מישהו שרק מתחיל? שלחו לו את השיעור.',
      foot: `בשיעור הבא: ${l.next}` },
  ];
  const caption = [
    `${SERIES.academy} | שיעור ${l.n} מתוך ${LESSONS.length}`, '',
    `📘 ${l.title}`, l.hook, '',
    ...l.steps.map((t, i) => `${i + 1}. ${t}`), '',
    `💡 ${l.take}`, '',
    '💬 מה להסביר בשיעור הבא? כתבו בתגובות',
    `⏭ בשיעור הבא: ${l.next}`, '',
    SCHEDULE, ...TAIL, '#שוקההון #השקעותלמתחילים #חינוךפיננסי #מניות #וולסטריט',
  ].join('\n').slice(0, 2120);
  return { key: `A:${localDay(at)}`, window: dmy(at), date: ddmmyy(at), stamp: '', quotes: [], slides, caption, lesson: l.n, format: 'academy' };
}

// ── the budget: every deck goes out through it ────────────────
export const composeEvening = (...a) => budgeted(composeEveningRaw(...a));
export const composeStories = (...a) => budgeted(composeStoriesRaw(...a));
export const composeWeekReel = (...a) => budgeted(composeWeekReelRaw(...a));
export const composeWhyReel = (...a) => budgeted(composeWhyReelRaw(...a));
export const composeProofReel = (...a) => budgeted(composeProofReelRaw(...a));
export const composeAcademy = (...a) => budgeted(composeAcademyRaw(...a));
