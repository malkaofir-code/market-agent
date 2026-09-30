// ─────────────────────────────────────────────────────────────
// glossary.js — the one word on a board a beginner does not know.
//
// The channel writes for traders: "PCE", "תשואות", "רכישה עצמית",
// "ממוצע נע". Every one of those is a wall for someone who opened
// Instagram and not a terminal. Rewriting the news in simpler words
// needs a model, and a model rewriting market news is how a fact
// quietly changes. So nothing is rewritten. The board keeps the
// channel's sentence and adds one plain line under it: what the word
// means.
//
// Hand-written, once. Same rules as a lesson: a definition, never a
// view; true on any day; words a non-trader already has. Each term is
// explained once per deck, on the first board it appears on.
//
// ORDER MATTERS: longer, more specific terms first, so "מדד המחירים
// לצרכן" wins over "מדד" and "תשואת האג״ח" over "אג״ח".
// ─────────────────────────────────────────────────────────────

const flat = s => String(s ?? '').replace(/["'׳״’“”]/g, '');
// A Hebrew term as a whole word, with the one- and two-letter
// prefixes Hebrew glues on. \b does not work around Hebrew letters.
const H = (...w) => new RegExp(`(?:^|[^א-ת])(?:[הבלמושכ]{0,2})(?:${w.join('|')})(?=[^א-ת]|$)`);

export const TERMS = [
  { term: 'PCE', match: /\bPCE\b/, says: 'מדד האינפלציה שהפד הכי סומך עליו' },
  { term: 'CPI', match: /\bCPI\b|מדד המחירים לצרכן/, says: 'כמה המחירים עלו לצרכנים' },
  { term: 'תוצר', match: /\bGDP\b|תמג|(?:^|[^א-ת])(?:ה|ב|ל)?תוצר(?=[^א-ת]|$)/, says: 'כמה הכלכלה כולה צמחה' },
  { term: 'מדד מנהלי הרכש', match: /מנהלי הרכש|\bPMI\b/, says: 'סקר בקרב מפעלים וחברות. מעל 50 = צמיחה, מתחת = האטה' },
  { term: 'תשואת אג״ח', match: /תשוא(?:ה|ות|ת)/, says: 'הריבית שהממשלה משלמת כשהיא לווה כסף. כשהיא עולה, הלוואות מתייקרות' },
  { term: 'אג״ח', match: H('אגח', 'אגרות חוב', 'איגרות חוב'), says: 'הלוואה שמשקיעים נותנים לממשלה או לחברה' },
  { basic: true, term: 'הפד', match: /\bFOMC\b|\bFed\b|(?:^|[^א-ת])(?:ו|ב|ל|מ|ש)?הפד(?:רלי)?(?=[^א-ת]|$)/, says: 'הבנק המרכזי של ארה״ב, שקובע את הריבית' },
  { term: 'רכישה עצמית', match: /רכישה עצמית|רכישה חוזרת|\bbuyback\b|לרכוש בחזרה/i, says: 'חברה שקונה בחזרה את המניות של עצמה מהשוק' },
  { basic: true, term: 'דוח רבעוני', match: H('דוח רבעוני', 'דוחות', 'הדוח הרבעוני', 'דוח'), says: 'התוצאות שחברה מפרסמת כל שלושה חודשים' },
  { term: 'רווח למניה', match: /רווח למניה|\bEPS\b/, says: 'הרווח של החברה, מחולק למספר המניות' },
  { term: 'ממוצע נע', match: /ממוצע (?:ה)?נע|הממוצע הנע/, says: 'המחיר הממוצע בתקופה האחרונה. עוזר לראות את המגמה' },
  { term: 'רוחב השוק', match: /רוחב|קו העלייה.?ירידה/, says: 'כמה מניות באמת עולות, לא רק המדד' },
  { term: 'מדד הפחד', match: /\bVIX\b|מדד הפחד|תנודתיות/, says: 'כמה תנודות המשקיעים מצפים לראות בשוק' },
  { term: 'חוזים עתידיים', match: /(?:^|[^א-ת])(?:ו|ה|ב)?חוזי(?:ם)?(?: ה)?(?:נאסדק|S&P|דאו|הנפט|הזהב|עתידיים)/, says: 'מסחר על מחיר המדד לפני שהבורסה נפתחת. רמז לאיך תיפתח' },
  { term: 'אפטר מרקט', match: /אפטר|מסחר (?:ה)?מאוחר|אחרי הסגירה/, says: 'מסחר שממשיך אחרי שהבורסה נסגרת' },
  { term: 'מחזור מסחר', match: /מחזור(?: מסחר)?(?: גבוה)? פי|במחזור/, says: 'כמה מניות החליפו ידיים. מחזור גבוה = הרבה עניין' },
  { term: 'מינוף', match: H('מינוף', 'ממונף', 'ממונפת'), says: 'השקעה בכסף שהוא בעצם הלוואה. מגדיל את הרווח, וגם את ההפסד' },
  { term: 'דילול', match: H('דילול', 'מדלל', 'מדללת'), says: 'הנפקת מניות חדשות, שמקטינה את החלק של כל בעל מניה' },
  { basic: true, term: 'S&P 500', match: /S&P ?500|\bSPX\b|GSPC/, says: 'מדד של 500 החברות הגדולות בארה״ב' },
  { basic: true, term: 'נאסד״ק', match: H('נאסדק') , says: 'מדד שרובו חברות טכנולוגיה' },
  { basic: true, term: 'ראסל 2000', match: H('ראסל'), says: 'מדד של החברות הקטנות בארה״ב' },
  { term: 'מיתון', match: H('מיתון'), says: 'תקופה שבה הכלכלה מתכווצת' },
  { basic: true, term: 'אינפלציה', match: H('אינפלציה', 'אינפלציית', 'אינפלציוני'), says: 'הקצב שבו המחירים עולים' },
  { basic: true, term: 'מכסים', match: H('מכס', 'מכסים'), says: 'מס על סחורה שמגיעה מחו״ל' },
  { term: 'קרן סל', match: /\bETF\b|קרן סל|קרן הסל|קרן .{0,12}הסחירה/, says: 'קרן שעוקבת אחרי מדד או נכס ונסחרת כמו מניה' },
  { term: 'שורי / דובי', match: H('שורי', 'שורית', 'דובי', 'דובית'), says: 'שורי = מצפה לעליות. דובי = מצפה לירידות' },
  { basic: true, term: 'סנקציות', match: H('סנקציות'), says: 'הגבלות כלכליות שמדינה מטילה על מדינה אחרת' },
];

/**
 * Terms a text uses, in the order the text uses them, skipping any in
 * `seen` (already explained on an earlier board). Adds what it returns
 * to `seen`, so a deck explains each word once.
 */
export function glossFor(text, { max = 1, seen = new Set() } = {}) {
  const f = flat(text);
  const found = [];
  for (const t of TERMS) {
    if (seen.has(t.term)) continue;
    const m = t.match.exec(f);
    if (m) found.push({ at: m.index, t });
  }
  // The technical word first: on a board that says "S&P 500" and
  // "ממוצע נע", the index is the one a newcomer has at least heard of.
  const out = found.sort((a, b) => (a.t.basic ? 1 : 0) - (b.t.basic ? 1 : 0) || a.at - b.at)
    .slice(0, max).map(x => x.t);
  for (const t of out) seen.add(t.term);
  return out.map(({ term, says }) => ({ term, says }));
}
