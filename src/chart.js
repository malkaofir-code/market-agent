// ─────────────────────────────────────────────────────────────
// chart.js — the chart of the day, and the one sentence it proves.
//
// The rule taken from Chartr (the most-shared chart account there is):
// one chart, one insight, and the headline IS the insight. So the
// headline here is never written: it is COMPUTED from the closes on
// the chart, and every word of it can be checked against the line
// underneath — the change over the period, or the fact that the last
// close is the lowest / highest since a date the chart shows.
//
// Pure: closes in, a chart slide out. run.js fetches the closes.
// ─────────────────────────────────────────────────────────────

export const CHART_NAMES = { '^SPX': 'ה-S&P 500', '^NDX': 'הנאסד״ק 100', '^DJI': 'הדאו ג׳ונס',
  '^RUT': 'הראסל 2000', 'BTCUSD': 'הביטקוין', 'CL.F': 'הנפט', 'XAUUSD': 'הזהב' };

const dm = d => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const pct = (a, b) => (b - a) / a * 100;
const fmtPct = v => `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v).toFixed(1)}%`;
const fmtPx = v => v >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(2);

/**
 * { headline, sub, last, change, dir, points } for a series of daily
 * closes [{d:'YYYY-MM-DD', c}], oldest first, or null when there is
 * too little to say anything true (fewer than 20 sessions).
 */
export function insightOf(points, sym, { days = 63 } = {}) {
  const pts = (points ?? []).filter(p => p && Number.isFinite(Number(p.c)) && p.d).map(p => ({ d: String(p.d), c: Number(p.c) }));
  if (pts.length < 20) return null;
  const win = pts.slice(-days);
  const name = CHART_NAMES[sym] ?? sym;
  const first = win[0], last = win[win.length - 1];
  const change = pct(first.c, last.c);
  const prior = win.slice(0, -1);
  // "lowest/highest since": walk back from the last close until a close
  // beyond it; only said when that is at least 20 sessions back.
  const since = (better) => {
    for (let i = pts.length - 2; i >= 0; i--) if (better(pts[i].c, last.c)) return { at: i, d: pts[i].d };
    return { at: -1, d: null };
  };
  const lo = since((x, y) => x <= y), hi = since((x, y) => x >= y);
  const back = at => pts.length - 1 - at;
  let headline;
  if (last.c < Math.min(...prior.map(p => p.c)) && (lo.at < 0 || back(lo.at) >= 20))
    headline = lo.d ? `${name}: הסגירה הנמוכה מאז ${dm(lo.d)}` : `${name}: הסגירה הנמוכה ב-3 חודשים`;
  else if (last.c > Math.max(...prior.map(p => p.c)) && (hi.at < 0 || back(hi.at) >= 20))
    headline = hi.d ? `${name}: הסגירה הגבוהה מאז ${dm(hi.d)}` : `${name}: הסגירה הגבוהה ב-3 חודשים`;
  else {
    // How far from the period's peak (or off its low) — the number a
    // reader feels, when it is big enough to be the story.
    const peak = win.reduce((a, b) => (b.c > a.c ? b : a)), low = win.reduce((a, b) => (b.c < a.c ? b : a));
    const fromPeak = pct(peak.c, last.c), fromLow = pct(low.c, last.c);
    if (peak !== last && fromPeak <= -5) headline = `${name}: ${fmtPct(fromPeak)} מהשיא של ${dm(peak.d)}`;
    else if (low !== last && fromLow >= 5) headline = `${name}: ${fmtPct(fromLow)} מהשפל של ${dm(low.d)}`;
    else headline = `${name} ב-3 חודשים: ${fmtPct(change)}`;
  }
  return {
    headline, sym, name,
    sub: `סגירות יומיות · ${dm(first.d)}–${dm(last.d)}`,
    last: fmtPx(last.c), lastDate: dm(last.d), change: fmtPct(change), dir: change >= 0 ? 'up' : 'dn',
    points: win,
  };
}

/**
 * The line, as SVG path data inside a w×h box (time left to right even
 * on an RTL page — that is how every chart a reader has seen runs).
 */
export function pathOf(points, w, h, pad = 8) {
  const ys = points.map(p => p.c), lo = Math.min(...ys), hi = Math.max(...ys);
  const x = i => pad + (w - 2 * pad) * (points.length === 1 ? 1 : i / (points.length - 1));
  const y = v => pad + (h - 2 * pad) * (hi === lo ? 0.5 : 1 - (v - lo) / (hi - lo));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.c).toFixed(1)}`).join(' ');
  return { d, lo, hi, end: { x: x(points.length - 1), y: y(points.at(-1).c) },
    area: `${d} L${x(points.length - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z` };
}

/** Which instrument the day's chart should be: the one the day is about. */
export function chartSymbolFor(text) {
  const t = String(text ?? '');
  const n = t.search(/נאסד/), s = t.search(/S&P/);
  if (n >= 0 && (s < 0 || n < s)) return '^NDX';
  return '^SPX';
}
