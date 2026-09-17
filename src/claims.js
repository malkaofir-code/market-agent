// ─────────────────────────────────────────────────────────────
// claims.js — the forward-looking half of a news message.
//
// Most of what the channel writes is a REPORT: this happened, that
// closed down 2%. A report cannot be right or wrong later — it is
// already the outcome. What can be checked is the other kind of
// sentence, the one that says something is EXPECTED to happen:
// "הפד צפוי להשאיר את הריבית", "אנליסטים מזהירים מלחץ על הבנקים".
//
// This finds those sentences, and for each one answers three
// questions: which instrument, which direction, and how long the
// claim gets before the market has had its say. Everything else in
// the file exists to keep it from answering when it is not sure —
// a callback card built on a claim the message never made is worse
// than no callback at all.
// ─────────────────────────────────────────────────────────────
import { clean } from './rtl.js';

// Quotes and geresh are written five ways in this channel
// (נאסד"ק · נאסד״ק · נאסדק), so every match runs against a
// quote-stripped copy and every pattern below is written without them.
const flat = s => String(s ?? '').replace(/["'׳״’“”]/g, '');
// Hebrew glues its prepositions onto the noun: ה, ו, ל, ב, מ, ש, כ.
const PRE = '(?:[והלבמשכ]{0,2})';
const he = name => new RegExp(`(?:^|[^א-ת\\w])${PRE}${name}`);

// klass drives two things: how big a move has to be to count, and how
// long the claim gets. An index that moves 3% has had an event; a
// single stock that moves 3% has had a Tuesday.
export const ASSETS = [
  // ── indices ──
  { sym: '^NDX', he: 'נאסדק', klass: 'index', pat: [he('נאסדק'), /\bnasdaq\b/i, /\bNDX\b/] },
  { sym: '^SPX', he: 'S&P 500', klass: 'index', pat: [he('אס אנד פי'), /\bS&P\b/i, /\bSPX\b/, he('מדד 500')] },
  { sym: '^DJI', he: 'דאו ג’ונס', klass: 'index', pat: [he('דאו'), /\bdow\b/i] },
  { sym: '^RUT', he: 'ראסל 2000', klass: 'index', pat: [he('ראסל'), /\brussell\b/i] },
  { sym: '^VIX', he: 'מדד הפחד', klass: 'index', pat: [he('מדד הפחד'), /\bVIX\b/i] },
  // ── crypto ──
  { sym: 'BTCUSD', he: 'ביטקוין', klass: 'crypto', pat: [he('ביטקוין'), /\bbitcoin\b/i, /\bBTC\b/] },
  { sym: 'ETHUSD', he: 'את’ריום', klass: 'crypto', pat: [he('אתריום'), he('איתריום'), /\bethereum\b/i, /\bETH\b/] },
  // ── commodities ──
  { sym: 'XAUUSD', he: 'זהב', klass: 'commodity', pat: [he('זהב'), /\bgold\b/i] },
  { sym: 'XAGUSD', he: 'כסף', klass: 'commodity', pat: [he('הכסף'), /\bsilver\b/i] },
  { sym: 'CL.F', he: 'נפט', klass: 'commodity', pat: [he('נפט'), /\boil\b/i, /\bbrent\b/i] },
  // ── single names ──
  { sym: 'NVDA', he: 'אנבידיה', klass: 'stock', pat: [he('אנבידיה'), he('אנוידיה'), /\bnvidia\b/i, /\bNVDA\b/] },
  { sym: 'AAPL', he: 'אפל', klass: 'stock', pat: [he('אפל'), /\bapple\b/i, /\bAAPL\b/] },
  { sym: 'TSLA', he: 'טסלה', klass: 'stock', pat: [he('טסלה'), /\btesla\b/i, /\bTSLA\b/] },
  { sym: 'MSFT', he: 'מיקרוסופט', klass: 'stock', pat: [he('מיקרוסופט'), /\bmicrosoft\b/i, /\bMSFT\b/] },
  { sym: 'AMZN', he: 'אמזון', klass: 'stock', pat: [he('אמזון'), /\bamazon\b/i, /\bAMZN\b/] },
  { sym: 'GOOGL', he: 'גוגל', klass: 'stock', pat: [he('גוגל'), he('אלפבית'), /\balphabet\b/i, /\bGOOGL?\b/] },
  { sym: 'META', he: 'מטא', klass: 'stock', pat: [he('מטא'), /\bmeta\b/i, /\bMETA\b/] },
  { sym: 'JPM', he: 'ג’יי פי מורגן', klass: 'stock', pat: [he('גיי פי מורגן'), he('גייפי מורגן'), /\bjp ?morgan\b/i, /\bJPM\b/] },
  { sym: 'GS', he: 'גולדמן זאקס', klass: 'stock', pat: [he('גולדמן'), /\bgoldman\b/i] },
  { sym: 'BAC', he: 'בנק אוף אמריקה', klass: 'stock', pat: [he('בנק אוף אמריקה'), /\bbank of america\b/i] },
  { sym: 'MS', he: 'מורגן סטנלי', klass: 'stock', pat: [he('מורגן סטנלי'), /\bmorgan stanley\b/i] },
  { sym: 'INTC', he: 'אינטל', klass: 'stock', pat: [he('אינטל'), /\bintel\b/i, /\bINTC\b/] },
  { sym: 'AMD', he: 'AMD', klass: 'stock', pat: [/\bAMD\b/, he('איי אם די')] },
  { sym: 'AVGO', he: 'ברודקום', klass: 'stock', pat: [he('ברודקום'), /\bbroadcom\b/i, /\bAVGO\b/] },
  { sym: 'MU', he: 'מיקרון', klass: 'stock', pat: [he('מיקרון'), /\bmicron\b/i, /\bMU\b/] },
  { sym: 'TSM', he: 'TSMC', klass: 'stock', pat: [/\bTSMC?\b/, he('טיוואן סמיקונדקטור')] },
  { sym: 'ARM', he: 'ARM', klass: 'stock', pat: [/\bARM Holdings\b/i] },
  { sym: 'SMCI', he: 'סופר מיקרו', klass: 'stock', pat: [he('סופר מיקרו'), /\bsupermicro\b/i, /\bSMCI\b/] },
  { sym: 'ORCL', he: 'אורקל', klass: 'stock', pat: [he('אורקל'), /\boracle\b/i, /\bORCL\b/] },
  { sym: 'PLTR', he: 'פלנטיר', klass: 'stock', pat: [he('פלנטיר'), /\bpalantir\b/i, /\bPLTR\b/] },
  { sym: 'COIN', he: 'קוינבייס', klass: 'stock', pat: [he('קוינבייס'), /\bcoinbase\b/i, /\bCOIN\b/] },
  { sym: 'MSTR', he: 'סטרטג’י', klass: 'stock', pat: [he('מיקרוסטרטגי'), /\bmicrostrategy\b/i, /\bMSTR\b/] },
  { sym: 'NFLX', he: 'נטפליקס', klass: 'stock', pat: [he('נטפליקס'), /\bnetflix\b/i, /\bNFLX\b/] },
  { sym: 'BA', he: 'בואינג', klass: 'stock', pat: [he('בואינג'), /\bboeing\b/i] },
  { sym: 'WMT', he: 'וולמארט', klass: 'stock', pat: [he('וולמארט'), /\bwalmart\b/i, /\bWMT\b/] },
  { sym: 'LLY', he: 'אלי לילי', klass: 'stock', pat: [he('אלי לילי'), /\beli lilly\b/i, /\bLLY\b/] },
  { sym: 'PFE', he: 'פייזר', klass: 'stock', pat: [he('פייזר'), /\bpfizer\b/i, /\bPFE\b/] },
  { sym: 'XOM', he: 'אקסון', klass: 'stock', pat: [he('אקסון'), /\bexxon\b/i, /\bXOM\b/] },
  { sym: 'CVX', he: 'שברון', klass: 'stock', pat: [he('שברון'), /\bchevron\b/i, /\bCVX\b/] },
  { sym: 'DIS', he: 'דיסני', klass: 'stock', pat: [he('דיסני'), /\bdisney\b/i] },
  { sym: 'UBER', he: 'אובר', klass: 'stock', pat: [he('אובר'), /\buber\b/i, /\bUBER\b/] },
  { sym: 'F', he: 'פורד', klass: 'stock', pat: [he('פורד'), /\bford\b/i] },
  { sym: 'V', he: 'ויזה', klass: 'stock', pat: [he('ויזה'), /\bvisa\b/i] },
  { sym: 'MA', he: 'מאסטרקארד', klass: 'stock', pat: [he('מאסטרקארד'), /\bmastercard\b/i] },
  { sym: 'PYPL', he: 'פייפאל', klass: 'stock', pat: [he('פייפאל'), /\bpaypal\b/i, /\bPYPL\b/] },
];

// "The market", named without naming an instrument. Only these words
// promote a sentence with no ticker in it to a claim, and only ever
// onto the S&P — the index everyone means by "the market".
const MARKET = [he('השוק'), he('שוקי המניות'), he('וול סטריט'), he('המדדים'),
                he('הבורסה'), he('המניות'), /\bwall street\b/i];

// A sentence that is about something that has not happened yet.
// Deliberately narrow: every word here has to be unambiguously
// forward-looking on its own, because a report mistaken for a
// forecast becomes a card claiming we predicted yesterday.
const FORWARD = [
  'צפוי', 'צפויה', 'צפויים', 'צפויות', 'עשוי', 'עשויה', 'עשויים',
  'עלול', 'עלולה', 'עלולים', 'אמור', 'אמורה', 'אמורים',
  'תחזית', 'תחזיות', 'מעריכים', 'הערכות', 'מזהיר', 'מזהירה', 'מזהירים',
  'אזהרה', 'חשש', 'חוששים', 'סיכון', 'צופה', 'צופים', 'מצפים', 'ציפיות',
  'יוביל', 'תוביל', 'ישפיע', 'תשפיע', 'ילחץ', 'תלחץ', 'יתמוך', 'תתמוך',
  'יעד מחיר', 'מחיר יעד', 'המלצה', 'לקראת', 'ערב', 'בדרך ל', 'עלול להוביל',
  'אם ', 'ככל ש', 'עומד ל', 'עומדת ל', 'יכריז', 'תכריז', 'יפרסם', 'תפרסם',
].map(w => he(flat(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

// Direction, for forecast sentences. parse.js's lists are written for
// what already moved ("ירד 2%"); these are the words a forecast uses.
const UP = [
  'יעלה','תעלה','יעלו','לעלות','עלייה','זינוק','לזנק','ראלי','שיא','התאוששות',
  'יתמוך','תתמוך','חיובי','חיובית','אופטימי','שורי','יתחזק','תתחזק','להתחזק',
  'הקלה','הורדת ריבית',
  // Present tense. These are here so that a sentence REPORTING a rise
  // trips both lists and the reader refuses, not so that reporting is
  // read as forecasting — see the note on directionOf.
  'מזנק','מזנקת','מזנקים','זינק','זינקה','קופץ','קופצת','מרקיע','ממריא',
  'עולה','עולות','מתחזק','מתחזקת',
].map(w => he(flat(w)));
const DOWN = [
  'ירידה','ירידות','ירד','תרד','ירדו','לרדת','צניחה','לצנוח','התרסקות','לקרוס',
  'ילחץ','תלחץ','לחץ','שלילי','שלילית','פסימי','דובי','ייחלש','תיחלש','להיחלש',
  'הפסד','הפסדים','חשש','חששות','מיתון','העלאת ריבית','מכסים','פיטורים',
  'תיקון','בועה','מכירות מסיביות','אינפלציה גבוהה',
  // The same present tense, on this side. Their absence is what let
  // "הביקוש העולמי לנפט צונח" be read as bullish: צניחה was listed
  // and צונח was not, so the only word either list matched was
  // ביקוש — which used to sit in UP.
  'צונח','צונחת','צונחים','צולל','צוללת','קורס','קורסת','מתרסק','מתרסקת',
  'נחתך','נחתכה','חתך','חתכה','מתכווץ','נחלש','נחלשת','נופל','נופלת',
  'מאבד','מאבדת',
].map(w => he(flat(w)));

const hits = (pats, text) => pats.some(p => p.test(text));

// Analyst language, where the direction lives in a fixed phrase and
// the individual words point the wrong way. "אזהרת רווח" is a profit
// WARNING — the word רווח in it is the opposite of bullish, and a
// word-level reader gets it backwards every time.
const PHRASE_DN = ['אזהרת רווח', 'הורדת דירוג', 'הורידו את ההמלצה', 'המלצת מכירה',
  'הורדת מחיר יעד', 'הורידו את מחיר היעד', 'מכירות מסיביות', 'גל מכירות']
  .map(w => he(flat(w)));
const PHRASE_UP = ['העלאת מחיר יעד', 'העלו את מחיר היעד', 'המלצת קנייה', 'שדרוג הדירוג',
  'העלאת דירוג', 'העלו את ההמלצה']
  .map(w => he(flat(w)));

// An asset that is SPEAKING is not the asset being forecast. "גולדמן
// זאקס: הזהב עשוי לעלות" is a claim about gold; a reader that takes
// every name in the sentence produced a second claim saying Goldman's
// own stock would rise, which the message never said.
const SAYS = /^\s*(?:מזהיר|מזהירה|מזהירים|צופה|צופים|מעריך|מעריכה|מעריכים|ממליץ|ממליצה|אמר|אמרה|אומר|טוען|טוענת|מפרסם|מפרסמת|חוזה|מודיע|מעדכן|העלה את|הוריד את|העלתה את|הורידה את)/;
// "לפי X" / "על פי X" — the same role, marked in front instead.
const CITED = /(?:לפי|על פי|מקור)\s*$/;

// A DENIAL is not a forecast, and a denial headline is the worst line
// there is to quote over a number. "SK Hynix מכחישה: אין הסכם סופי מול
// אינטל" was filed as a bullish call on Intel, and when Intel then rose
// 13% the proof film said we had called it — off a headline announcing
// that the deal did not exist. The sentence is skipped and, like a
// diary line, a denial in the HEADLINE disqualifies the whole message,
// because the headline is what the card shows.
const DENIAL = [
  'מכחיש','מכחישה','מכחישים','הכחיש','הכחישה','מפריך','מפריכה',
  'אין הסכם','אין עסקה','אין אישור','לא נסגר','לא נסגרה','לא סוכם',
  'לא אושר','לא אושרה','טרם סוכם','טרם נחתם','נדחה','נדחתה',
  'בוטל','בוטלה','שולל','שוללת',
].map(w => he(flat(w)));

// What a sentence calls the thing it already named: "אנבידיה צפויה
// לפרסם דוחות … המניה תעלה". The direction is in the second sentence
// and the name is only in the first, so a reader that will not carry
// a pronoun finds a claim in neither.
const PRONOUN = [he('המניה'), he('המדד'), he('החברה'), he('הנייר'), he('המטבע'), he('הסחורה')];

/** Every asset named in a sentence, minus the ones doing the talking. */
function assetsIn(sentence) {
  const f = flat(sentence);
  const colon = f.indexOf(':');
  const found = [];
  for (const a of ASSETS) {
    let at = -1, from = -1;
    for (const p of a.pat) {
      const m = p.exec(f);
      if (m) { from = m.index; at = m.index + m[0].length; break; }
    }
    if (at < 0) continue;
    if (SAYS.test(f.slice(at, at + 26))) continue;                     // "X מזהיר ש…"
    // BEFORE THE NAME STARTS, not before it ends.
    //
    // This read the thirty characters ending at the END of the match,
    // which of course end with the name itself, so the "לפי X" guard
    // never fired once. It filed a claim that Bank of America's stock
    // would fall off a sentence reading "…ולפי בנק אוף אמריקה החברה
    // לא הצליחה למכור" — a line in which the bank is the source and
    // the subject is somebody else entirely. The board would have
    // quoted a headline about Cooper Companies over Bank of America's
    // price, which is not a near miss; it is a different company.
    if (CITED.test(f.slice(Math.max(0, from - 30), from))) continue;    // "לפי X…"
    found.push({ a, at });
  }
  // A name in front of the colon, with another instrument behind it,
  // is attribution: "גולדמן זאקס: הזהב עשוי לעלות" is a claim about
  // gold. With nothing behind the colon it is a topic line —
  // "טסלה: המניה עלולה לצנוח" — and the name is the subject after all.
  const keep = colon > 0 && found.some(x => x.at > colon)
    ? found.filter(x => x.at > colon) : found;
  return keep.map(x => x.a);
}

/**
 * Which way the sentence says the instrument goes — or nothing.
 *
 * Two rules keep this honest, and both were learned the hard way.
 *
 * ONE WORD IS NOT A POLARITY. ביקוש used to mean "up" and סיכון used
 * to mean "down", and neither survives contact with a real sentence:
 * "הביקוש העולמי לנפט צונח" is demand COLLAPSING, and sanctions that
 * raise a risk premium push a commodity UP. Both are gone. A word
 * earns a place on these lists only if it points the same way in
 * every sentence it can appear in.
 *
 * BOTH LISTS FIRING IS AN ANSWER. It returns nothing, and that is the
 * point: "COIN עולה כ-9% … ביום שבו המדדים נסחרים בירידה" names a
 * rise and a fall in one breath, and the fall belongs to the indices,
 * not to COIN. Before the present tense was listed on both sides only
 * בירידה matched, and the message was filed as a bearish call on a
 * stock it had just said was up 9%. A reader that refuses is worth
 * more than one that guesses.
 */
function directionOf(sentence) {
  const f = flat(sentence);
  if (hits(PHRASE_DN, f)) return 'dn';
  if (hits(PHRASE_UP, f)) return 'up';
  const up = hits(UP, f), dn = hits(DOWN, f);
  if (up && !dn) return 'up';
  if (dn && !up) return 'dn';
  return '';                      // both, or neither — never a guess
}

/** How far a claim of this kind is allowed to reach, in trading days. */
export const HORIZON = { index: 3, stock: 3, crypto: 3, commodity: 3 };
/**
 * How big the move has to be before it is worth a card.
 *
 * These are the numbers that decide whether the account looks sharp
 * or looks like it is claiming credit for noise. An index closing
 * 0.9% lower is a day the market noticed; a single stock needs 3%
 * before anyone would call it a move at all.
 */
export const MOVE = { index: 0.9, stock: 3.0, crypto: 3.0, commodity: 2.0 };
/**
 * A follow-up is held to a higher bar than a forecast.
 *
 * A forecast that came true is interesting at any size — we said it
 * and it happened. A follow-up claims nothing, so it has to earn the
 * card on the size of the move alone: "we covered this stock on
 * Monday and it is down 1% since" is not a post, it is a shrug.
 */
export const MOVE_WATCH = { index: 1.8, stock: 5.0, crypto: 5.0, commodity: 3.5 };

/**
 * The line that says WHY.
 *
 * "We said it and it happened" is a coincidence until the board can
 * also show the reasoning, and this channel writes that line itself:
 * every interpretive message ends with 💡 משמעות. It is the single
 * most valuable sentence in the message for this format, because it
 * is the only one that explains rather than reports. Falling back to
 * the forecast sentence keeps a board possible when there is no note.
 */
const NOTE = /^\s*(?:💡)?\s*משמעות\s*:\s*/;
export function reasonIn(text, fallback = '') {
  for (const l of String(text ?? '').split('\n').map(clean)) {
    if (NOTE.test(l)) return l.replace(NOTE, '').trim().slice(0, 240);
  }
  return String(fallback ?? '').trim().slice(0, 240);
}

/** Split into sentences a claim can be read off. Newlines count. */
function sentences(text) {
  return String(text ?? '').split('\n').map(clean).filter(Boolean)
    .flatMap(l => l.split(/(?<=[.!?])\s+/))
    .map(s => s.trim()).filter(s => s.length > 8);
}

// A snapshot post is the tape, not a story: "החוזים נצמדים לשפל",
// "תמונה טכנית". Following one up two days later would produce a card
// about a message that was never about anything.
const SNAPSHOT = [he('החוזים'), he('תמונה טכנית'), he('סיכום מסחר'), he('פתיחת המסחר'),
  he('נעילה'), he('המסחר באסיה'), he('אסיה מעורבת'), he('סיכום שבועי')];

/**
 * A diary is not a claim.
 *
 * "מה על השולחן מחר", "יום שלישי, 15 בספטמבר: היום הראשון של ישיבת
 * הפד" — these are agendas. The body underneath often does carry a
 * real forecast, and the extractor is right to read it, but the
 * HEADLINE is the line a proof board quotes back as the thing we
 * said, and quoting a calendar entry beside a price move makes the
 * account look like it is claiming credit for a Tuesday.
 */
const DIARY = [he('מה על השולחן'), he('מה קורה היום'), he('היום בשוק'),
  he('לוח השבוע'), he('השבוע בשוק'), he('מה צפוי היום'), he('סדר היום'),
  /^יום (ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)[ ,]/];

/**
 * What the message is ABOUT, when it forecasts nothing.
 *
 * Most of what the channel writes is reporting, and a pipeline that
 * only files forecasts would file about one claim a week. But a
 * follow-up does not need a prediction to be worth publishing: we
 * covered Micron on Monday, Micron is down 7% since — that is a true
 * sentence, it is ours, and it is the same card. The direction here
 * is the direction of the NEWS, not of a claim, so a card built on it
 * says "the fall continued", never "we said it would".
 */
export function subjectFrom(row) {
  const ss = sentences(row.text);
  const headline = ss[0] ?? '';
  if (!headline || hits(SNAPSHOT, flat(headline)) || hits(DIARY, flat(headline))) return null;

  let named = assetsIn(headline);
  // A headline with no instrument, but a body that names exactly one,
  // is still about that one: "איגודי העובדים בטייוואן…" under an MU tag.
  if (!named.length) {
    const body = assetsIn(ss.slice(1, 3).join(' '));
    if (body.length === 1) named = body;
  }
  if (!named.length && hits(MARKET, flat(headline)))
    named = [ASSETS.find(a => a.sym === '^SPX')];
  if (named.length !== 1) return null;      // two subjects is no subject

  const a = named[0];
  const dir = directionOf(headline) || directionOf(ss.slice(0, 3).join(' ')) || null;
  // No direction, no follow-up. A watch card reads "the fall
  // continued" or "the rise continued"; with nothing in that slot
  // there is no sentence to write, and the claim still goes into the
  // pool the proof film draws from. One such claim (CL.F, dir null)
  // scored a 3.57% "hit" it could never have described.
  if (!dir) return null;
  return {
    symbol: a.sym, asset: a.he, klass: a.klass, dir,
    kind: 'watch', horizon: HORIZON[a.klass] ?? 3,
    headline, quote: (ss[1] ?? headline).slice(0, 300),
    reason: reasonIn(row.text, ss[1] ?? ''),
    tg_id: Number(row.tg_id), msg_ts: Number(row.ts ?? 0),
  };
}

/**
 * Every checkable claim one message makes.
 *
 * A claim is the smallest honest unit: one instrument, one direction,
 * one sentence that can be quoted back beside the outcome. Messages
 * that only report are expected to return [] — that is the normal
 * case, not a failure.
 */
export function claimsFrom(row) {
  const text = String(row.text ?? '');
  const headline = sentences(text)[0] ?? '';
  const out = new Map();

  let carried = null;              // the last instrument this message named
  const head = sentences(text)[0] ?? '';
  // The headline is what a proof board quotes. If it is an agenda,
  // nothing in this message can be published as a claim of ours —
  // the forecast in the body may be perfectly real, but there is no
  // honest line to put on the card above the number.
  if (hits(DIARY, flat(head))) return [];
  if (hits(DENIAL, flat(head))) return [];
  for (const s of sentences(text)) {
    const here = assetsIn(s);
    if (here.length === 1) carried = here[0];
    if (!hits(FORWARD, flat(s))) continue;
    if (hits(DENIAL, flat(s))) continue;
    const dir = directionOf(s);
    if (!dir) continue;

    let named = here;
    // "המניה תעלה" — the name is in the sentence before it.
    if (!named.length && carried && hits(PRONOUN, flat(s))) named = [carried];
    // A forecast about "the market" with no instrument named is a
    // forecast about the S&P. A forecast with neither is not a claim
    // this file knows how to check, and is dropped.
    if (!named.length && hits(MARKET, flat(s)))
      named = [ASSETS.find(a => a.sym === '^SPX')];
    if (!named.length) continue;
    // Six assets in one sentence is a list, not a claim about each.
    if (named.length > 2) continue;

    for (const a of named) {
      const k = `${a.sym}:${dir}`;
      if (out.has(k)) continue;
      out.set(k, {
        symbol: a.sym, asset: a.he, klass: a.klass, dir,
        kind: 'forecast', horizon: HORIZON[a.klass] ?? 3,
        headline, quote: s.slice(0, 300), reason: reasonIn(text, s),
        tg_id: Number(row.tg_id), msg_ts: Number(row.ts ?? 0),
      });
    }
  }
  // A message that forecast nothing is still about something. One
  // follow-up per message, and never for an instrument the message
  // already made a real claim about.
  if (!out.size) {
    const w = subjectFrom(row);
    if (w) out.set(`${w.symbol}:watch`, w);
  }
  return [...out.values()];
}
