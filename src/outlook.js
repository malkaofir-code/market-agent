// ─────────────────────────────────────────────────────────────
// outlook.js — what the news in this window points at, and how fast.
//
// One board: "מה עשוי לעלות, ומה עשוי לרדת". Every row on it comes
// from one of exactly two places, and the board says which:
//
//   מהדיווח        the channel itself said it: a forecast sentence that
//                  claims.js reads as one instrument + one direction.
//                  These are the same claims the callback scores, so
//                  the account can later show whether they came true.
//
//   ההערכה שלנו    a fixed, hand-written mechanism applied to something
//                  the window reports: yields at a record → growth
//                  stocks under pressure. The mechanism is general and
//                  checked once, here; only the TRIGGER comes from the
//                  news. No model writes these, for the reason
//                  lessons.js gives.
//
// Nothing is invented to fill the board. A window with no forecast and
// no clear driver gets no outlook board at all — an empty prediction
// slide is worse than none, and a padded one is worse than that.
//
// "How fast" is a range, never a date: ימים / שבועות / חודשים. A
// forecast takes it from its own words when it has them ("בטווח
// הקצר"), and otherwise the three trading days the callback grades it
// on. A mechanism carries its own: a bond move reaches tech stocks in
// days; a strong dollar reaches earnings reports in months.
// ─────────────────────────────────────────────────────────────
import { claimsFrom } from './claims.js';

export const SPEED = {
  fast: { label: 'תוך ימים', dots: 3 },
  mid:  { label: 'תוך שבועות', dots: 2 },
  slow: { label: 'תוך חודשים', dots: 1 },
};

const flat = s => String(s ?? '').replace(/["'׳״’“”]/g, '');

/** The time frame a sentence gives itself, if it gives one. */
export function speedOf(text, fallback = 'fast') {
  const f = flat(text);
  if (/בטווח (?:ה)?ארוך|בשנים הקרובות|לאורך זמן|עד (?:סוף )?20\d\d/.test(f)) return 'slow';
  if (/בחודשים הקרובים|ברבעון הבא|בשבועות הקרובים|בטווח הבינוני/.test(f)) return 'mid';
  if (/בטווח (?:ה)?קצר|בימים הקרובים|השבוע|מחר|מיידי/.test(f)) return 'fast';
  return fallback;
}

// The mechanisms. Each names the DRIVER it reads (a word, found in one
// clause of the news) and what follows in each direction. Same rules
// as a lesson: no figures, words a non-trader knows, and only effects
// that point the same way on any ordinary day.
const DRIVERS = [
  {
    id: 'yields', word: /^(?:ה|ו|ב|ל|מ|ש)*תשוא(?:ה|ות|ת)$/,
    up: {
      dn: [{ name: 'מניות טכנולוגיה וצמיחה', why: 'ריבית בטוחה גבוהה מתחרה בהן', speed: 'fast' }],
    },
    dn: {
      up: [{ name: 'מניות טכנולוגיה וצמיחה', why: 'המתחרה הבטוח שלהן נחלש', speed: 'fast' }],
    },
  },
  {
    id: 'oil', sym: 'CL.F', word: /^(?:ה|ו|ב|ל|מ|ש)*(?:נפט|ברנט)$|^WTI$/,
    up: {
      up: [{ name: 'חברות אנרגיה', why: 'מרוויחות יותר על כל חבית', speed: 'fast' }],
      dn: [{ name: 'תעופה ותחבורה', why: 'הדלק הוא ההוצאה הגדולה שלהן', speed: 'fast' }],
    },
    dn: {
      up: [{ name: 'תעופה ותחבורה', why: 'הדלק, ההוצאה הגדולה שלהן, מתייקר פחות', speed: 'fast' }],
      dn: [{ name: 'חברות אנרגיה', why: 'פחות הכנסה על כל חבית', speed: 'fast' }],
    },
  },
  {
    id: 'dollar', word: /^(?:ו|ב|ל|מ|ש)*הדולר$|^DXY$/,
    up: {
      dn: [{ name: 'חברות שמוכרות בחו״ל', why: 'ההכנסות מחו״ל שוות פחות דולרים', speed: 'slow' }],
    },
    dn: {
      up: [{ name: 'חברות שמוכרות בחו״ל', why: 'ההכנסות מחו״ל שוות יותר דולרים', speed: 'slow' }],
    },
  },
];

// A driver's direction is read off the words AROUND it, not the whole
// sentence. Whole sentences got it wrong in every way there is:
//   "אחזקות זרות באג״ח ירדו"            holdings fell — not yields
//   "יבוא הנפט מוונצואלה מזנק"           import VOLUME jumped — not price
//   "הין נחלש מול הדולר"                 the yen fell, so the dollar ROSE
//   "ירידה בביקוש … לתשואות גבוהות יותר" two directions, one sentence
// So: the move word must sit within a few words of the driver, a
// driver after "מול" is the other side of a pair and is skipped, and a
// driver named as a quantity (imports, flow, supply) is not a price.
const MOVE_UP = /^(?:ה|ו|ב|ל|מ|ש)*(?:עול(?:ה|ות|ים)?|עלו|עלתה|עלייה|עליית|זינוק|זינקה|זינק|מזנק(?:ת|ות|ים)?|קפיצ(?:ה|ת)|קופצ(?:ת|ות)|טיפס(?:ה|ו)?|מטפס(?:ת|ות)?|מתחזק(?:ת|ים)?|התחזק(?:ה|ות)?|שיא)$/;
const MOVE_DN = /^(?:ה|ו|ב|ל|מ|ש)*(?:יורד(?:ת|ות|ים)?|ירד(?:ה|ו)?|ירידה|ירידת|צניחה|צונח(?:ת|ות|ים)?|צנח(?:ה|ו)?|נופל(?:ת|ות|ים)?|נפל(?:ה|ו)?|נחלש(?:ת|ים)?|היחלשות|נסוג(?:ה|ות|ים)?)$/;
const NOT_PRICE = /^(?:ה|ו|ב|ל|מ|ש)*(?:יבוא|יצוא|ייצור|הפקת|תפוקת|זרימת|מלאי|מלאי|ביקוש|היצע|מכלית|אחזקות|שכירת|מול|לעומת)$/;
const words = t => flat(t).replace(/[‏‎]/g, '').split(/[\s,;:.!?()—–•|]+/).filter(Boolean);

/** Which way one message says a driver moved: 'up', 'dn' or ''. */
function readDriver(text, d) {
  // When the 💡 line talks about the driver, it is the only line that
  // counts: "הנפט ירד חמישה ימים ברציפות" is the past, and the meaning
  // line under it ("…עשויה להעלות פרמיית סיכון בנפט") is the channel
  // saying that past is about to stop mattering.
  const lines = String(text ?? '').split('\n');
  const note = lines.find(l => /💡/u.test(l) && words(l).some(t => d.word.test(t)));
  const seen = new Set();
  for (const line of (note ?? lines.join('\n')).split(/[\n,;:—–•|]/)) {
    const w = words(line);
    w.forEach((tok, i) => {
      if (!d.word.test(tok)) return;
      if (w.slice(Math.max(0, i - 2), i).some(x => NOT_PRICE.test(x))) return;
      const near = [...w.slice(Math.max(0, i - 2), i), ...w.slice(i + 1, i + 4)];
      const up = near.some(x => MOVE_UP.test(x)), dn = near.some(x => MOVE_DN.test(x));
      if (up !== dn) seen.add(up ? 'up' : 'dn');
    });
  }
  return seen.size === 1 ? [...seen][0] : '';
}

/** Which way the window says a driver moved, or '' if unclear or mixed. */
function driverDir(rows, d, calls) {
  // When the channel made a forecast about the driver itself, that is
  // the direction — it is a sentence written to say exactly this.
  const said = new Set(calls.filter(c => c.symbol === d.sym).map(c => c.dir));
  if (said.size) return said.size === 1 ? [...said][0] : '';
  const seen = new Set(rows.map(r => readDriver(r.text, d)).filter(Boolean));
  return seen.size === 1 ? [...seen][0] : '';
}

// The row name for a forecast claim. claims.js names the instrument;
// on this board a reader wants the thing itself.
const NAME = { '^SPX': 'השוק האמריקאי (S&P 500)', '^NDX': 'נאסד״ק', '^DJI': 'דאו ג׳ונס',
  '^RUT': 'המניות הקטנות (ראסל)', 'CL.F': 'נפט', 'XAUUSD': 'זהב', 'XAGUSD': 'כסף',
  'BTCUSD': 'ביטקוין', 'ETHUSD': 'את׳ריום' };

// The line under a forecast row: the channel's own 💡 reason when it is
// short enough for one glance, else the headline without its byline
// ("🗣️ Bluekurtic: …" — the speaker is a credit, not the news).
function whyOf(c) {
  const r = String(c.reason ?? '').replace(/^\s*💡\s*(?:משמעות\s*:\s*)?/u, '').trim();
  if (r && r.length <= 100) return r;
  return String(c.headline ?? '').replace(/^[\s\p{Extended_Pictographic}\uFE0F\u200F]+/u, '')
    .replace(/^[^:א-ת]{2,40}:\s+/u, '').trim();
}

/**
 * The outlook for a window of raw rows: { up: [...], dn: [...] }, or
 * null when there is nothing honest to put on the board.
 *
 * Each row: { name, why, speed, basis: 'report' | 'ours', symbol? }.
 */
export const _readDriver = (text, id) => readDriver(text, DRIVERS.find(d => d.id === id));

export function outlookFor(rows, { perSide = 2, total = 4 } = {}) {
  const out = [];
  const add = r => {
    // The same thing called both ways in one window is no call at all.
    const clash = out.find(x => x.name === r.name && x.dir !== r.dir);
    if (clash) { clash.dead = true; return; }
    if (!out.some(x => x.name === r.name)) out.push(r);
  };

  // 1 · what the channel itself forecast
  const calls = rows.flatMap(row => claimsFrom(row)).filter(c => c.kind === 'forecast');
  for (const c of calls) {
    const name = NAME[c.symbol] ?? c.asset;
    add({ name, dir: c.dir, why: whyOf(c), speed: speedOf(c.quote),
      basis: 'report', symbol: c.symbol, tg_id: c.tg_id });
  }
  // 2 · the mechanisms the window's drivers set off
  for (const d of DRIVERS) {
    const dir = driverDir(rows, d, calls);
    if (!dir) continue;
    for (const side of ['up', 'dn'])
      for (const e of d[dir][side] ?? [])
        add({ ...e, dir: side, basis: 'ours', driver: d.id });
  }

  const live = out.filter(x => !x.dead);
  // The channel's own calls first, then ours; each side capped so the
  // board stays one glance.
  const pick = side => live.filter(x => x.dir === side)
    .sort((a, b) => (a.basis === 'report' ? 0 : 1) - (b.basis === 'report' ? 0 : 1))
    .slice(0, perSide);
  let up = pick('up'), dn = pick('dn');
  while (up.length + dn.length > total) (up.length >= dn.length ? up : dn).pop();
  if (!up.length && !dn.length) return null;
  return { up, dn };
}

/** One caption line, or ''. */
export function outlookLine(o) {
  if (!o) return '';
  const names = xs => xs.map(x => x.name).join(', ');
  const parts = [];
  if (o.up.length) parts.push(`עשוי לעלות: ${names(o.up)}`);
  if (o.dn.length) parts.push(`עשוי לרדת: ${names(o.dn)}`);
  return `🧭 ${parts.join(' · ')} (הערכה, לא המלצה)`;
}
