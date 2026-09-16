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
   [['XAUUSD', 'up']]],
];
let bad = 0;
for (const [name, text, want] of T) {
  const got = claimsFrom({ tg_id: 1, ts: 1, text }).map(c => [c.symbol, c.dir]);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(40)} -> ${JSON.stringify(got)}`);
}
process.exit(bad ? 1 : 0);
