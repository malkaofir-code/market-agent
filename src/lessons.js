// ─────────────────────────────────────────────────────────────
// lessons.js — the one thing a reader takes away.
//
// The digest used to be ten slides carrying seven stories and one
// sentence of meaning. Every fact was right and nobody could say, a
// minute later, what they had learned. A feed of facts is a utility;
// a reader who understands something is a reader who comes back.
//
// So every post now teaches ONE mechanism — why the thing that
// happened matters — in plain Hebrew, as three steps a person could
// repeat to a friend: this happens → so this follows → and this is
// who feels it.
//
// These are written by hand, once, and never by a model. That is the
// whole point of the file. A lesson is a general truth about how
// markets work ("when yields rise, a safe return competes with
// stocks"), not a claim about tomorrow, and a sentence like that is
// only worth publishing if somebody checked it. A model asked to
// explain the news would explain it confidently and sometimes wrongly,
// and a wrong lesson is worse than none: it is what the reader
// remembers.
//
// Rules every entry keeps:
//   · a mechanism, never a prediction and never advice
//   · no numbers — a lesson has to be true on any day
//   · words a non-trader knows; the jargon is named and then explained
//   · three steps, each short enough to read in one glance
//
// Matched on the story's own words. ORDER MATTERS: the specific
// lessons sit above the general ones, because a story about bond
// yields also mentions the Fed, and the yields lesson is the one it
// actually needs.
// ─────────────────────────────────────────────────────────────

// A Hebrew word, as a whole word. JavaScript's \b only knows ASCII, so
// around Hebrew letters it never fires — "דוח\b" matches nothing at
// all, and a bare "דוח" also matches "דוחה" (rejects). This allows the
// one-letter prefixes Hebrew glues on (ה, ב, ל, מ, ו, ש, כ) and then
// insists the word actually ends.
const W = (...words) => new RegExp(
  `(?:^|[^א-ת])(?:[הבלמושכ]{0,2})(?:${words.join('|')})(?=[^א-ת]|$)`);

export const LESSONS = [
  {
    id: 'breadth',
    match: /רוחב|קו העלייה.?ירידה|מובילות צרה|מעט מניות|שבע המופלאות|Magnificent/i,
    title: 'כשרק כמה מניות מושכות את כל השוק',
    steps: [
      'המדד עולה — אבל רוב המניות שבו לא',
      'כל העלייה נשענת על קבוצה קטנה של ענקיות',
      'אם הקבוצה הזאת נעצרת, אין מי שיחזיק את המדד',
    ],
    takeaway: 'מדד שעולה הוא לא תמיד שוק בריא. בודקים כמה מניות באמת משתתפות.',
  },
  {
    id: 'earnings',
    match: new RegExp(W('דוח','דוחות').source + '|רבעון|רווח למניה|EPS|guidance|הנחיה', 'i'),
    title: 'למה מניה יורדת גם אחרי דוח טוב',
    steps: [
      'המשקיעים כבר ציפו לתוצאות טובות',
      'המחיר "גילם" את הציפייה עוד לפני הדוח',
      'מה שמזיז את המניה הוא התחזית קדימה, לא מה שכבר קרה',
    ],
    takeaway: 'בעונת דוחות השוק מסתכל על הרבעון הבא, לא על הקודם.',
  },
  {
    id: 'yields',
    match: /תשוא(?:ה|ות)|אג"?ח|אגרות חוב|10 שנים|Treasury/i,
    title: 'מה זה תשואת אג״ח, ולמה זה משנה למניות',
    steps: [
      'משקיעים מוכרים אג״ח של ממשלת ארה״ב',
      'המחיר שלהן יורד — והתשואה שהן נותנות עולה',
      'כסף "בטוח" נהיה אטרקטיבי יותר, ומניות צריכות להתאמץ יותר',
    ],
    takeaway: 'תשואות עולות הן מתחרה חזק יותר למניות, במיוחד למניות צמיחה.',
  },
  {
    id: 'oil',
    match: /נפט|ברנט|WTI|אופ"?ק|OPEC|חביות|הורמוז|דלק/i,
    title: 'איך מחיר הנפט מגיע לכיס של כולם',
    steps: [
      'מחיר הנפט עולה',
      'דלק, הובלה וייצור מתייקרים — כמעט לכל מוצר',
      'האינפלציה מקבלת דחיפה, והבנק המרכזי נשאר קשוח',
    ],
    takeaway: 'נפט יקר לא נשאר בתחנת הדלק — בסוף הוא מגיע לריבית.',
  },
  {
    id: 'crypto',
    match: /ביטקוין|קריפטו|את'?ריום|BTC|ETH|קוינבייס|Coinbase/i,
    title: 'למה הביטקוין זז יחד עם מניות הטכנולוגיה',
    steps: [
      'כשמשקיעים מוכנים לסיכון — הם קונים גם טכנולוגיה וגם קריפטו',
      'כשהם חוששים — הם מוכרים את שניהם',
      'לכן ביטקוין מגיב לריבית כמו מניית צמיחה',
    ],
    takeaway: 'היום קריפטו מתנהג כמו נכס סיכון, לא כמו מקלט בטוח.',
  },
  {
    id: 'gold',
    match: /זהב|Gold|XAU/i,
    title: 'למה משקיעים בורחים לזהב',
    steps: [
      'יש אי־ודאות, או חשש שהכסף יאבד מערכו',
      'משקיעים מחפשים נכס שלא תלוי בשום ממשלה',
      'הזהב מתחזק — במיוחד כשהריבית, אחרי אינפלציה, יורדת',
    ],
    takeaway: 'זהב עולה כשהאמון בכסף ובריבית נשחק.',
  },
  {
    id: 'vix',
    match: /VIX|תנודתיות|מדד הפחד/i,
    title: 'מה בעצם מודד "מדד הפחד"',
    steps: [
      'משקיעים קונים ביטוח מפני ירידות בשוק',
      'כשהביקוש לביטוח עולה, הוא מתייקר — וה־VIX עולה',
      'VIX גבוה אומר שוק עצבני, עם תנודות חדות לשני הכיוונים',
    ],
    takeaway: 'ה־VIX לא אומר לאן השוק ילך — רק כמה חזק הוא צפוי לזוז.',
  },
  {
    id: 'ai',
    match: /\bAI\b|בינה מלאכותית|שבבים|אנבידיה|Nvidia|מרכזי נתונים/i,
    title: 'מה באמת מניע את מניות ה־AI',
    steps: [
      'חברות הענק מוציאות מיליארדים על מרכזי נתונים',
      'יצרניות השבבים הן הספקיות של ההשקעה הזאת',
      'כל רמז לקיצוץ בתקציבים — פוגע בהן ראשונות',
    ],
    takeaway: 'מניות ה־AI תלויות בכמה הענקיות ממשיכות להשקיע.',
  },
  {
    id: 'trade',
    match: new RegExp(W('מכס','מכסים','סחר','סין','יבוא','יצוא').source + "|שי ג'?ינפינג|הנשיא שי", 'i'),
    title: 'למה מתיחות סחר מזיזה את השוק',
    steps: [
      'מוטל מכס, או מוגבל סחר בין מדינות',
      'העלויות עולות ושרשראות האספקה משתבשות',
      'חברות שמייצרות או מוכרות בחו״ל מרגישות את זה ראשונות',
    ],
    takeaway: 'רגיעה בסחר מורידה סיכון. מתיחות מעלה אותו.',
  },
  {
    id: 'dollar',
    match: /הדולר|מדד הדולר|DXY/i,
    title: 'מה דולר חזק עושה לחברות אמריקאיות',
    steps: [
      'הדולר מתחזק מול שאר המטבעות',
      'הכנסות שהחברות מרוויחות בחו״ל שוות פחות דולרים',
      'חברות גלובליות רואות את זה בדוחות שלהן',
    ],
    takeaway: 'דולר חזק הוא רוח נגדית לחברות שמוכרות בכל העולם.',
  },
  {
    id: 'data',
    match: /אבטלה|משרות|CPI|PCE|מדד המחירים|תוצר|GDP|קמעונאות|יום נתונים|נתוני (?:מאקרו|תעסוקה|אינפלציה)/i,
    title: 'למה נתון כלכלי "טוב" יכול להפיל את השוק',
    steps: [
      'נתון חזק אומר שהכלכלה חמה',
      'כלכלה חמה נותנת לבנק המרכזי פחות סיבה להוריד ריבית',
      'ריבית גבוהה לאורך זמן לוחצת על המניות',
    ],
    takeaway: 'חדשות טובות לכלכלה הן לא תמיד חדשות טובות לשוק.',
  },
  {
    id: 'fed',
    match: /הפד|הפדרל|ריבית|פאוול|FOMC|ניצי|הידוק|אינפלציה/i,
    title: 'למה הריבית מזיזה את כל השוק',
    steps: [
      'הבנק המרכזי שומר על ריבית גבוהה, או מתעכב בהורדה',
      'הלוואות מתייקרות, וחיסכון בטוח משתלם יותר',
      'מניות צמיחה וטכנולוגיה מרגישות את זה ראשונות',
    ],
    takeaway: 'כשהפד מדבר על אינפלציה — השוק מתמחר ריבית גבוהה לזמן ארוך יותר.',
  },
];

/**
 * The lesson a story teaches, or null.
 *
 * Read from the 💡 line first, because that is where the channel says
 * what the story is ABOUT, then from the headline and body. A story
 * about Williams warning on inflation mentions "jobs" in passing; its
 * meaning line talks about rates, and rates is the lesson it needs.
 */
export function lessonFor(story) {
  const fields = [story?.note, story?.headline, story?.stand, story?.text]
    .map(x => String(x ?? '')).filter(Boolean);
  for (const f of fields)
    for (const l of LESSONS) if (l.match.test(f)) return l;
  return null;
}
