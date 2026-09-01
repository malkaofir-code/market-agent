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
export function tape(parsed, carry = {}) {
  const seen = { ...carry };
  for (const p of parsed) for (const l of p.levels) {
    seen[l.sym] = { ...l, at: p.ts, last: l.last ?? seen[l.sym]?.last ?? '—' };
  }
  // design.html's specimen used NQ/ES/YM, but the channel actually
  // quotes NQ, ES and SPX - YM never appeared once in 7 days. Keeping
  // YM in and SPX out silently threw away a third of the tape, and
  // left the chart slide (which needs 3 points) unbuildable.
  const order = ['NQ', 'ES', 'SPX', 'YM', 'NDX', 'RTY'];
  const quotes = order.filter(s => seen[s]).map(s => seen[s]);
  const freshest = Math.max(0, ...quotes.map(q => q.at || 0));
  return { quotes, carry: seen, stamp: freshest ? hhmm(freshest) : '' };
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
  slides.push({ type: coverType,
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
  const room = cap - slides.length - (isCta ? 1 : 0);

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

  // 06 · telegram CTA — 23:00 deck only
  if (isCta) slides.push({ type: 'telegram', big: 'הבית של סוחרי NQ & ES',
    link: TG_LINK,
    schedule: [
      { time: '08:00', label: 'סקירת בוקר' }, { time: '15:00', label: 'טרום־פתיחה' },
      { time: '18:00', label: 'סקירת פתיחה' }, { time: '23:00', label: 'סיכום יום' }] });

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

const MAX_STORIES = Number(process.env.MAX_STORIES || 3);

/** The channel the account points at, in one place. */
export const TG_LINK = 't.me/nq_es_hunters';

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
export function composeStories(rows, { carry = {}, endTs = null, template = null, tally = 0, catchup = false } = {}) {
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

  // Each update is offered as whichever archetypes it can support, in
  // order of preference — then the set is dealt so that two boards
  // running never use the same one. Three heroes in a row is a viewer
  // tapping through the same picture three times.
  const options = p => {
    const out = [];
    const fig = p.figures?.[0];
    if (fig && p.figureCount < 4)
      out.push({ type: 'hero', figure: fig.text.replace(/[−־]/g, '-'),
        dir: direction(fig.text, `${p.headline} ${p.stand ?? ''}`),
        quote: p.stand || p.headline, source: p.source });
    if (p.note) out.push({ type: 'note', text: p.note, source: p.source });
    // A board told at the time says "now"; a board told late says the
    // hour it is about. The masthead carries the span either way, but
    // the eyebrow is the word a reader takes on trust, and a catch-up
    // that still says "now" is the one thing that would make the
    // track dishonest rather than merely late.
    out.push({ type: 'cover', eyebrow: catchup ? hhmm(p.ts) : 'עכשיו', headline: p.headline,
      stand: p.stand, source: p.source, photo: p.photo });
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
    const pal = pick.photo
      ? DARK[(seed + i) % DARK.length]
      : (tpl ? (i % 2 ? tpl.b : tpl.a) : DARK[(seed + i) % DARK.length]);
    slides.push({ ...pick, palette: pal });
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
  { re: /נאסד|nasdaq|NQ\b/i,                    word: 'נאסד״ק',        tag: 'נאסדק' },
  { re: /S&P|אס אנד פי|ES\b/i,                  word: 'S&P 500',       tag: 'SP500' },
  { re: /דאו|YM\b/i,                            word: 'דאו ג׳ונס',     tag: 'דאוגונס' },
  { re: /ריבית|הפד\b|פדרל|פאוול|FOMC/i,         word: 'ריבית הפד',     tag: 'ריביתהפד' },
  { re: /אינפלצי|מדד המחירים|CPI|PCE/i,          word: 'אינפלציה',      tag: 'אינפלציה' },
  { re: /נפט|ברנט|אופ"?ק|OPEC/i,                 word: 'נפט',           tag: 'נפט' },
  { re: /זהב|gold/i,                             word: 'זהב',           tag: 'זהב' },
  { re: /ביטקוין|קריפטו|bitcoin|BTC/i,           word: 'קריפטו',        tag: 'קריפטו' },
  { re: /תשואו?ת|אג"?ח|אגרות חוב|treasury/i,     word: 'תשואות אג״ח',   tag: 'אגח' },
  { re: /דולר|שקל|מטבע|forex/i,                  word: 'מט״ח',          tag: 'מטח' },
  { re: /אנבידיה|NVDA|שבבים|semiconduct/i,       word: 'שבבים',         tag: 'שבבים' },
  { re: /טראמפ|trump|מכס|tariff/i,               word: 'מכסים',         tag: 'מכסים' },
  { re: /דוחות|earnings|רווחי/i,                 word: 'עונת הדוחות',   tag: 'דוחות' },
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
