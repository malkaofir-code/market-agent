// ─────────────────────────────────────────────────────────────
// compose.js — a 15-minute window -> a deck plan.
// Deterministic. No model, no network. Every rule here is either
// quoted from design.html or measured off the 299-message sample.
// ─────────────────────────────────────────────────────────────
import { parse, score, direction } from './parse.js';
import { clean, stripLeadEmoji } from './rtl.js';
import 'dotenv/config';

const TZ = process.env.TZ || 'Asia/Jerusalem';
// 15 was the original design; hourly is what the free Actions tier
// affords, and it makes richer decks (~10-12 messages, not ~4).
export const WIN = Number(process.env.WINDOW_MINUTES || 60);
const WIN_S = WIN * 60;
const MAX = Number(process.env.MAX_SLIDES || 10);
const MAX_CTA = Number(process.env.MAX_SLIDES_WITH_CTA || 9);

const fmt = (ts, o) => new Intl.DateTimeFormat('en-GB',
  { timeZone: TZ, hour12: false, ...o }).format(new Date(ts * 1000));
const hhmm = ts => fmt(ts, { hour: '2-digit', minute: '2-digit' });
const ddmmyy = ts => fmt(ts, { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '.');

/** Window key + bounds for any instant, snapped to the WIN grid. */
export function windowOf(ts) {
  const mins = Number(fmt(ts, { minute: '2-digit' }));
  const start = ts - (mins % WIN) * 60 - Number(fmt(ts, { second: '2-digit' }));
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

export function compose(rows, { now = null, carry = {} } = {}) {
  const all = rows.map(parse).filter(Boolean).map(p => ({ ...p, score: score(p) }));
  const w0 = all.length ? windowOf(all[0].ts) : null;
  const nothing = reason => ({ key: w0?.key ?? null, skip: reason, slides: [],
    consumed: all.map(p => p.tg_id), carry: tape(all, carry).carry });
  if (!all.length) return nothing('empty');

  // snapshots feed the tape, then leave the deck
  const parsed = dedupe(all.filter(p => !isSnapshot(p)));
  // a window of nothing but futures snapshots has no news in it
  if (!parsed.length) return nothing('snapshots-only');

  const w = windowOf(parsed[0].ts);
  const { quotes, carry: nextCarry, stamp } = tape(all, carry);   // snapshots included

  // §04: "a story cannot appear on both the cover and a card" —
  // each message is consumed exactly once across the deck.
  const pool = [...parsed].sort((a, b) => b.score - a.score || a.ts - b.ts);
  const used = new Set();
  const take = pred => {
    const hit = pool.find(p => !used.has(p.tg_id) && pred(p));
    if (hit) used.add(hit.tg_id);
    return hit ?? null;
  };

  const slides = [];
  const isCta = hhmm(w.start).startsWith('23');      // §05: once a day
  const cap = isCta ? MAX_CTA : MAX;

  // 01 · cover — highest score, not most recent.
  // The framed treatment needs a photo to frame; without one it falls
  // back to the plain cover, which reads as deliberate rather than
  // broken because the text hangs off the bottom either way.
  const lead = take(() => true);
  slides.push({ type: lead.photo ? 'coverFramed' : 'cover',
    headline: lead.headline, stand: lead.stand, source: lead.source, photo: lead.photo });

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
  if (noted) slides.push({ type: 'note', about: noted.headline, text: noted.note, source: noted.source });

  // 04 · chart — "three real data points minimum. Fewer becomes a
  // hero figure instead."
  if (quotes.length >= 3) slides.push({ type: 'chart', series: quotes, stamp });

  // 05 · item slides — the redesign's point: a story that brought a
  // photo gets a slide of its own rather than a line in a list. Capped
  // so the tail still fits; whatever is left falls through to the list.
  const room0 = cap - slides.length - (isCta ? 1 : 0);
  let placed = 0;
  for (const p of pool.filter(p => !used.has(p.tg_id) && p.photo)) {
    if (placed >= Math.max(0, room0 - 1)) break;   // keep one slot for the list
    used.add(p.tg_id);
    slides.push({ type: 'item', n: slides.length + 1, headline: p.headline,
      photo: p.photo, body: p.stand, source: p.source,
      stat: p.figures.length && p.figureCount < 4 ? p.figures[0].text.replace(/[−־]/g, '-') : null });
    placed++;
  }

  // 06 · list — everything left, balanced across pages, never chunked
  const rest = pool.filter(p => !used.has(p.tg_id));
  const room = cap - slides.length - (isCta ? 1 : 0);
  if (rest.length && room > 0) {
    const pages = Math.min(room, Math.ceil(rest.length / 3));
    const per = Math.ceil(rest.length / pages);
    for (let i = 0; i < pages; i++) {
      const rows = rest.slice(i * per, (i + 1) * per);
      if (!rows.length) break;
      slides.push({ type: 'list',
        title: i === 0 ? 'עוד מהחלון הזה' : 'עוד מהחלון הזה',
        rows: rows.map((p, j) => ({ n: i * per + j + 1, headline: p.headline, source: p.source })) });
    }
  }

  // 06 · telegram CTA — 23:00 deck only
  if (isCta) slides.push({ type: 'telegram', big: 'הבית של סוחרי NQ & ES',
    link: 't.me/nq_es_hunters',
    schedule: [
      { time: '08:00', label: 'סקירת בוקר' }, { time: '15:00', label: 'טרום־פתיחה' },
      { time: '18:00', label: 'סקירת פתיחה' }, { time: '23:00', label: 'סיכום יום' }] });

  // Instagram needs >=2 images for a carousel, and a one-slide deck
  // is a window that had nothing to say. 7% of windows land here.
  if (slides.length < 2) return { ...nothing('thin'), slides };

  return {
    key: w.key,
    window: `${hhmm(w.start)}–${hhmm(w.end - 1 + 1)}`,
    date: ddmmyy(w.start),
    stamp, quotes,
    slides: slides.slice(0, cap),
    caption: caption(parsed, w),
    consumed: all.map(p => p.tg_id),   // dropped duplicates are consumed too, or they resurface next window
    carry: nextCarry,
  };
}

/**
 * §07: "Slides carry headlines and figures. The reporting lives in
 * the caption, where it is searchable." So the caption is the full
 * text — emoji kept, unlike on the slides.
 */
export function caption(parsed, w) {
  const LIMIT = 2200;                       // Instagram's caption ceiling
  const foot = `\nעדכון ${hhmm(w.start)}–${hhmm(w.end)} · @marketalert.il`;
  const head = parsed[0].headline + '\n';

  // Whole stories, never a half one. Slicing at 2200 cut mid-word on
  // every busy window; dropping the tail story is the honest version.
  let body = '', dropped = 0;
  for (const p of parsed) {
    const block = [`▪ ${p.headline}`, ...p.reporting.map(clean),
      p.note ? `💡 ${p.note}` : null, p.source ? `מקור: ${p.source}` : null, '']
      .filter(Boolean).join('\n') + '\n';
    if (head.length + body.length + block.length + foot.length > LIMIT) { dropped++; continue; }
    body += block;
  }
  const more = dropped ? `(+${dropped} עדכונים בטלגרם)\n` : '';
  return head + body + more + foot;
}
