import { claimsFrom } from '../src/claims.js';
const T = [
  ['the bank is the SOURCE, not the subject',
   `קופר קומפניז צונחת 13% אחרי הדוח
במקביל ירדה התחזית קדימה, ולפי בנק אוף אמריקה החברה עלולה להמשיך לרדת.`,
   []],
  ['a diary headline files nothing',
   `מה על השולחן מחר
הסנאט מצביע על חוק CLARITY. קוינבייס עלולה לרדת בחדות אם ההצבעה תיכשל.`,
   []],
  ['a weekday agenda files nothing',
   `יום שלישי, 15 בספטמבר: היום הראשון של ישיבת הפד
העיניים על הנפט, שצפוי לעלות בחדות לקראת ההחלטה.`,
   []],
  ['a real claim still files',
   `אנליסטים: הזהב עשוי להמשיך לעלות לשיא חדש
💡 משמעות: תשואות ריאליות יורדות והבנקים המרכזיים ממשיכים לקנות.`,
   [['XAUUSD', 'up', 'forecast']]],

  // ── the four that reached a proof film ───────────────────────
  // Each of these was published as a call we never made. They are
  // here by their real text, not a paraphrase.
  ['collapsing demand is not a bullish call on oil',
   `הביקוש העולמי לנפט צונח: סוכנות האנרגיה חתכה את תחזית 2026 ב-940 אלף חביות ליום
💡 משמעות: הרס ביקוש בקצב כזה בדרך כלל מקדים האטה, וזה צפוי להימשך.`,
   [['CL.F', 'dn', 'forecast']]],
  ['a stock up 9% is never a bearish CALL — at most a watch that it rose',
   `קוינבייס מזנקת 9% אחרי שדרוג
COIN עולה כ-9% בעקבות שדרוג, כשהמדדים הראשיים נסחרים בירידה וההצבעה צפויה מחר.`,
   [['COIN', 'up', 'watch']]],
  ['a denial files nothing',
   `SK Hynix מכחישה: אין הסכם סופי מול אינטל על שבבי זיכרון בארה"ב
החברה אומרת שהיא בוחנת אפשרויות לחיזוק התחרותיות, אבל שום מבנה עסקה לא נסגר בפועל.`,
   []],
  ['a risk premium going UP is not a bearish call on the commodity',
   `בית הנבחרים האמריקאי אישר חוק סנקציות נגד רוסיה ואיראן
הסנקציות מכוונות גם נגד קונים של נפט רוסי ואיראני, מה שמעלה את הסיכון לפרמיית סיכון גבוהה.`,
   []],

  // ── the two that would have reached the outlook board ────────
  ['an analyst QUOTED in the body is not the subject (FSLY, not BAC)',
   `FSLY קופצת 15.8% במחזור פי 3.6 מהממוצע

Fastly מזנקת היום על רקע דיווחים שהיא מכוונת להכנסות של עד 1.3 מיליארד דולר עד 2029 בזכות גידול בתנועת AI, לפי MarketBeat.
בנק אוף אמריקה כותב שהרחבת פלטפורמת ה-edge משמעותית, אבל ההזדמנות ב-AI עדיין לא ודאית.`,
   []],
  ['"Wall Street retreats" is not a bullish S&P watch',
   `📊 סיכום המסחר: וול סטריט נסוגה, תשואות ה-10 שנים בשיא מאז 2007
📉 S&P 500 -0.75%, נאסד"ק -1.13%, קפיצה בתשואות מכבידה.`,
   []],
];
let bad = 0;
for (const [name, text, want] of T) {
  const got = claimsFrom({ tg_id: 1, ts: 1, text }).map(c => [c.symbol, c.dir, c.kind]);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(40)} -> ${JSON.stringify(got)}`);
}
process.exit(bad ? 1 : 0);
