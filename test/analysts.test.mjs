// Analyst moves: attributed to a named firm, or not on the board at all.
import { composeAnalysts, ANALYST_DISCLAIMER } from '../src/compose.js';
import { analystCall } from '../src/analysts.js';
let bad = 0;
const check = (name, got, want) => {
  const ok = got === want; if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(56)} -> ${got} (want ${want})`);
};
const A = (id, text) => ({ tg_id: id, ts: 1790000000 + id, text });
const rows = [
  A(1, '‏Goldman Sachs מתהפך\n\n‏Goldman Sachs שדרג את Zeta Global מהחזק לקנייה, עם מחיר יעד 45 דולר. הסיבה: נתח שוק.'),
  A(2, '‏UBS מעלה את מחיר היעד ל-Meta ל-884 דולר מ-715\n\n‏UBS העלה את מחיר היעד ל-884 דולר מ-715 ושמר על המלצת קנייה.'),
  A(3, '‏Cantor מעלה מחיר יעד ל-Strategy ל-208 דולר\n\n‏Cantor Fitzgerald העלה את מחיר היעד ל-208 דולר.'),
  A(4, '‏Dell צונחת\n\n‏Dell יורדת.\n\n‏הסיבה: Barclays הורידה את הדירוג ל-Equal Weight'),
  A(5, '‏העלאות הדירוג הבולטות השבוע: Salesforce ו-Meta\n\n‏סיכום'),
  A(6, '‏Tesla חשפה את ה-Roadster\n\n‏Tesla חשפה הלילה.'),
];
check('a roundup naming no firm is not a call', analystCall(rows[4]), null);
check('a product launch is not a call', analystCall(rows[5]), null);
check('upgrade reads the target', analystCall(rows[0]).target, '$45');
check('upgrade is labelled as one', analystCall(rows[0]).label, 'שדרוג');
check('"raised to" reads the NEW target', analystCall(rows[1]).target, '$884');
check('firm on a later line still counts', analystCall(rows[3]).firm, 'Barclays');
check('downgrade is red', analystCall(rows[3]).dir, 'dn');
const d = composeAnalysts(rows, { now: 1790100000 });
check('deck is a cover and one board', d.slides.map(x => x.type).join(), 'cover,analysts');
check('every board disclaims', d.slides.filter(x => x.type === 'analysts').every(x => x.note === ANALYST_DISCLAIMER), true);
check('caption says it is not investment advice', d.caption.includes('אינו יועץ השקעות'), true);
check('cover says it is not our recommendation', d.slides[0].stand.includes('לא ההמלצה שלנו'), true);
check('too few moves is a skip', composeAnalysts(rows.slice(0, 2)).skip ? 'skip' : 'built', 'skip');
process.exit(bad ? 1 : 0);
