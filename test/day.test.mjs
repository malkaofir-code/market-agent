// The day in the reader's money, and Ron's mood: arithmetic and feelings, never advice.
import { readFileSync } from 'fs';
import { marketMove, moneyLine, ronLine, moodOf, dayOf } from '../src/day.js';
import { compose, composeReel } from '../src/compose.js';
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

process.env.DIGEST_FORMAT = 'lesson';
const fl = JSON.parse(readFileSync(new URL('./fixture-lesson.json', import.meta.url)));
const carry = { SPX: { sym: 'SPX', chg: 0.85, last: '6,800', at: Math.floor(Date.now() / 1000) } };
const d = compose(fl, { carry, endTs: fl.at(-1).ts + 60, template: 26 });
check('digest cover carries the day', !!d.slides[0].day?.money, true);
check('digest caption: the money line', d.caption.includes('₪10,000'), true);
check('digest caption: Ron', d.caption.includes('רון:'), true);
check('digest caption: the weekly schedule', d.caption.includes('צדקנו או טעינו?'), true);
check('digest cover eyebrow asks why', d.slides[0].eyebrow.startsWith('למה כולם מדברים על') || d.slides[0].eyebrow === 'הכי חשוב עכשיו', true);
const r = composeReel(fl, { carry, template: 26, endTs: fl.at(-1).ts + 60 });
check('reel caption: the money line', r.caption.includes('₪10,000'), true);
check('captions stay under Instagram\'s limit', d.caption.length <= 2200 && r.caption.length <= 2200, true);
process.exit(bad ? 1 : 0);
