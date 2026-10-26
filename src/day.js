// ─────────────────────────────────────────────────────────────
// day.js — the day, in the reader's money and in Ron's voice.
//
// Two lines nobody else in Hebrew prints, and both are about the
// reader rather than the market:
//
//   YOUR MONEY  "₪10,000 בקרן על ה-S&P 500: ‎+₪100 היום (בערך)".
//               Pure arithmetic on the index move the channel itself
//               quoted on the tape. It is an illustration of what a
//               percentage MEANS, not a statement about anyone's
//               account: it says "בערך", it ignores the shekel/dollar
//               rate and fees, and it says so.
//
//   RON         one line of mood, chosen by how big the day was. It
//               is a character reacting, never advice: no line here
//               tells anyone to buy, sell, hold or wait. Hand-written,
//               for the same reason lessons are: a model writing
//               market commentary is how an opinion becomes a claim.
// ─────────────────────────────────────────────────────────────

// Which tape row is "the market". The index itself first, then its
// future; the Nasdaq only when the S&P is not on the tape at all.
const INDEX = [
  { sym: 'SPX', name: 'S&P 500', fund: 'בקרן על ה-S&P 500' },
  { sym: 'ES',  name: 'S&P 500', fund: 'בקרן על ה-S&P 500' },
  { sym: 'NDX', name: 'נאסד״ק 100', fund: 'בקרן על הנאסד״ק 100' },
  { sym: 'NQ',  name: 'נאסד״ק 100', fund: 'בקרן על הנאסד״ק 100' },
];

export const STAKE = Number(process.env.MONEY_STAKE || 10000);

const pct = v => Number(String(v ?? '').replace(/[−־]/g, '-').replace('%', '').replace(',', '.'));

/** The day's index move off the tape: { name, fund, chg } or null. */
export function marketMove(quotes) {
  for (const ix of INDEX) {
    const q = (quotes ?? []).find(x => x.sym === ix.sym);
    const v = pct(q?.chg);
    // Same plausibility rule as the tape: a daily index move past 6%
    // is a parsing accident far more often than it is a crash.
    if (q && Number.isFinite(v) && Math.abs(v) <= 6) return { ...ix, chg: v };
  }
  return null;
}

// Each amount is wrapped in a left-to-right isolate (LRI…PDI): inside a
// Hebrew line the bidi algorithm otherwise moves the sign and the ₪ to
// the wrong side of the number, and "-₪137" printed as "137₪-".
const LRI = '\u2066', PDI = '\u2069';
const shekels = n => `${LRI}₪${Math.abs(Math.round(n)).toLocaleString('en-US')}${PDI}`;

/**
 * "₪10,000 בקרן על ה-S&P 500: ‎+₪100 היום" — or null when the tape
 * has no index move to compute from. Never invented.
 */
export function moneyLine(move, stake = STAKE) {
  if (!move) return null;
  const delta = stake * move.chg / 100;
  if (Math.abs(delta) < 1) return `${shekels(stake)} ${move.fund}: כמעט בלי שינוי היום`;
  const sign = delta > 0 ? '+' : '-';
  const amt = `${LRI}${sign}₪${Math.abs(Math.round(delta)).toLocaleString('en-US')}${PDI}`;
  return `${shekels(stake)} ${move.fund}: ${amt} היום`;
}

export const MONEY_NOTE = 'בערך, בלי שער הדולר ועמלות. המחשה, לא ייעוץ.';

// ── Ron ──────────────────────────────────────────────────────
// Five moods, several lines each, rotated by the window so the same
// line does not sit under a week of posts. Every line is a feeling or
// a fact about markets in general — none of them is an instruction.
const MOODS = {
  bigUp: [
    'יום ירוק מאוד. נהנים, בלי להתלהב יותר מדי.',
    'ימים כאלה הם הסיבה שאנשים מחזיקים לאורך זמן.',
    'וואו. גם ימים כאלה עוברים, לשני הכיוונים.',
  ],
  up: [
    'יום טוב בשוק. לא דרמה, פשוט טוב.',
    'ירוק שקט. ככה נראה רוב הזמן יום טוב.',
    'עוד יום קטן למעלה. מצטבר.',
  ],
  flat: [
    'יום שקט. גם שקט זה מידע.',
    'השוק עצר לנשום היום.',
    'כמעט בלי תזוזה. יש ימים כאלה.',
  ],
  down: [
    'קצת אדום היום. זה קורה הרבה, וזה בסדר.',
    'ירידה קטנה. השוק לא עולה כל יום.',
    'יום אדום קטן. חלק מהדרך.',
  ],
  bigDown: [
    'יום אדום. ירידות כאלה הן חלק מהשוק, לא סוף העולם.',
    'יום קשה. כדאי לזכור שגם ירידות כאלה קרו בעבר.',
    'אדום חזק היום. נושמים, ומבינים מה קרה.',
  ],
  none: [
    'הנה מה שחשוב היום.',
    'בואו נבין מה קרה.',
  ],
};

export function moodOf(move) {
  if (!move) return 'none';
  const v = move.chg;
  if (v >= 1.5) return 'bigUp';
  if (v >= 0.3) return 'up';
  if (v > -0.3) return 'flat';
  if (v > -1.5) return 'down';
  return 'bigDown';
}

/** "רון: יום שקט. גם שקט זה מידע." */
export function ronLine(move, seed = 0) {
  const lines = MOODS[moodOf(move)];
  return `רון: ${lines[Math.abs(Math.floor(seed)) % lines.length]}`;
}

/**
 * The same line as parts, for a board: the two amounts are set as
 * left-to-right islands by the builder (the board's bidi pass strips
 * control characters, so the isolates above only survive in captions).
 */
export function moneyParts(move, stake = STAKE) {
  if (!move) return null;
  const delta = stake * move.chg / 100;
  const n = v => `₪${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
  return { stake: n(stake), fund: move.fund,
    amount: Math.abs(delta) < 1 ? null : `${delta > 0 ? '+' : '-'}${n(delta)}` };
}

/** Both lines for a deck, or null when there is nothing to say. */
export function dayOf(quotes, seed = 0) {
  if (process.env.DAY_LINES === '0') return null;
  const move = marketMove(quotes);
  return { money: moneyLine(move), parts: moneyParts(move), note: move ? MONEY_NOTE : null,
    ron: ronLine(move, seed), mood: moodOf(move) };
}

// ── the weekly franchises ────────────────────────────────────
// Fixed names in fixed slots: a series is something people wait for,
// a stream is something they scroll past.
export const SERIES = {
  digest: 'השוק בערב',
  scoreboard: 'הציון השבועי',
  analysts: 'המלצות האנליסטים',
  proof: 'צדקנו או טעינו?',
};
export const SCHEDULE = '📅 כל ערב ב-21:00: השוק בערב · שני: הציון השבועי · רביעי: המלצות האנליסטים · חמישי: צדקנו או טעינו?';
