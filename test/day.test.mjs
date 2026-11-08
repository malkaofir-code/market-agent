// The day in the reader's money, and Ron's mood: arithmetic and feelings, never advice.
import { readFileSync } from 'fs';
import { marketMove, moneyLine, ronLine, moodOf, dayOf } from '../src/day.js';
import { composeEvening } from '../src/compose.js';
let bad = 0;
const check = (name, got, want) => { const ok = got === want; if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${got} (want ${want})`}`); };

check('S&P index wins over its future', marketMove([{ sym: 'ES', chg: 0.5 }, { sym: 'SPX', chg: 1.2 }]).chg, 1.2);
check('falls back to the future', marketMove([{ sym: 'ES', chg: -0.8 }]).chg, -0.8);
check('a 9% "move" is a parsing accident, not a day', marketMove([{ sym: 'SPX', chg: 9 }]), null);
check('no tape, no money line', moneyLine(marketMove([])), null);
check('+1% on 10,000 is +100', moneyLine({ fund: 'בקרן על ה-S&P 500', chg: 1 }).replace(/[\u2066\u2069\u200e]/g, ''), '₪10,000 בקרן על ה-S&P 500: +₪100 היום');
check('-1.37% rounds to 137', moneyLine({ fund: 'X', chg: -1.37 }).includes('-₪137'), true);
check('flat is said as flat', moneyLine({ fund: 'X', chg: 0.004 }).includes('כמעט בלי שינוי'), true);
check('mood: big fall', moodOf({ chg: -2 }), 'bigDown');
check('mood: quiet', moodOf({ chg: 0.1 }), 'flat');
check('Ron speaks as Ron', ronLine({ chg: 1 }).startsWith('רון: '), true);
const ADVICE = /תקנו|תמכרו|קנו|מכרו|כדאי לקנות|כדאי למכור|תחזיקו|המלצה שלי/;
for (const m of [-3, -1, 0, 1, 3, null]) for (let s = 0; s < 4; s++) {
  const l = ronLine(m == null ? null : { chg: m }, s);
  if (ADVICE.test(l)) { bad++; console.log('FAIL advice in Ron:', l); }
}
console.log('ok   no Ron line gives advice');

const rows = JSON.parse(readFileSync(new URL('./fixture-cards.json', import.meta.url)));
const now = Math.floor(Date.now() / 1000);
const carry = { SPX: { sym: 'SPX', chg: 0.85, last: '6,800', at: now } };
const d = composeEvening(rows, { carry, now });
check('evening first card carries the day', !!d.slides[0].day?.money, true);
check('evening caption: the money line', d.caption.includes('₪10,000'), true);
check('evening caption: Ron', d.caption.includes('רון:'), true);
check('evening caption: the weekly schedule', d.caption.includes('צדקנו או טעינו?'), true);
process.exit(bad ? 1 : 0);
