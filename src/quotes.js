// ─────────────────────────────────────────────────────────────
// quotes.js — the only thing in this pipeline that is not the channel.
//
// Everything else the agent publishes comes from one Telegram feed:
// what the channel said, when it said it. That is enough to report
// the news and not enough to say whether the news was RIGHT. A
// callback — "we posted this on Monday, here is what the market did
// by Wednesday" — needs an outcome, and an outcome needs a price.
//
// Two sources, both free and both keyless, because a key is a thing
// that expires quietly at 3am and takes the feature with it:
//   1. Yahoo's chart JSON — verified end to end against a real
//      network before this shipped: timestamps at the session open,
//      closes in indicators.quote[0].close.
//   2. Stooq's daily CSV — the fallback. Six columns, no auth, no
//      quota, and it knows indices Yahoo spells differently.
//
// Closes only. Intraday would let the account cherry-pick the minute
// that flattered it most, which is the one thing a "we called it"
// card must never be able to do.
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';

const UA = 'Mozilla/5.0 (compatible; market-agent/1.0)';
const TIMEOUT = Number(process.env.QUOTE_TIMEOUT_MS || 15000);

// Our canonical symbol -> each vendor's spelling. Kept explicit
// rather than derived: every vendor disagrees about indices, and a
// clever rule that turns ^SPX into ^SPX on Yahoo (where it is ^GSPC)
// fails silently by returning an empty series, which reads exactly
// like "the market did not move".
const VENDOR = {
  '^SPX': { stooq: '^spx', yahoo: '^GSPC' },
  '^NDX': { stooq: '^ndx', yahoo: '^NDX' },
  '^DJI': { stooq: '^dji', yahoo: '^DJI' },
  '^RUT': { stooq: '^rut', yahoo: '^RUT' },
  '^VIX': { stooq: '^vix', yahoo: '^VIX' },
  'BTCUSD': { stooq: 'btcusd', yahoo: 'BTC-USD' },
  'ETHUSD': { stooq: 'ethusd', yahoo: 'ETH-USD' },
  'XAUUSD': { stooq: 'xauusd', yahoo: 'GC=F' },
  'XAGUSD': { stooq: 'xagusd', yahoo: 'SI=F' },
  'CL.F':   { stooq: 'cl.f',   yahoo: 'CL=F' },
};
// A plain US ticker needs no table: NVDA is nvda.us to Stooq and
// NVDA to Yahoo, and that holds for every listed name.
const vendorOf = sym => VENDOR[sym]
  ?? { stooq: `${sym.toLowerCase()}.us`, yahoo: sym };

async function get(url, kind = 'text') {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`${res.status}`);
    return kind === 'json' ? await res.json() : await res.text();
  } finally { clearTimeout(t); }
}

/** Stooq: Date,Open,High,Low,Close,Volume — ascending, oldest first. */
async function fromStooq(sym) {
  const text = await get(`https://stooq.com/q/d/l/?s=${encodeURIComponent(vendorOf(sym).stooq)}&i=d`);
  const lines = text.trim().split('\n');
  // "No data" comes back as a 200 with a one-line body. A parser that
  // does not check for it returns [] and the caller reads that as a
  // market that never traded.
  if (lines.length < 2 || !/^Date,/i.test(lines[0])) throw new Error('stooq: no data');
  const out = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const close = Number(c[4]);
    if (c[0] && Number.isFinite(close) && close > 0) out.push({ d: c[0], c: close });
  }
  if (!out.length) throw new Error('stooq: empty series');
  return out;
}

/** Yahoo's chart endpoint, reduced to the same shape. */
async function fromYahoo(sym) {
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/`
    + `${encodeURIComponent(vendorOf(sym).yahoo)}?range=6mo&interval=1d`, 'json');
  const r = j?.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const cl = r?.indicators?.quote?.[0]?.close ?? [];
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const c = cl[i];
    if (Number.isFinite(c) && c > 0)
      out.push({ d: new Date(ts[i] * 1000).toISOString().slice(0, 10), c });
  }
  if (!out.length) throw new Error('yahoo: empty series');
  return out;
}

/**
 * Daily closes for one symbol, newest last. Never throws for a symbol
 * neither vendor knows — returns [] and says why, because one unknown
 * ticker must not take down the whole check.
 */
export async function closes(sym) {
  const errs = [];
  for (const src of [fromYahoo, fromStooq]) {
    try { return await src(sym); }
    catch (e) { errs.push(`${src.name}: ${e.message}`); }
  }
  const err = new Error(`no quotes for ${sym} (${errs.join('; ')})`);
  err.soft = true;
  throw err;
}
