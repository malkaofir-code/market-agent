// ─────────────────────────────────────────────────────────────
// compose.js — a 15-minute window -> a deck plan.
// Deterministic. No model, no network. Every rule here is either
// quoted from design.html or measured off the 299-message sample.
// ─────────────────────────────────────────────────────────────
import { parse, score, direction } from './parse.js';
import { clean, stripLeadEmoji } from './rtl.js';
import { byId } from './templates.js';
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

const fmt = (ts, o) => new Intl.DateTimeFormat('en-GB',
  { timeZone: TZ, hour12: false, ...o }).format(new Date(ts * 1000));
const hhmm = ts => fmt(ts, { hour: '2-digit', minute: '2-digit' });
const ddmmyy = ts => fmt(ts, { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '.');
const dmy = ts => fmt(ts, { day: '2-digit', month: '2-digit' }).replace(/\//g, '.');
const localDay = ts => fmt(ts, { year: 'numeric', month: '2-digit', day: '2-digit' })
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
const span = w => {
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

// The channel names the same company both ways, so "AMZN מפתחת
// תחנות משלוח" and "אמזון בונה תחנות משלוח" scored only 0.5 overlap
// and both reached the deck as adjacent rows.
const ALIAS = { אנבידיה:'NVDA', אמזון:'AMZN', טסלה:'TSLA', אפל:'AAPL',
  מיקרוסופט:'MSFT', גוגל:'GOOGL', אלפאבית:'GOOGL', מטא:'META', פייסבוק:'META',
  ברודקום:'AVGO', אינטל:'INTC', נטפליקס:'NFLX', 'מיקרון':'MU' };

/** Headline reduced to comparable tokens: no emoji, no punctuation. */
const key = h => stripLeadEmoji(h).replace(/[^\p{L}\p{N} ]/gu, ' ')
  .split(/\s+/).filter(w => w.length > 2).map(w => ALIAS[w] ?? w);

/**
 * The same story arrives twice under different wording ("NVDA: מו״מ
 * להשקעה" and "אנבידיה במו״מ להשקעה"). Two headlines sharing 60% of
 * their significant tokens are one story; the higher-scoring copy
 * wins. A carousel showing the same headline twice reads as broken.
 */
export function dedupe(parsed) {
  const out = [];
  for (const p of [...parsed].sort((a, b) => b.score - a.score || a.ts - b.ts)) {
    const k = key(p.headline);
    const dup = out.some(o => {
      const ok = key(o.headline);
      const shared = k.filter(w => ok.includes(w)).length;
      // >=0.5 rather than 0.6: the Amazon pair landed at exactly 0.5.
      // Guarded by a 2-token floor so two short headlines sharing one
      // common word are not merged.
      return shared >= 2 && shared / Math.min(k.length, ok.length || 1) >= 0.5;
    });
    if (!dup) out.push(p);
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/**
 * The morning post opens with a question, not a headline.
 *
 * A headline on slide one hands the reader the whole story and they
 * scroll on — a quarter of them leave on the first slide. A question
 * opens a loop the rest of the deck closes, and the headline it would
 * have been becomes the standfirst underneath, so nothing is hidden,
 * only ordered.
 *
 * Deterministic, like the rest of this file: the frame is chosen by
 * what the lead actually IS — a number, an interpretation, a policy
 * move — and rotated by the window key so the same question does not
 * open every Monday.
 */
const ASK = {
  figure: ['המספר הזה משנה משהו?', 'כמה זה באמת אומר?', 'מה מסתתר מאחורי המספר?'],
  policy: ['מי משלם על זה בסוף?', 'למה דווקא עכשיו?', 'מה זה עושה לכיס שלכם?'],
  note:   ['מה השוק מתמחר עכשיו?', 'האם זה שינוי מגמה?', 'מה באמת קרה כאן?'],
  plain:  ['מה צריך לדעת הבוקר?', 'על מה השוק מדבר היום?', 'מה פתח את היום?'],
};

function askCover(lead, seed) {
  const kind = lead.figures?.length ? 'figure'
    : /מכס|ריבית|פד\b|רגולצי|חוק|ממשל|טראמפ/.test(`${lead.headline} ${lead.stand ?? ''}`) ? 'policy'
    : lead.note ? 'note'
    : 'plain';
  const bank = ASK[kind];
  return bank[Math.abs(seed) % bank.length];
}

export function compose(rows, { now = null, carry = {}, endTs = null, template = null } = {}) {
  const all = rows.map(parse).filter(Boolean).map(p => ({ ...p, score: score(p) }));
  const w0 = all.length ? windowOf(all[0].ts) : null;
  const nothing = reason => ({ key: w0?.key ?? null, skip: reason, slides: [],
    consumed: all.map(p => p.tg_id), carry: tape(all, carry).carry });
  if (!all.length) return nothing('empty');

  // snapshots feed the tape, then leave the deck
  const parsed = dedupe(all.filter(p => !isSnapshot(p)));
  // a window of nothing but futures snapshots has no news in it
  if (!parsed.length) return nothing('snapshots-only');

  // endTs lets run.js merge several thin windows into one deck and
  // still stamp the true span on the masthead — otherwise a 14:00-16:00
  // post would claim to cover only the first hour.
  const w0m = windowOf(parsed[0].ts);
  const w = endTs && endTs > w0m.end ? { ...w0m, end: endTs } : w0m;
  const { quotes, carry: nextCarry, stamp } = tape(all, carry);   // snapshots included

  // §04: "a story cannot appear on both the cover and a card" —
  // each message is consumed exactly once across the deck.
  // A merged window can span half a day, and raw score then hands the
  // cover to whatever scored highest anywhere in it — which on the
  // morning deck is last night. Age is worth a point: a story sheds
  // one point for every SCORE_DECAY_HOURS between it and the close of
  // the window, so this morning takes a tie and last night has to be
  // genuinely bigger to lead. Ties break newest-first for the same
  // reason.
  const decay = Number(process.env.SCORE_DECAY_HOURS || 4);
  const fresh = p => p.score - (w.end - p.ts) / 3600 / decay;
  const pool = [...parsed].sort((a, b) => fresh(b) - fresh(a) || b.ts - a.ts);
  const used = new Set();
  const take = pred => {
    const hit = pool.find(p => !used.has(p.tg_id) && pred(p));
    if (hit) used.add(hit.tg_id);
    return hit ?? null;
  };

  const slides = [];
  // The Telegram card, once a day, on the evening deck.
  //
  // This used to key off the window's START being 23:xx, which was
  // right when a deck was one hour and the last one went out at 23:00.
  // Under three digests a day the evening deck STARTS wherever the
  // afternoon one left off — 15:15 — so the test never fired again and
  // the card silently stopped appearing. The window's END is the
  // stable thing: the evening digest always closes on the 21:15
  // boundary.
  // Which of the three daily decks this is.
  //
  // This used to be read off the window's END. That was right only
  // while a digest covered exactly one hour: the morning deck merges
  // forward until it has a full deck — through to 11:15 on 1 September
  // — so the 08:xx test never fired, the morning post lost its
  // question cover, and the evening test would go the same way on a
  // quiet night. The slot is a property of WHEN THE DECK GOES OUT, not
  // of wherever the merge happened to stop.
  const at = now ?? Math.floor(Date.now() / 1000);
  const hour = Number(fmt(at, { hour: '2-digit' }));
  const slot = hour < 12 ? 'morning' : hour < 19 ? 'afternoon' : 'evening';
  const isCta = slot === 'evening';
  const cap = isCta ? MAX_CTA : MAX;

  // 01 · cover — highest score, not most recent.
  // The framed treatment needs a photo to frame; without one it falls
  // back to the plain cover, which reads as deliberate rather than
  // broken because the text hangs off the bottom either way.
  const lead = take(() => true);
  // The opening composition belongs to the TEMPLATE, not to whether
  // this particular message happened to carry a photo. That was the
  // whole complaint: every deck opened the same way, so the profile
  // grid read as one post repeated. Three of the seven openings can
  // hold a picture; the rest ignore it and it lands on a later board.
  const tpl = template ? byId(template) : null;
  const PHOTO_COVERS = new Set(['cover', 'coverFramed', 'coverBand']);
  let coverType = tpl?.cover ?? (lead.photo ? 'coverFramed' : 'cover');
  // A framed cover with nothing to frame is an empty frame. The ruled
  // opening is the natural stand-in: same weight, no picture needed.
  if (!lead.photo && coverType === 'coverFramed') coverType = 'coverRule';
  // One of the three posts a day opens on a question — the morning
  // one, which is the first thing anyone sees that day. The evening
  // deck carries the Telegram card instead; the afternoon one is
  // straight news, half an hour before the US bell, when a reader
  // wants the fact and not a riddle.
  const asks = slot === 'morning';
  const seed = [...w.key].reduce((a, c) => a + c.charCodeAt(0), 0);
  // The index opening prints the hour, and the figure opening prints
  // the lead's number. Both fall back inside the archetype when the
  // window cannot supply one, so the rotation never has to know.
  const leadFig = lead.figures?.length && lead.figureCount < 4
    ? lead.figures[0].text.replace(/[−־]/g, '-') : null;
  slides.push({ type: coverType,
    index: hhmm(w.end).slice(0, 2),
    figure: leadFig,
    // When the lead carries a number, the eyebrow IS the number — so
    // the question has something concrete sitting above it instead of
    // asking about a figure the reader cannot see.
    eyebrow: asks
      ? (lead.figures?.[0]?.text?.replace(/[−־]/g, '-') ?? 'הבוקר בשוק')
      : undefined,
    headline: asks ? askCover(lead, seed) : lead.headline,
    stand: asks ? lead.headline : lead.stand,
    source: lead.source,
    photo: PHOTO_COVERS.has(coverType) ? lead.photo : null });

  // 02 · hero — "a sentence carrying four or more figures is a table
  // read aloud and is skipped; a hero number needs a claim attached."
  const hero = take(p => p.figures.length && p.figureCount < 4);
  if (hero) {
    const f = hero.figures[0];
    const sentence = `${hero.headline} ${hero.stand ?? ''}`;
    slides.push({ type: 'hero', figure: f.text.replace(/[−־]/g, '-'),
      dir: direction(f.text, sentence), photo: hero.photo,
      quote: hero.stand || hero.headline, source: hero.source });
  }

  // 03 · interpretation — present in 63% of windows.
  //
  // §04 says a story may not appear on both the cover and a card, and
  // scoring makes an interpretation worth 4 - so the note-bearing
  // message almost always wins the cover and was then consumed,
  // leaving 3 of 73 decks with a note slide. That reading is too
  // strict: the headline and the 💡 line are different CONTENT from
  // one message, not the same story told twice. So the lead may
  // donate its interpretation, and only a different message's
  // headline is barred from reappearing.
  const noted = lead.note ? lead : take(p => p.note);
  // On a digest the interpretation is HIS board — same content, but
  // presented by the character rather than set as an anonymous pull
  // quote. A feed of headlines is a utility and utilities get muted;
  // a character is a reason to follow. Stories keep the plain note:
  // three seconds is not long enough to introduce anyone.
  if (noted) slides.push({ type: 'voice', about: noted.headline,
    text: noted.note, source: noted.source });

  // 04 · chart — "three real data points minimum. Fewer becomes a
  // hero figure instead."
  if (quotes.length >= 3) slides.push({ type: 'chart', series: quotes, stamp });

  // 05 · item slides — ONE SLIDE PER STORY. This is the rule: every
  // distinct story in the window gets its own slide, photo or not.
  // Lists exist only as overflow when a window runs past the cap.
  //
  // It used to give a slide only to photo-bearing stories and pack the
  // rest three-to-a-list — so a 12-message window with no harvested
  // photos collapsed to 5 slides. Wrong: dedupe decides what counts as
  // a story, and after that nothing gets merged.
  const rest = pool.filter(p => !used.has(p.tg_id));
  // Every deck now closes on a board that asks for something — the
  // Telegram card in the evening, the ask on the other two — so the
  // slot is reserved unconditionally. It used to be reserved only for
  // the evening, which would have let a busy window fill to the cap
  // and drop the ask silently on exactly the days most people saw it.
  const room = cap - slides.length - 1;

  // Reserve one slot for a list only if there is genuine overflow.
  const overflow = rest.length > room;
  const solo = overflow ? Math.max(0, room - 1) : rest.length;

  rest.slice(0, solo).forEach(p => {
    used.add(p.tg_id);
    slides.push({ type: 'item', n: slides.length + 1, headline: p.headline,
      photo: p.photo, body: p.stand, source: p.source,
      stat: p.figures.length && p.figureCount < 4
        ? p.figures[0].text.replace(/[−־]/g, '-') : null });
  });

  // 06 · list — only the tail that would not fit.
  const tail = rest.slice(solo);
  if (tail.length) {
    tail.forEach(p => used.add(p.tg_id));
    slides.push({ type: 'list', title: 'עוד מהחלון הזה',
      rows: tail.slice(0, 4).map((p, j) => ({ n: solo + j + 1,
        headline: p.headline, source: p.source })) });
  }

  // 07 · the ask — every deck except the evening one, which already
  // closes on the Telegram card and must not close on two asks.
  //
  // The deck has never asked for anything at all. Saves and shares
  // are what the ranking rewards and what puts the account in front
  // of someone who has not seen it, and a reader who is not asked
  // does neither. The wording is specific about WHY — "save it, the
  // numbers are here" beats "save this post", which reads as begging
  // and is ignored.
  //
  // One board, last, after the news is delivered and the reader owes
  // nothing. Rotates so the same three lines are not repeated twice a
  // day for a month.
  const ASKS = [
    { big: 'שומרים את זה למחר', foot: 'הסקירה הבאה ב־15:00',
      acts: [{ mark: '↓', label: 'שמרו — המספרים כאן כשתצטרכו אותם' },
             { mark: '↗', label: 'שלחו למי שמחזיק את המניות האלה' },
             { mark: '@', label: 'עוקבים — שלוש סקירות ביום, בעברית' }] },
    { big: 'מה פספסנו היום?', foot: 'עונים לכל תגובה',
      acts: [{ mark: '✎', label: 'כתבו בתגובות מה הכי הפתיע אתכם' },
             { mark: '↓', label: 'שמרו — לחזור לזה לפני הפתיחה' },
             { mark: '↗', label: 'שלחו לחבר שמסתכל על השוק האמריקאי' }] },
    { big: 'הסקירה הזאת שווה שיתוף אחד', foot: 'תודה שאתם כאן',
      acts: [{ mark: '↗', label: 'שלחו את זה הלאה — ככה החשבון גדל' },
             { mark: '↓', label: 'שמרו לפני שזה נעלם בפיד' },
             { mark: '@', label: 'עוקבים ל־@marketalert.il' }] },
  ];
  if (!isCta && slides.length < cap) {
    const a = ASKS[Math.abs(seed) % ASKS.length];
    slides.push({ type: 'ask', ...a });
  }

  // 06 · telegram CTA — 23:00 deck only
  if (isCta) slides.push({ type: 'telegram', big: 'חמ״ל שוק ההון',
    link: TG_LINK,
    // The times the account actually keeps. This card was still
    // advertising four digests at 08/15/18/23 — the rhythm from before
    // the story track existed — so the one board whose entire job is
    // to make a promise was making one the agent stopped keeping
    // weeks ago.
    schedule: [
      { time: '08:00', label: 'סקירת בוקר' },
      { time: '15:00', label: 'טרום־פתיחה' },
      { time: '21:00', label: 'סיכום יום' }] });

  // Instagram needs >=2 images for a carousel, and a one-slide deck
  // is a window that had nothing to say. 7% of windows land here.
  // One slide is a post. The old floor of two threw away whole hours
  // of the channel for being quiet, which is not the agent's call to
  // make — if there is anything at all to say, say it.
  if (slides.length < MIN_DECK) return { ...nothing('thin'), slides };

  return {
    key: w.key,
    template,
    window: span(w),
    date: ddmmyy(w.end),
    stamp, quotes,
    slides: slides.slice(0, cap),
    caption: caption(parsed, w),
    consumed: all.map(p => p.tg_id),   // dropped duplicates are consumed too, or they resurface next window
    carry: nextCarry,
  };
}

/**
 * A reel: five boards, twelve seconds, built to be watched by someone
 * who has never heard of this account.
 *
 * The shape is fixed, unlike a digest, because retention is the whole
 * ranking signal and retention is a property of PACING. A viewer
 * decides in about two seconds, so board one is a single number at
 * the size of the screen; then three beats of one story each, short
 * enough that nothing is ever still; then the ask.
 *
 * It deliberately carries LESS than a digest. A carousel is read at
 * the reader's pace and can hold ten slides; a reel is watched at the
 * video's pace and every extra second is a chance to scroll away.
 */
/**
 * The accented word.
 *
 * At under two seconds a viewer does not read a headline, they land
 * on it — so one word carries the colour and the eye goes there
 * first. It is chosen, never invented: the figure if the line has
 * one, otherwise the instrument or company the line is about, drawn
 * from the same topic table the caption uses. If neither is present
 * nothing is accented, because guessing which word matters is how a
 * headline gets editorialised.
 */
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

// ─────────────────────────────────────────────────────────────
// The narration.
//
// English, over Hebrew boards. The audience for the cards is Israeli;
// the audience for a reel is whoever Instagram decides to show it to,
// and that is the only reason this account has any reach beyond the
// people already following it.
//
// It does NOT translate. Nothing here reads a Hebrew sentence and
// says an English one — that would need a model, and a model that
// paraphrases a financial headline is a machine for inventing numbers
// that were never quoted. This account already published SPX +46.06%
// once, from four stale carry rows and a comma read as a decimal
// point, and the fix was to make every number traceable to something
// the parser actually matched.
//
// So the voice says only what is already structured: the instrument
// the topic table matched, the figure the parser extracted, and the
// direction the board is ALREADY drawing behind him. A scene the
// parser could not describe is narrated by nobody — silence over a
// card is honest, and a bed is still playing under it.
// ─────────────────────────────────────────────────────────────

/** Futures symbols, said out loud rather than spelled.
 *
 * Short forms, because these are spoken on card one and card one is
 * where a viewer decides. "Nasdaq futures down one point three three
 * percent" is four seconds; "Nasdaq down one point three three" is
 * two, and the strip on screen already says they are futures. */
/** HTML-escape, module scope: markWord had its own and composeReel
 *  now needs one too. */
const esc = t => String(t ?? '').replace(/[&<>]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** The same instruments, in Hebrew, for a card rather than a voice. */
const SAY_SYM_HE = {
  NQ: 'נאסד״ק', ES: 'S&P 500', YM: 'דאו ג׳ונס',
  SPX: 'S&P 500', NDX: 'נאסד״ק 100', RTY: 'ראסל 2000',
};

const SAY_SYM = {
  NQ: 'Nasdaq', ES: 'S and P', YM: 'the Dow',
  SPX: 'the S and P', NDX: 'the Nasdaq 100', RTY: 'the Russell',
};

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
  'eighty', 'ninety'];

/** 0-999 in words. Beyond that is a level, not a percentage, and
 *  nothing narrated here is ever a level. */
function intWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  return `${ONES[Math.floor(n / 100)]} hundred`
    + (n % 100 ? ` ${intWords(n % 100)}` : '');
}

/**
 * "1.33" -> "one point three three".
 *
 * Digit by digit after the point, the way a person reads a percentage
 * aloud — "one point thirty-three" is a different number to some ears
 * and this is not the place to be ambiguous. Returns null for
 * anything that is not a plain number, so a malformed figure is
 * silent rather than mispronounced.
 */
export function sayNum(text) {
  const t = String(text ?? '').replace(/[−־]/g, '-').replace('%', '').trim();
  // A leading + is normal on a figure and must not make the line
  // silent. The decimal part is capped at two digits on purpose: with
  // three, "46,061" — a LEVEL with a thousands separator, which is
  // exactly how SPX came to be published as +46.06% — parses happily
  // as a decimal and gets read aloud as a percentage. Two digits is
  // how a percentage is quoted; anything else is not one, and is
  // better said by nobody.
  const m = /^[+-]?(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const whole = intWords(Number(m[1]));
  if (!m[2]) return whole;
  return `${whole} point ${[...m[2]].map(d => ONES[Number(d)]).join(' ')}`;
}

/**
 * The tape, read short. Exact, or absent.
 *
 * ONE quote by default, not two. Two ran the opening line to eight
 * seconds of speech — past the hold cap, so the last word would have
 * been cut, on the one card where a viewer is deciding whether to
 * stay. The second index is on the strip for anyone who wants it.
 */
function sayTape(quotes) {
  const n = Number(process.env.REEL_SAY_QUOTES || 1);
  const said = [];
  for (const q of (quotes ?? []).slice(0, n)) {
    const name = SAY_SYM[q.sym]; if (!name) continue;
    const num = sayNum(q.chg); if (num == null) continue;
    const way = Number(String(q.chg).replace(/[−־]/g, '-').replace(',', '.')) < 0
      ? 'down' : 'up';
    said.push(`${name} ${way} ${num} percent.`);
  }
  return said.join(' ');
}

/**
 * One scene, one line — or nothing.
 *
 * The direction word is the same one the background already draws: if
 * the candles behind him fall, the voice says down. They cannot
 * disagree, because they read the same field.
 */
function sayScene(p, dir) {
  const hay = `${p.headline} ${p.stand ?? ''}`;
  const topic = TOPICS.find(t => t.re.test(hay))?.en ?? null;
  const fig = p.figures?.length && p.figureCount < 4 ? p.figures[0].text : null;
  const n = fig ? sayNum(fig) : null;
  const way = dir === 'up' ? 'up' : dir === 'dn' ? 'down' : null;
  if (topic && n && way) return `${cap(topic)}, ${way} ${n} percent.`;
  if (topic && n) return `${cap(topic)}. ${cap(sayNum(fig))} percent.`;
  if (n && way) return `${cap(way)} ${n} percent.`;
  // A topic and nothing else used to return "Crypto." — one word,
  // said out loud, in the middle of a summary. It was thin when the
  // narration was a list of fragments and it is broken now that the
  // narration is a telling: the listener hears a sentence, a sentence,
  // then a noun. Silence over the card is better, and the bed is
  // still playing under it.
  return null;
}

const cap = t => String(t ?? '').charAt(0).toUpperCase() + String(t ?? '').slice(1);

/**
 * The words that turn five sentences into one bulletin.
 *
 * Read aloud, isolated clauses land as a list — "Oil down two point
 * one percent." "Nvidia jumps three point seven five percent." — and
 * a list is not a summary of anything. One connective in front of
 * each beat after the first is the whole difference between a feed
 * and somebody telling you about the day.
 *
 * Fixed and rotating, never chosen by a model: a connective is a
 * claim about how two stories relate, and "because" or "despite"
 * would be inventing a link the source never drew. These only say
 * "and there was also this", which is the only relationship the
 * pipeline actually knows to be true.
 */
const JOIN = ['', 'Also, ', 'Meanwhile, ', 'And ', 'On top of that, '];

/**
 * The close: a reason to forward it, not a request to follow.
 *
 * Sends per reach is what the ranking pays for and a follow is not,
 * so the last card names a KIND OF PERSON the viewer knows rather
 * than asking for something on the account's behalf. Deliberately not
 * "שתפו" and never a number of friends — bait phrasing of that shape
 * is separately down-ranked, and it reads like every other account.
 *
 * Three of them, rotating on the day, so a daily reel does not close
 * on the identical sentence every afternoon.
 */
const SEND = [
  'שלחו לחבר שעוקב אחרי השוק',
  'מכירים מישהו שמשקיע? שלחו לו',
  'שלחו את זה למי שמחזיק מניות',
];
export const connective = i => JOIN[Math.min(i, JOIN.length - 1)];

/**
 * A headline short enough to be read off a moving card.
 *
 * Nine words is the cap, and the order of preference matters more
 * than the number: take the first clause if the sentence has one,
 * because a clause is a complete thought and a truncation is not.
 * Only when there is no clause boundary does it cut, and it cuts from
 * the END — Hebrew puts its negations early (לא, אין, ללא), so the
 * front of the line is where the meaning lives and dropping the tail
 * of a list is survivable in a way that dropping a "not" is not.
 *
 * The untrimmed headline still goes in the caption. Nothing is lost,
 * it is just not all on the card.
 */
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

/**
 * The number the reel opens on.
 *
 * The biggest move of the day, not the first story of the day and not
 * the account's own name. Magnitude across the beats, because a stock
 * jumping 3.75% stops a scroll and an index moving 1.33% does not,
 * and it falls back to the tape when no story carried a figure at all.
 *
 * Plausibility-bounded like everything else here: a "move" outside
 * TAPE_MAX_PCT is a level that got parsed as a percentage, which is
 * the exact shape of the bug that put SPX +46.06% on this account.
 */
const LEAD_MAX_PCT = Number(process.env.TAPE_MAX_PCT || 25);
export function leadFigure(beats, quotes) {
  const num = t => Math.abs(parseFloat(String(t).replace(/[−־]/g, '-')
    .replace(/,(\d{3})(?!\d)/g, '$1').replace(',', '.').replace('%', '')));
  let best = null;
  for (const p of beats) {
    if (!p.figures?.length || p.figureCount >= 4) continue;
    const f = p.figures[0], v = num(f.text);
    if (!Number.isFinite(v) || v > LEAD_MAX_PCT || v === 0) continue;
    // It has to be a MOVE, not merely a number.
    //
    // The first build of this card opened on "מכסים 25%" — a tariff
    // RATE, the largest figure in the window and not a market move at
    // all. A reel that opens by presenting a level as the day's
    // biggest change is lying in exactly the register this account
    // exists not to lie in. If direction() cannot say which way it
    // went, it is not the day's move.
    const d = direction(f.text, `${p.headline} ${p.stand ?? ''}`);
    if (d !== 'up' && d !== 'dn') continue;
    if (!best || v > best.v) best = { v, dir: d, text: f.text.replace(/[−־]/g, '-'), story: p };
  }
  if (best) return best;
  for (const q of quotes ?? []) {
    const v = num(q.chg);
    if (!Number.isFinite(v) || v > LEAD_MAX_PCT || v === 0) continue;
    if (!best || v > best.v) best = { v, text: String(q.chg).replace(/[−־]/g, '-'), sym: q.sym };
  }
  return best;
}

/** Which way the story points — the scene and his hands both follow it. */
const GEST = { up: 'yes', dn: 'pause', '': 'explain' };

/**
 * A reel: six scenes, twelve seconds, built to be watched by someone
 * who has never heard of this account.
 *
 * It is not a deck of boards with motion added. Every other archetype
 * here is a PAGE — text laid on a field, read at the reader's pace.
 * A reel scene is a FRAME: he stands inside a market that is visibly
 * doing something, one short line sits over it, and the viewer has
 * under two seconds to take it in before deciding whether to keep
 * watching. That is why the headline is short and enormous, why one
 * word carries the accent, and why the masthead, the tape and the
 * footer are all suppressed — at 1.9 seconds a masthead is noise.
 *
 * The scene, his gesture and his wardrobe all follow the story's
 * direction rather than a rotation, so a fall looks like a fall.
 */
export function composeReel(rows, { carry = {}, endTs = null, template = null } = {}) {
  const all = rows.map(parse).filter(Boolean).map(p => ({ ...p, score: score(p) }));
  const nothing = reason => ({ skip: reason, slides: [], consumed: all.map(p => p.tg_id) });
  if (!all.length) return nothing('empty');

  const parsed = dedupe(all.filter(p => !isSnapshot(p)));
  if (!parsed.length) return nothing('snapshots-only');

  const w0 = windowOf(parsed[0].ts);
  const w = endTs && endTs > w0.end ? { ...w0, end: endTs } : w0;
  const { quotes, carry: nextCarry, stamp } = tape(all, carry);

  const decay = Number(process.env.SCORE_DECAY_HOURS || 4);
  const freshness = p => p.score - (w.end - p.ts) / 3600 / decay;
  const pool = [...parsed].sort((a, b) => freshness(b) - freshness(a) || b.ts - a.ts);
  const beats = pool.slice(0, Number(process.env.REEL_BEATS || 4));
  if (beats.length < 2) return nothing('thin');

  const tpl = template ? byId(template) : null;
  const seed = [...w.key].reduce((a, c) => a + c.charCodeAt(0), 0);
  const DARK = ['ink', 'deep', 'midnight', 'abyss', 'basalt', 'navy'];
  const ground = i => DARK[(seed + i) % DARK.length];

  const scene = (p, i) => {
    const fig = p.figures?.length && p.figureCount < 4
      ? p.figures[0].text.replace(/[−־]/g, '-') : null;
    const dir = fig ? direction(p.figures[0].text, `${p.headline} ${p.stand ?? ''}`) : '';
    // Nine words on the card; the whole sentence still goes in the
    // caption, so nothing is lost, it is just not all on screen.
    const fit = fitCard(p.headline);
    const marked = markWord(fit.text, p.figures);
    return { type: 'scene', headline: fit.text, full: p.headline, trimmed: fit.trimmed,
      marked, say: sayScene(p, dir),
      // The figure goes UNDER the line only when the line does not
      // already contain it. Printing 1.33% in the headline and again
      // beneath it is the board stuttering.
      sub: fig && !marked.includes(`<em>${fig}`) ? fig : null,
      dir, gesture: GEST[dir] ?? 'explain', seed: seed + i * 7,
      // The photo the message actually carried, when it carried one.
      //
      // A picture of the thing being reported beats a drawn candle
      // wall, and it is the only kind of image this account can put on
      // a board honestly: it came with the story. Nothing here
      // generates or searches for an image — an illustration that
      // merely looks like the news is a claim about the news.
      photo: p.photo ?? null,
      palette: ground(i), source: p.source };
  };

  // 01 · the number.
  //
  // This was a masthead — "היום בשוק" over the tape strip — and a
  // masthead spends the highest-leverage second of the reel telling a
  // stranger the account name that Instagram is already drawing above
  // the video. It opens on the biggest move of the day instead, at
  // the size of the screen, and the story behind that number is
  // promoted to the first beat so the hook is paid off immediately
  // rather than four cards later.
  const lead = leadFigure(beats, quotes);
  const order = lead?.story
    ? [lead.story, ...beats.filter(b => b !== lead.story)]
    : beats;
  // The direction the parser found, not one re-derived from a minus
  // sign — the tape's chg for a fall does not always carry one.
  const leadDir = lead?.dir
    ?? (lead ? (String(lead.text).trim().startsWith('-') ? 'dn' : 'up') : '');
  const leadSubject = lead?.story
    ? (TOPICS.find(t => t.re.test(`${lead.story.headline} ${lead.story.stand ?? ''}`))?.word ?? null)
    : (lead?.sym ? SAY_SYM_HE[lead.sym] ?? null : null);

  const slides = [lead
    ? { type: 'scene', lead: true, headline: leadSubject ?? 'היום בשוק',
        marked: leadSubject ? esc(leadSubject) : 'היום ב<em>שוק</em>',
        big: lead.text, sub: hhmm(w.end), dir: leadDir,
        gesture: GEST[leadDir] ?? 'explain', seed, palette: ground(0), own: true,
        say: `Here's the U S market today. ${sayTape(quotes)}`.trim() }
    // No plausible figure in the whole window is rare and is not worth
    // inventing a hook over. The old card stands, honestly thin.
    : { type: 'scene', headline: 'היום בשוק', marked: 'היום ב<em>שוק</em>',
        sub: hhmm(w.end), dir: '', gesture: 'welcome', seed,
        palette: ground(0), own: true,
        say: `Here's the U S market today. ${sayTape(quotes)}`.trim() }];

  // 02-06 · the news, one story a scene, biggest first.
  order.forEach((p, i) => slides.push(scene(p, i + 1)));

  // 06 · the ask. A stranger who watched to the end is the only
  // person on this platform worth asking for anything.
  const ask = process.env.REEL_SEND_ASK || SEND[seed % SEND.length];
  slides.push({ type: 'scene', headline: ask, marked: markWord(ask, null),
    sub: TG_LINK, dir: '', gesture: 'point', seed: seed + 99,
    palette: ground(beats.length + 1), own: true,
    say: process.env.REEL_SAY_CLOSE || "That's the day. Send it to someone who trades." });

  return {
    key: `R:${w.key}`, template, window: span(w), date: ddmmyy(w.end),
    stamp, quotes, slides,
    caption: caption(parsed, w),
    consumed: all.map(p => p.tg_id), carry: nextCarry,
  };
}

const MAX_STORIES = Number(process.env.MAX_STORIES || 3);

/** The channel the account points at, in one place. */
// One home for the address, because it moves. It moved on 6 September
// — the channel renamed from nq_es_hunters to hamal_shukhahon — and
// every board that prints it, the story strip and the evening card
// alike, reads this constant.
export const TG_LINK = 't.me/hamal_shukhahon';

/**
 * The same hour, told as stories instead of summarised as a post.
 *
 * A digest answers "what happened between 15:15 and 21:15"; a story
 * answers "what just happened". So this does not summarise: it takes
 * the few highest-scoring updates of the window and gives each one a
 * whole board. Up to three, because a viewer taps through stories and
 * the fourth is where they leave.
 *
 * It reads the same messages as compose() and marks them on a
 * separate cursor, so telling an hour as stories never costs the
 * digest that will later summarise it.
 */
export function composeStories(rows, { carry = {}, endTs = null, template = null, tally = 0, catchup = false, story = null, palette = null } = {}) {
  const all = rows.map(parse).filter(Boolean).map(p => ({ ...p, score: score(p) }));
  const w0 = all.length ? windowOf(all[0].ts) : null;
  const nothing = reason => ({ key: w0?.key ?? null, skip: reason, slides: [],
    consumed: all.map(p => p.tg_id), carry: tape(all, carry).carry });
  if (!all.length) return nothing('empty');

  const parsed = dedupe(all.filter(p => !isSnapshot(p)));
  if (!parsed.length) return nothing('snapshots-only');

  const w0m = windowOf(parsed[0].ts);
  const w = endTs && endTs > w0m.end ? { ...w0m, end: endTs } : w0m;
  const { quotes, carry: nextCarry, stamp } = tape(all, carry);

  const picks = [...parsed].sort((a, b) => b.score - a.score || b.ts - a.ts)
    .slice(0, MAX_STORIES);

  // Which board an update gets.
  //
  // THE HEADLINE LEADS. This list used to open with the figure and the
  // interpretation and leave the news last, which was survivable while
  // a set was three boards — you got a number, a meaning and a
  // headline, and the mix read as an hour's work. At ONE board a set
  // the order stopped being a preference and became a verdict, and it
  // always fell the same way: a note is worth four of the seven points
  // a message can score, so the top-scored update almost always
  // carries one, and every story on the account came out
  // MEANING · משמעות. Four in a row, and no news at all.
  //
  // So the news board is the default and the other two are seasoning:
  // two hours of headlines, then one that reads the number or the
  // meaning behind it. The turn comes from the hour itself, so it
  // advances without anything having to be remembered between runs.
  const hourNo = Math.floor(w.start / 3600);
  const seasoned = hourNo % 3 === 2;
  // Among the seasoned hours, alternate which one it is. Preferring
  // the figure every time would bury the meaning board again — most
  // updates carry a number, so it would always win and the
  // interpretation would show up about as often as it did before,
  // which is to say never.
  const prefersFigure = Math.floor(hourNo / 3) % 2 === 0;

  const options = p => {
    const out = [];
    const fig = p.figures?.[0];
    // A board told at the time says "now"; a board told late says the
    // hour it is about. The masthead carries the span either way, but
    // the eyebrow is the word a reader takes on trust, and a catch-up
    // that still says "now" is the one thing that would make the
    // track dishonest rather than merely late.
    const news = { type: 'cover', eyebrow: catchup ? hhmm(p.ts) : 'עכשיו',
      headline: p.headline, stand: p.stand, source: p.source, photo: p.photo };
    if (!seasoned) out.push(news);
    const hero = fig && p.figureCount < 4
      ? { type: 'hero', figure: fig.text.replace(/[−־]/g, '-'),
          dir: direction(fig.text, `${p.headline} ${p.stand ?? ''}`),
          quote: p.stand || p.headline, source: p.source }
      : null;
    if (hero && prefersFigure) out.push(hero);
    // Even the meaning board names the story it is about. It has always
    // had the slot for it and was never given one, so a reader who met
    // the account on an interpretation board got a verdict about news
    // they had never been told.
    // The board shows its working. A verdict with nothing under it is
    // an opinion; the same verdict with the reported facts above it is
    // an argument the reader can check and disagree with. Everything
    // here comes from the message itself — the headline it is about,
    // the reporting lines beneath it, and the figure if the update
    // carried a clean one. Nothing is inferred.
    if (p.note) {
      const basis = p.reporting.slice(0, 2);
      const fg = p.figures.length && p.figureCount < 4
        ? p.figures[0].text.replace(/[−־]/g, '-') : null;
      // Pulled out only when it is not already sitting in the line
      // underneath it — otherwise the board says 41% twice, once big
      // and once mid-sentence, and reads as a stutter rather than a
      // headline number.
      const stat = fg && !basis.some(b => b.includes(fg)) ? fg : null;
      out.push({ type: 'note', about: p.headline, text: p.note,
        basis, stat, source: p.source });
    }
    if (hero && !prefersFigure) out.push(hero);
    // Always last as well, so a seasoned hour with neither a figure
    // nor a note still has news to fall back on.
    if (seasoned) out.push(news);
    return out;
  };

  // Archetypes AND grounds rotate down the set: an hour whose three
  // updates all happen to be plain headlines should still look like
  // three boards, not one board three times. The two grounds come
  // from the template, so a set is recognisably one hour's work while
  // the next hour looks different.
  const tpl = template ? byId(template) : null;
  const seed = [...w.key].reduce((a, c) => a + c.charCodeAt(0), 0);
  const DARK = ['ink', 'deep', 'slate'];

  const slides = [];
  let prev = null;
  for (const [i, p] of picks.entries()) {
    const opts = options(p);
    const pick = opts.find(o => o.type !== prev) ?? opts[0];
    // The cover's photo bleeds behind a scrim mixed for a dark ground.
    // On paper or on a colour field that scrim is a smear, so a board
    // carrying a picture keeps a dark one.
    // A story is one board, so it has one ground — the template's —
    // rather than a post's alternating pair. A board carrying a
    // picture still overrides to a dark world, because the scrim is
    // mixed for one.
    const pal = pick.photo
      ? DARK[(seed + i) % DARK.length]
      : (palette ?? (tpl ? (i % 2 ? tpl.b : tpl.a) : DARK[(seed + i) % DARK.length]));
    slides.push({ ...pick, palette: pal, story });
    prev = pick.type;
  }

  if (!slides.length) return { ...nothing('thin'), slides };

  // ── the Telegram strip, every sixth board ─────────────────
  //
  // Not a board of its own — the ask was for it ON the story — and
  // not a link sticker either, because Instagram's publishing API has
  // no parameter for one. Link stickers, polls and countdowns are all
  // app-only; nothing written here can make a published story tappable.
  // So the strip is the address, printed on the news board itself,
  // where the tappable route is the profile and the bio link under it.
  //
  // `tally` is how many boards have been told since the last strip and
  // it survives between runs in Postgres: a set is two or three boards,
  // so a rule counted inside one set would fire either never or every
  // single time.
  const every = Number(process.env.STORY_CTA_EVERY || 6);

  const told = [];
  let t = tally;
  for (const s of slides) {
    t++;
    told.push(t >= every ? { ...s, tgStrip: TG_LINK } : s);
    if (t >= every) t = 0;
  }

  return {
    key: `S:${w.key}`,
    template,
    tally: t,
    window: span(w),
    date: ddmmyy(w.end),
    stamp, quotes, slides: told,
    // Every message in the window is marked, not just the three that
    // were told — otherwise the two that lost would resurface as the
    // "latest" news an hour after they stopped being it.
    consumed: all.map(p => p.tg_id),
    carry: nextCarry,
  };
}

/**
 * §07: "Slides carry headlines and figures. The reporting lives in
 * the caption, where it is searchable." So the caption is the full
 * text — emoji kept, unlike on the slides.
 */
/**
 * What this window is ABOUT, in the words people search.
 *
 * Instagram now ranks on keywords rather than hashtags, and Google
 * indexes captions — so the terms have to appear in the prose, near
 * the top, phrased like a sentence. The tags at the end are for
 * categorisation, three to five of them; thirty reads as spam and has
 * not driven discovery for years.
 *
 * Detection is deterministic, like everything else here: a term is in
 * the caption because the window actually mentioned it.
 */
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

/** The topics this window genuinely touches, most-mentioned first. */
function topicsIn(parsed) {
  const hay = parsed.map(p => `${p.headline} ${p.stand ?? ''} ${p.note ?? ''}`).join(' ');
  return TOPICS.filter(t => t.re.test(hay));
}

export function caption(parsed, w) {
  // Instagram's ceiling is 2200. Sit under it: Meta counts its own way
  // (an emoji is not one character to everyone) and a caption that is
  // four characters over costs the entire window — 36004/2207010, at
  // the very last call, after eight slides have already been rendered
  // and uploaded.
  const LIMIT = 2120;
  // The "+N in telegram" line is written AFTER the loop that decides
  // what fits, so its length has to be reserved before it exists. Not
  // reserving it is exactly how a caption lands a few chars over.
  const RESERVE = 48;

  // Keywords first, because that is where search looks and where a
  // reader decides. One natural line naming what the window is about,
  // then the lead headline.
  const topics = topicsIn(parsed);
  const named = topics.slice(0, 4).map(t => t.word).join(' · ');
  const opener = named
    ? `שוק ההון האמריקאי | ${named}\n\n`
    : 'שוק ההון האמריקאי | עדכון מהמסחר\n\n';

  // Three to five, and only ones the window earned. The two standing
  // tags are what the account itself is, so it stays findable on days
  // when nothing else matches.
  const tags = ['שוקההון', 'מסחר', ...topics.slice(0, 3).map(t => t.tag)]
    .filter((t, i, a) => a.indexOf(t) === i).slice(0, 5)
    .map(t => '#' + t).join(' ');

  const foot = `\nעדכון ${span(w)} · @marketalert.il\n${tags}`;
  const head = opener + parsed[0].headline + '\n';

  // Whole stories, never a half one. Slicing at 2200 cut mid-word on
  // every busy window; dropping the tail story is the honest version.
  let body = '', dropped = 0;
  for (const [i, p] of parsed.entries()) {
    // The lead's headline is already the line above; repeating it as
    // the first bullet spent the two most valuable lines of the
    // caption saying the same thing twice.
    const block = [i === 0 ? null : `▪ ${p.headline}`, ...p.reporting.map(clean),
      p.note ? `💡 ${p.note}` : null, p.source ? `מקור: ${p.source}` : null, '']
      .filter(Boolean).join('\n') + '\n';
    if (head.length + body.length + block.length + foot.length + RESERVE > LIMIT) { dropped++; continue; }
    body += block;
  }
  const more = dropped ? `(+${dropped} עדכונים בטלגרם)\n` : '';
  let out = head + body + more + foot;

  // Belt and braces. Everything above is arithmetic on estimates; this
  // is the only line that guarantees the result. Whole lines go, never
  // half a word.
  if (out.length > LIMIT) {
    const lines = (head + body).split('\n');
    while (lines.length > 1 && lines.join('\n').length + more.length + foot.length > LIMIT) lines.pop();
    out = lines.join('\n') + '\n' + more + foot;
  }
  return out;
}

// ── the callback deck ────────────────────────────────────────
//
// One board, built from one settled claim. Everything on it is a
// fact the database can produce: the date we published, the headline
// we published, the close before it and the close after. No adjective
// is added anywhere in this function — if the move was small, the
// board says a small number, and the rule that let it get this far
// (callback.js) is where the size is judged.

/** "יומיים", not "2 ימים" — Hebrew has a dual and using it matters. */
function sessions(n) {
  if (n <= 1) return 'יום מסחר אחד';
  if (n === 2) return 'יומיים';
  return `${n} ימי מסחר`;
}

const cut = (t, max = 96) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const at = s.lastIndexOf(' ', max);
  return `${s.slice(0, at > 40 ? at : max)}…`;
};

/** A close, written the way a trader reads it. */
function px(v, klass) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const dp = klass === 'stock' ? 2 : (Math.abs(n) >= 1000 ? 0 : 2);
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Postgres hands a `date` back as a Date; a fixture hands a string. */
function dayOf(v) {
  if (!v) return '';
  const iso = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

// Three ways to say one true thing.
//
// A proof board that looks identical every time stops being read
// after the second one, and this is the format the account most needs
// people to keep reading. The variant comes from the claim's own id,
// so a rerun reproduces the board it reran and two boards in a day
// are never the same shape.
const PROOF_VARIANTS = ['proofCert', 'proofVerdict'];

/**
 * One settled claim as one board.
 *
 * "אמרנו" is only ever printed over a post that actually made the
 * claim. A follow-up — we covered this, here is what happened since —
 * says exactly that instead, on the same three layouts.
 */
export function proofSlide(claim, { palette = null, variant = null } = {}) {
  const move = Number(claim.move_pct);
  const dir = move >= 0 ? 'up' : 'dn';
  const forecast = claim.kind === 'forecast';
  const figure = `${move > 0 ? '+' : ''}${move.toFixed(1)}%`;
  const said = cut(claim.headline);
  const sub = `${claim.asset} · ${sessions(Number(claim.days_after) || 1)} אחרי`;
  const type = variant ?? PROOF_VARIANTS[Number(claim.id ?? 0) % PROOF_VARIANTS.length];
  const path = Array.isArray(claim.path) ? claim.path : null;

  // The middle link. Without it the board says "we were right" and
  // stops, which is a coincidence told loudly; with it the board says
  // why we thought so, which is the only version worth publishing.
  // It is the channel's own interpretation line, never ours.
  const why = cut(claim.reason ?? '', 150) || null;

  const base = { palette, dir, figure, said, sub, type, path, why,
    fromPx: px(claim.base_px, claim.klass), toPx: px(claim.out_px, claim.klass),
    fromLabel: `סגירה לפני הפוסט · ${dayOf(claim.base_date)}`,
    toLabel: `סגירה · ${dayOf(claim.out_date)}`,
    tag: forecast ? 'אומת' : 'מעקב',
    method: 'נמדד ממחיר הסגירה שלפני הפוסט' };

  // The seal says what was actually verified. A forecast that landed
  // may say so; a follow-up says what it is, on the same sheet.
  // The loudest line on the board, and the only one that is about
  // the account rather than the news. Two words, so it can be set at
  // display size without wrapping: what we did, and what happened.
  const stamp = forecast ? 'אמרנו. והתממש.' : 'סיקרנו. והמשיך.';
  const when = `פורסם ${dmy(Number(claim.posted_at))} · אומת ${dayOf(claim.out_date)}`;
  if (type === 'proofVerdict') return { ...base, stamp, when };
  return { ...base, stamp, when };
}

/** One board, for the story track. */
export function composeCallback(claim, { palette = null, now = null, variant = null } = {}) {
  const at = now ?? Math.floor(Date.now() / 1000);
  return {
    key: `C:${localDay(at)}T${hhmm(at)}`,
    window: `${dmy(Number(claim.posted_at))}\u2013${dmy(at)}`,
    date: ddmmyy(at),
    stamp: '', quotes: [],
    slides: [proofSlide(claim, { palette, variant })],
    claimId: claim.id,
  };
}

// ── the proof post ───────────────────────────────────────────
//
// The stories reach followers. This is the one that reaches the grid,
// where a stranger decides in two seconds whether an account is worth
// following — and "here is what we said and here is what the market
// did, twice, with the closes" is the strongest two seconds this
// account has.
//
// It is never a single call. One proven call is a story; a post has
// to be a RECORD, which is why it needs two and ends on the method.

const PROOF_GROUNDS = ['deep', 'ink', 'slate'];

export function composeCallbackPost(hits, { now = null, score = null } = {}) {
  const at = now ?? Math.floor(Date.now() / 1000);
  if (!hits?.length) return { skip: 'nothing proven' };

  // The grounds come from the archetype now — paper for the
  // receipts, the accent field for the verdict — so the cards only
  // have to alternate SHAPE, which they do by variant.
  const cards = hits.map((h, i) =>
    proofSlide(h, { palette: null, variant: PROOF_VARIANTS[i % PROOF_VARIANTS.length] }));

  const n = hits.length;
  const cover = {
    type: 'coverProof', palette: null, tag: 'אומת',
    method: 'כל מספר נמדד ממחירי סגירה',
    eyebrow: 'הקריאות שלנו',
    headline: 'אמרנו. וזה מה שקרה.',
    stand: `${n === 1 ? 'עדכון אחד' : `${n} עדכונים`} מהשבוע האחרון, `
         + 'והמספרים שהגיעו אחריהם.',
  };

  // The record board, and the only place the method is written down.
  // A hit rate with nothing under it is a number anybody can print.
  const items = hits.slice(0, 5).map(h => ({
    asset: h.asset,
    when: dmy(Number(h.posted_at)),
    move: `${Number(h.move_pct) > 0 ? '+' : ''}${Number(h.move_pct).toFixed(1)}%`,
    dir: Number(h.move_pct) >= 0 ? 'up' : 'dn',
  }));
  const hit30 = score?.hit ?? n;
  const rec = {
    type: 'record', palette: null, tag: 'השיא', method: 'ללא בחירת תאריכים בדיעבד',
    eyebrow: '30 הימים האחרונים',
    count: String(hit30),
    of: hit30 === 1 ? 'עדכון שהשוק אישר' : 'עדכונים שהשוק אישר',
    items,
    note: 'נמדד ממחיר הסגירה שלפני הפוסט ועד הסגירה שאחריו, '
        + 'עד שלושה ימי מסחר. בלי בחירת תאריכים בדיעבד.',
  };

  const lines = hits.map(h =>
    `▪ ${dmy(Number(h.posted_at))} · ${h.asset} — ${h.headline ?? ''}\n`
    + `   ${Number(h.move_pct) > 0 ? '+' : ''}${Number(h.move_pct).toFixed(1)}% `
    + `תוך ${sessions(Number(h.days_after) || 1)}`).join('\n');
  const caption = 'שוק ההון האמריקאי | מה שאמרנו · ומה שקרה\n\n'
    + `${lines}\n\n`
    + 'כל מספר כאן נמדד ממחיר הסגירה שלפני הפוסט ועד הסגירה שאחריו, '
    + 'עד שלושה ימי מסחר, בלי לבחור תאריכים בדיעבד.\n'
    + `עדכונים שוטפים · @marketalert.il\n`
    + '#שוקההון #מסחר #וולסטריט';

  return {
    key: `CP:${localDay(at)}T${hhmm(at)}`,
    window: `${dmy(Number(hits[hits.length - 1].posted_at))}\u2013${dmy(at)}`,
    date: ddmmyy(at),
    stamp: '', quotes: [],
    slides: [cover, ...cards, rec],
    caption,
    claimIds: hits.map(h => h.id),
  };
}

/**
 * The words somebody types into Instagram's search box.
 *
 * Search is a real discovery surface now and this account is invisible
 * in it: the captions were written for a reader who had already found
 * the post. These are the terms a person actually types in Hebrew when
 * they want to know what the market did — put in the caption prose as
 * well as the tags, because the index reads both and a reader only
 * reads one.
 */
export function searchLine() {
  return 'שוק ההון האמריקאי · מה קרה היום בשוק · חדשות וול סטריט\n'
       + '#שוקההון #וולסטריט #מסחר #בורסה #השקעות #נאסדק #מניות';
}

// ── the proof reel ───────────────────────────────────────────
//
// Six beats, and the sequence is the argument: the claim, the date,
// the reasoning, the evidence, the verdict, the record. A reel is
// watched with the sound off at arm's length, so each beat is one
// idea at one size, and the only one that repeats is the colour.
export function composeProofReel(claim, { now = null, score = null } = {}) {
  const at = now ?? Math.floor(Date.now() / 1000);
  const move = Number(claim.move_pct);
  const dir = move >= 0 ? 'up' : 'dn';
  const forecast = claim.kind === 'forecast';
  const figure = `${move > 0 ? '+' : ''}${move.toFixed(1)}%`;
  const days = sessions(Number(claim.days_after) || 1);
  const why = cut(claim.reason ?? '', 130);
  const path = Array.isArray(claim.path) ? claim.path : null;

  // He opens the film and then gets out of the way. On the evidence
  // beats the chart and the number ARE the subject, and a mascot
  // standing in front of them is two subjects fighting.
  const S = (beat, o) => ({ type: 'sceneProof', beat, dir, ron: beat === 'hook' ? undefined : null, ...o });
  const slides = [
    S('hook', { palette: null, ground: 'verd',
      headline: forecast ? 'אמרנו.\nוהתממש.' : 'סיקרנו.\nוהמשיך.',
      sub: `${claim.asset} · ${dmy(Number(claim.posted_at))}` }),
    S('said', { ground: 'sheet',
      eyebrow: forecast ? `מה אמרנו · ${dmy(Number(claim.posted_at))}`
                        : `מה סיקרנו · ${dmy(Number(claim.posted_at))}`,
      headline: cut(claim.headline, 78) }),
    ...(why ? [S('why', { ground: 'sheet', eyebrow: 'למה', headline: why })] : []),
    S('chart', { ground: 'sheet', eyebrow: 'ומה קרה', path,
      fromPx: px(claim.base_px, claim.klass), toPx: px(claim.out_px, claim.klass),
      // Written in words, not with an arrow: an arrow between two
      // dates on an RTL line is reordered by the bidi algorithm and
      // the range comes out backwards — which on this board would be
      // a false statement about when the move happened.
      sub: `מהסגירה ב-${dayOf(claim.base_date)} עד הסגירה ב-${dayOf(claim.out_date)}` }),
    S('number', { ground: 'verd', eyebrow: claim.asset, big: figure,
      sub: `${days} אחרי הפוסט` }),
    S('record', { ground: 'sheet', eyebrow: '30 הימים האחרונים',
      big: String(score?.hit ?? 1), headline: 'קריאות שהשוק אישר',
      sub: 'נמדד ממחיר הסגירה שלפני הפוסט ועד הסגירה שאחריו. בלי בחירת תאריכים בדיעבד.' }),
  ];

  const caption = `${forecast ? 'אמרנו. והתממש.' : 'סיקרנו. והמשיך.'}\n\n`
    + `${claim.headline ?? ''}\n`
    + `פורסם ${dmy(Number(claim.posted_at))} · ${claim.asset} ${figure} תוך ${days}\n`
    + (why ? `למה: ${why}\n` : '')
    + `\nכל מספר נמדד ממחיר הסגירה שלפני הפוסט ועד הסגירה שאחריו, `
    + `בלי לבחור תאריכים בדיעבד.\n\n${searchLine()}\n@marketalert.il`;

  return { key: `R:${localDay(at)}T${hhmm(at)}`, window: dmy(at), date: ddmmyy(at),
    stamp: '', quotes: [], slides, caption, claimId: claim.id, proof: true };
}

// ── the scoreboard reel ──────────────────────────────────────
//
// Once a week, the record itself as the film. Not a call — the
// COLUMN of calls, which is the only thing that answers the question
// a stranger actually has about a finance account: does this one
// know what it is talking about, and how would I know.
//
// It runs on a Sunday, when the US market is shut and there is no
// news worth a bulletin — the emptiest slot in the week, given to the
// piece with the longest shelf life.
export function composeScoreboardReel(hits, { now = null, score = null, days = 30 } = {}) {
  const at = now ?? Math.floor(Date.now() / 1000);
  if (!hits?.length) return { skip: 'nothing proven' };
  const n = score?.hit ?? hits.length;

  const row = h => {
    const move = Number(h.move_pct);
    return {
      type: 'sceneProof', beat: 'row', ron: null, ground: 'sheet',
      dir: move >= 0 ? 'up' : 'dn',
      eyebrow: `${h.asset} · ${dmy(Number(h.posted_at))}`,
      big: `${move > 0 ? '+' : ''}${move.toFixed(1)}%`,
      headline: cut(h.headline, 60),
      sub: `${sessions(Number(h.days_after) || 1)} אחרי הפוסט`,
    };
  };

  const slides = [
    { type: 'sceneProof', beat: 'hook', ground: 'verd',
      headline: `${n}\nקריאות.\nהשוק אישר.`,
      sub: `${days} הימים האחרונים` },
    ...hits.slice(0, 3).map(row),
    { type: 'sceneProof', beat: 'record', ron: null, ground: 'sheet',
      eyebrow: 'איך זה נמדד', big: String(n),
      headline: 'קריאות שהשוק אישר',
      sub: 'ממחיר הסגירה שלפני הפוסט ועד הסגירה שאחריו, עד שלושה ימי מסחר. '
         + 'בלי בחירת תאריכים בדיעבד.' },
  ];

  const lines = hits.slice(0, 3).map(h =>
    `▪ ${dmy(Number(h.posted_at))} · ${h.asset} ${Number(h.move_pct) > 0 ? '+' : ''}`
    + `${Number(h.move_pct).toFixed(1)}% — ${h.headline ?? ''}`).join('\n');
  const caption = `${n} קריאות שהשוק אישר ב-${days} הימים האחרונים\n\n${lines}\n\n`
    + 'כל מספר נמדד ממחיר הסגירה שלפני הפוסט ועד הסגירה שאחריו, '
    + 'עד שלושה ימי מסחר, בלי לבחור תאריכים בדיעבד.\n'
    + `${searchLine()}\n@marketalert.il`;

  return { key: `R:${localDay(at)}T${hhmm(at)}`, window: dmy(at), date: ddmmyy(at),
    stamp: '', quotes: [], slides, caption, scoreboard: true, claimIds: hits.map(h => h.id) };
}
