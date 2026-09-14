// ─────────────────────────────────────────────────────────────
// callback.js — did the market agree with us?
//
// The account has published hundreds of boards and never once said
// what became of any of them. This closes that loop: every claim a
// published post made is checked against daily closes, and the ones
// the market confirmed become a card.
//
// Three rules keep it honest, and they are the whole file:
//
//   1. The baseline is the last close BEFORE we posted. Anything
//      else lets the account take credit for a move that had already
//      happened when it opened its mouth.
//   2. Closes only, never intraday. An intraday reader can always
//      find the minute that flatters it.
//   3. A claim gets a fixed number of sessions and then it is a miss.
//      A window that stays open until it is right is not a forecast,
//      it is a horoscope.
// ─────────────────────────────────────────────────────────────
import { MOVE, MOVE_WATCH } from './claims.js';
import { closes } from './quotes.js';
import { openClaims, putPrices, closesFor, setClaimOutcome } from './db.js';

/** The market's calendar day for an instant — New York, not Israel. */
export const etDate = ts => new Intl.DateTimeFormat('en-CA',
  { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date(ts * 1000));

const threshold = c => (c.kind === 'forecast' ? MOVE : MOVE_WATCH)[c.klass] ?? 3;

/**
 * One claim against one price series.
 *
 * Returns the verdict and, when there is one, the session that
 * settled it. Pure — no network, no database — so the rule that
 * decides what this account brags about is testable on paper.
 */
export function scoreClaim(claim, series) {
  const on = etDate(Number(claim.posted_at));
  const asc = [...series].sort((a, b) => a.d < b.d ? -1 : 1);
  const base = [...asc].reverse().find(p => p.d < on);
  if (!base) return { status: 'nodata' };

  const after = asc.filter(p => p.d >= on).slice(0, Number(claim.horizon) || 3);
  const need = threshold(claim);
  const want = claim.dir ?? null;          // null: a follow-up, either way

  for (const [i, p] of after.entries()) {
    const move = (p.c - base.c) / base.c * 100;
    const dir = move >= 0 ? 'up' : 'dn';
    if (want && dir !== want) continue;
    if (Math.abs(move) < need) continue;
    return { status: 'hit', base_px: base.c, base_date: base.d,
      out_px: p.c, out_date: p.d, move_pct: Number(move.toFixed(2)), days_after: i + 1,
      // Every close from the one before we published through the one
      // that settled it — the board draws this rather than asserting it.
      path: [base, ...after.slice(0, i + 1)] };
  }

  // Out of sessions. The last one on the board is the honest final
  // number even when it is a miss — the scoreboard needs it.
  if (after.length >= (Number(claim.horizon) || 3)) {
    const last = after[after.length - 1];
    const move = (last.c - base.c) / base.c * 100;
    return { status: 'miss', base_px: base.c, base_date: base.d,
      out_px: last.c, out_date: last.d, move_pct: Number(move.toFixed(2)),
      days_after: after.length, path: [base, ...after] };
  }
  return { status: 'open', base_px: base.c, base_date: base.d };
}

/**
 * Every open claim, checked. One price fetch per instrument no matter
 * how many claims point at it.
 */
export async function checkAll(say = console.log) {
  const claims = await openClaims();
  if (!claims.length) return { checked: 0, hits: 0, misses: 0 };

  const symbols = [...new Set(claims.map(c => c.symbol))];
  for (const sym of symbols) {
    try {
      const series = await closes(sym);
      // Only the tail is worth storing: a claim reaches back days, not
      // years, and the table is a cache rather than an archive.
      await putPrices(sym, series.slice(-40));
    } catch (e) {
      say(`  quotes ${sym} — ${e.message}`);
    }
  }

  let hits = 0, misses = 0, open = 0;
  for (const c of claims) {
    const from = new Date((Number(c.posted_at) - 10 * 86400) * 1000).toISOString().slice(0, 10);
    const series = await closesFor(c.symbol, from);
    const v = scoreClaim(c, series);
    if (v.status === 'open') { open++; continue; }
    if (v.status === 'nodata') continue;
    await setClaimOutcome(c.id, v);
    if (v.status === 'hit') { hits++; say(`  HIT ${c.symbol} ${v.move_pct}% in ${v.days_after} session(s) — ${c.headline?.slice(0, 50)}`); }
    else misses++;
  }
  return { checked: claims.length, hits, misses, open };
}
