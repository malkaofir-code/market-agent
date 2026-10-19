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
check('upgrade is labelled in plain words', analystCall(rows[0]).label, 'שדרג את דעתו');
check('"raised to" reads the NEW target', analystCall(rows[1]).target, '$884');
check('firm on a later line still counts', analystCall(rows[3]).firm, 'Barclays');
check('downgrade is red', analystCall(rows[3]).dir, 'dn');
const d = composeAnalysts(rows, { now: 1790100000 });
check('deck is a cover and one board', d.slides.map(x => x.type).join(), 'cover,analysts');
check('every board disclaims', d.slides.filter(x => x.type === 'analysts').every(x => x.note === ANALYST_DISCLAIMER), true);
check('caption says it is not investment advice', d.caption.includes('אינו יועץ השקעות'), true);
check('cover says it is not our recommendation', d.slides[0].stand.includes('לא ההמלצה שלנו'), true);
check('too few moves is a skip', composeAnalysts(rows.slice(0, 2)).skip ? 'skip' : 'built', 'skip');

// ── the note on every movement post ──
import { analystPool, noteFor } from '../src/analysts.js';
import { composeStories, compose, rankRecord } from '../src/compose.js';
import { readFileSync } from 'fs';
const pool = analystPool(rows);
const m = noteFor('Zeta Global מזנקת 12% אחרי הדוח', pool);
check('note matches the company the story is about', `${m.firm}|${m.about}`, 'Goldman Sachs|story');
const w = noteFor('הנפט יורד 2%', pool);
check('no match falls back to the week, labelled as the week', w.about, 'week');
check('a story never cites itself', noteFor('Zeta Global', pool, { skip: 1 }).about, 'week');
check('empty pool is no note, not an invented one', noteFor('Zeta Global', []), null);
const fx = JSON.parse(readFileSync(new URL('./fixture-simple.json', import.meta.url)));
const st = composeStories(fx, { analysts: pool });
check('every story board carries a note', st.slides.every(x => x.analystNote), true);
process.env.DIGEST_FORMAT = 'lesson';
const dg = compose(fx, { analysts: pool, endTs: fx.at(-1).ts + 60 });
check('digest cover carries a note', !!dg.slides[0].analystNote, true);
check('digest caption has the attributed line', dg.caption.includes('לא ההמלצה שלנו'), true);
const off = compose(fx, { endTs: fx.at(-1).ts + 60 });
check('no pool, no note', off.slides[0].analystNote ?? null, null);

// ── the ranked record ──
const mkc = (i, st2, mv, dir = 'up') => ({ id: i, symbol: 'S' + i, dir, status: st2, move_pct: String(mv),
  posted_at: 1790000000 + i * 86400, asset: 'A' + i, headline: 'כותרת מספיק ארוכה כדי לעבור ' + i });
const rr = rankRecord([...Array.from({ length: 14 }, (_, i) => mkc(i, 'hit', 1 + i)),
  ...Array.from({ length: 8 }, (_, i) => mkc(30 + i, 'miss', -(0.5 + i), 'up'))], { hits: 10, misses: 5 });
check('ten strongest hits', rr.hits.length, 10);
check('strongest hit first', rr.hits[0].move_pct, '14');
check('five worst misses', rr.misses.length, 5);
check('worst miss first', rr.misses[0].move_pct, '-7.5');


import { plainNote } from '../src/analysts.js';
const pn = plainNote(noteFor('Meta Platforms קופצת', analystPool([rows[1]])));
check('plain note names the house and the number', pn.line.includes('בית ההשקעות UBS') && pn.line.includes('$884'), true);
check('plain note says what a price target is for', pn.line.includes('יכולה להגיע אליו'), true);
check('plain note is not advice', pn.hint, 'דעת הבנק, לא ההמלצה שלנו');
const up = plainNote({ firm: 'Goldman Sachs', act: 'up', subject: 'Zeta', about: 'story', target: '$45', label: 'x' });
check('upgrade explained as what it means', up.line.includes('הוא חושב עליה יותר טוב מקודם'), true);
check('no jargon words in a note', !/דירוג|Overweight|Outperform/.test(up.line + pn.line), true);

process.exit(bad ? 1 : 0);
