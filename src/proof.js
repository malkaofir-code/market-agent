// ─────────────────────────────────────────────────────────────
// proof.js — what the account said, and what the market did.
//
// Moved verbatim out of the old compose.js in the Nov 2026 refactor:
// the callback board, the Thursday proof carousel ("צדקנו או טעינו?")
// with its honest N-of-M record, strongest hits and worst misses.
// ─────────────────────────────────────────────────────────────
import { budgeted } from './budget.js';
import { SERIES } from './day.js';
import { fmt, hhmm, ddmmyy, dmy, localDay } from './compose.js';
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
  const said = cut(claim.headline, 72);
  const sub = `${claim.asset} · ${sessions(Number(claim.days_after) || 1)} אחרי`;
  const type = variant ?? PROOF_VARIANTS[Number(claim.id ?? 0) % PROOF_VARIANTS.length];
  const path = Array.isArray(claim.path) ? claim.path : null;

  // The middle link. Without it the board says "we were right" and
  // stops, which is a coincidence told loudly; with it the board says
  // why we thought so, which is the only version worth publishing.
  // It is the channel's own interpretation line, never ours.
  const why = cut(claim.reason ?? '', 100) || null;

  const base = { palette, dir, figure, said, sub, type, path, why,
    fromPx: px(claim.base_px, claim.klass), toPx: px(claim.out_px, claim.klass),
    fromLabel: `לפני הפוסט · ${dayOf(claim.base_date)}`,
    toLabel: `אחרי · ${dayOf(claim.out_date)}`,
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
function composeCallbackRaw(claim, { palette = null, now = null, variant = null } = {}) {
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

/**
 * The record board's rows: the strongest hits and the worst misses.
 *
 * Ten hits and half as many misses, both ranked by size and neither
 * chosen by us: a hit by how far the market went our way, a miss by how
 * far it went against us. A board of only the best would be the same
 * lie as a count with no denominator.
 */
export function rankRecord(rows, { hits = 10, misses = 5 } = {}) {
  const isHit = r => ['hit', 'shown'].includes(r.status);
  const move = r => Number(r.move_pct) || 0;
  const wrong = r => (r.dir === 'up' ? -move(r) : move(r));   // how far against the call
  return {
    hits: dedupeCalls((rows ?? []).filter(isHit).sort((a, b) => Math.abs(move(b)) - Math.abs(move(a)))).slice(0, hits),
    misses: dedupeCalls((rows ?? []).filter(r => r.status === 'miss').sort((a, b) => wrong(b) - wrong(a))).slice(0, misses),
  };
}

/** The post that made a call, as it ran. */
export function originalSlide(claim) {
  return { type: 'proofOrig', palette: null, tag: 'המקור',
    eyebrow: `הפוסט המקורי · ${dmy(Number(claim.posted_at))}`,
    src: claim.src_url,
    caption: 'ככה זה פורסם, לפני התנועה.' };
}

/** One call per instrument, direction and market day. */
export function dedupeCalls(rows) {
  const seen = new Set();
  return (rows ?? []).filter(c => {
    const k = `${c.symbol}|${c.dir ?? ''}|${localDay(Number(c.posted_at))}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

/**
 * "49 out of 119", said plainly. `score` is { hit, miss }; a record
 * that only knows its hits cannot be written, so without `miss` the
 * caller gets null and falls back to wording that claims no rate.
 */
function ratio(score) {
  if (!score || typeof score.miss !== 'number') return null;
  const hit = Number(score.hit) || 0, tot = hit + score.miss;
  return tot ? { hit, tot, pct: Math.round(hit / tot * 100) } : null;
}

function composeCallbackPostRaw(hits, { now = null, score = null, recent = null, board = null } = {}) {
  const at = now ?? Math.floor(Date.now() / 1000);
  if (!hits?.length) return { skip: 'nothing proven' };

  // The grounds come from the archetype now — paper for the
  // receipts, the accent field for the verdict — so the cards only
  // have to alternate SHAPE, which they do by variant.
  // A call with its original post gets two boards: the post as it ran,
  // then what the market did. A claim is only as good as the proof that
  // it was made before the move, and that proof is the post itself.
  // An Instagram carousel holds ten, so the originals stop when the
  // cover, the record and the verdicts no longer leave room for them.
  const LIMIT = 10;
  const rowsOf = (list, title, ok) => {
    const out = [];
    for (let i = 0; i < list.length; i += 5) out.push({
      type: 'recordRows', palette: null, tag: 'השיא',
      eyebrow: list.length > 5 ? `${title} · ${i / 5 + 1} מתוך ${Math.ceil(list.length / 5)}` : title,
      title,
      items: list.slice(i, i + 5).map(h => ({
        asset: h.asset, when: dmy(Number(h.posted_at)),
        move: `${Number(h.move_pct) > 0 ? '+' : ''}${Number(h.move_pct).toFixed(1)}%`,
        dir: Number(h.move_pct) >= 0 ? 'up' : 'dn', ok,
        said: cut(h.headline, 48) })),
      note: ok ? 'מדורגות לפי גודל התנועה לכיוון שאמרנו.'
               : 'מדורגים לפי גודל התנועה נגד מה שאמרנו. אלה הפספוסים הגדולים, לא נבחרו.',
    });
    return out;
  };
  const extra = board ? [...rowsOf(board.hits, `${board.hits.length} הקריאות החזקות ביותר`, true),
    ...rowsOf(board.misses, `${board.misses.length} הפספוסים הגדולים`, false)] : [];
  let spare = LIMIT - 2 - extra.length - hits.length;
  const cards = hits.flatMap((h, i) => {
    const card = proofSlide(h, { palette: null, variant: PROOF_VARIANTS[i % PROOF_VARIANTS.length] });
    if (h.src_url && spare > 0) { spare--; return [originalSlide(h), card]; }
    return [card];
  });

  const n = hits.length;
  const cover = {
    type: 'coverProof', palette: null, tag: 'אומת',
    method: 'כל מספר נמדד ממחירי סגירה',
    eyebrow: `${SERIES.proof} · כל חמישי`,
    headline: 'אמרנו. וזה מה שקרה.',
    stand: `${n === 1 ? 'עדכון אחד' : `${n} עדכונים`} מהשבוע האחרון, `
         + 'והמספרים שהגיעו אחריהם.',
  };

  // The record board, and the only place the method is written down.
  // A hit rate with nothing under it is a number anybody can print, and
  // a hit COUNT with no denominator is worse: it is the same number
  // with the part that matters taken out. So the board says "N of M",
  // and its rows are the latest settled forecasts, misses included.
  const rt = ratio(score);
  const shown = board ? [] : dedupeCalls(recent?.length ? recent : hits).slice(0, 5);
  const items = shown.map(h => ({
    asset: h.asset,
    when: dmy(Number(h.posted_at)),
    move: `${Number(h.move_pct) > 0 ? '+' : ''}${Number(h.move_pct).toFixed(1)}%`,
    dir: Number(h.move_pct) >= 0 ? 'up' : 'dn',
    ok: rt ? ['hit', 'shown'].includes(h.status) : undefined,
  }));
  const hit30 = rt ? rt.hit : (score?.hit ?? n);
  const rec = {
    type: 'record', palette: null, tag: 'השיא', method: 'ללא בחירת תאריכים בדיעבד',
    eyebrow: rt ? 'תחזיות · 30 הימים האחרונים' : '30 הימים האחרונים',
    count: String(hit30),
    of: rt ? `מתוך ${rt.tot} תחזיות התממשו` : (hit30 === 1 ? 'עדכון שהשוק אישר' : 'עדכונים שהשוק אישר'),
    items,
    note: (rt ? 'כולל מה שלא התממש. ' : '')
        + 'נמדד ממחיר הסגירה שלפני הפוסט ועד הסגירה שאחריו, '
        + 'עד שלושה ימי מסחר. בלי בחירת תאריכים בדיעבד.',
  };

  const lines = hits.map(h =>
    `▪ ${dmy(Number(h.posted_at))} · ${h.asset} — ${h.headline ?? ''}\n`
    + `   ${Number(h.move_pct) > 0 ? '+' : ''}${Number(h.move_pct).toFixed(1)}% `
    + `תוך ${sessions(Number(h.days_after) || 1)}`).join('\n');
  const caption = `${SERIES.proof} | מה שאמרנו · ומה שקרה\n\n`
    + `${lines}\n\n`
    + (rt ? `הרשומה המלאה: ${rt.hit} מתוך ${rt.tot} תחזיות התממשו ב-30 הימים האחרונים (${rt.pct}%). `
          + 'השאר לא התממשו, והן נספרות.\n' : '')
    + (board ? `בשקפים האחרונים: ${board.hits.length} הקריאות החזקות ביותר, ו-${board.misses.length} הפספוסים הגדולים.\n` : '')
    + 'כל מספר כאן נמדד ממחיר הסגירה שלפני הפוסט ועד הסגירה שאחריו, '
    + 'עד שלושה ימי מסחר, בלי לבחור תאריכים בדיעבד.\n'
    + `\n💬 איזו תחזית שלנו הכי הפתיעה אתכם? כתבו בתגובות\n\n`
    + `עדכונים שוטפים · @marketalert.il\n`
    + '#שוקההון #מסחר #וולסטריט';

  return {
    key: `CP:${localDay(at)}T${hhmm(at)}`,
    window: `${dmy(Number(hits[hits.length - 1].posted_at))}\u2013${dmy(at)}`,
    date: ddmmyy(at),
    stamp: '', quotes: [],
    slides: [cover, ...cards, rec, ...extra],
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


export const composeCallback = (...a) => budgeted(composeCallbackRaw(...a));
export const composeCallbackPost = (...a) => budgeted(composeCallbackPostRaw(...a));
