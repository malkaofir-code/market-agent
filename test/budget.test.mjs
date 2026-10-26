// Every board inside its word budget, whichever composer built it.
import { readFileSync } from 'fs';
import { overBudget, tight, words } from '../src/budget.js';
import { compose, composeStories, composeReel, composeCallbackPost, composeAnalysts, rankRecord } from '../src/compose.js';
import { analystPool } from '../src/analysts.js';
let bad = 0;
const check = (name, ok, got) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${got}`}`); };

check('tight keeps a short line', tight('שלוש מילים בלבד', 5), 'שלוש מילים בלבד');
check('tight cuts at a sentence', tight('הנפט עלה היום. הסיבה היא המלחמה בין שתי מדינות.', 5), 'הנפט עלה היום.');
check('tight cuts at a clause', tight('הנפט עלה היום ב-3%, הסיבה היא המלחמה בין שתי מדינות', 6), 'הנפט עלה היום ב-3%');
check('tight never ends on a dangling word', !/ (של|על|את)…$/.test(tight('מדד המחירים לצרכן של ארצות הברית של אמריקה עלה', 5)), true);
check('tight leaves marked html alone', tight('א <em>ב</em> ג ד ה ו ז ח ט י כ', 3).includes('<em>'), true);

const A = (id, text) => ({ tg_id: id, ts: 1790000000 + id, text });
const pool = analystPool([A(1, '‏UBS מעלה יעד ל-Meta ל-884 דולר\n\n‏UBS העלה את מחיר היעד ל-884 דולר.'),
  A(2, '‏Goldman\n\n‏Goldman Sachs שדרג את Zeta Global מהחזק לקנייה, עם מחיר יעד 45 דולר.')]);
// A message written as a wall: the story that failed on 26.10.
const wall = [A(9, '📈 וול סטריט: עלייה רחבה ערב שבוע דוחות גדול\n'
  + 'מדד הנאסד״ק 100 עולה כ-1.4% ל-29,368 נקודות, וה-S&P 500 מוסיף כ-1% ל-7,699, שניהם קרוב לשיאי היום. העלייה רחבה ומובלת על ידי הטכנולוגיה: כספים חוזרים לסקטור השבבים אחרי שלושה שבועות רצופים של יציאות, ו-Tesla מזנקת לשיא של שלושה חודשים. השבוע גם נפתח שבוע הדוחות הגדול של ענקיות הטכנולוגיה, עם Microsoft, Google, Amazon ו-Meta כולן מדווחות, על רקע המשך השקעות ענק בתשתיות בינה מלאכותית.\n'
  + 'מדד הנאסד״ק 100 עולה כ-1.4% ל-29,368 נקודות, וה-S&P 500 מוסיף כ-1% ל-7,699, שניהם קרוב לשיאי היום. העלייה רחבה ומובלת על ידי הטכנולוגיה: כספים חוזרים לסקטור השבבים אחרי שלושה שבועות רצופים של יציאות.\n'
  + '💡 משמעות: עלייה רחבה ערב שבוע דוחות גדול בדרך כלל מתפרשת כציפייה להמשך חוזק בהשקעות ה-AI, אבל גם מעלה את הרף לדוחות עצמם, כך שכל אכזבה קטנה עלולה להתקבל בירידות חדות יותר מהרגיל.')];
process.env.DIGEST_FORMAT = 'lesson';
const fl = JSON.parse(readFileSync(new URL('./fixture-lesson.json', import.meta.url)));
const fs = JSON.parse(readFileSync(new URL('./fixture-simple.json', import.meta.url)));
const t = 1790000000;
const mk = (i, st, mv) => ({ id: i, symbol: 'S' + i, asset: 'S&P 500', dir: 'up', kind: 'forecast', status: st, klass: 'index', horizon: 3,
  move_pct: String(mv), days_after: 2, posted_at: t - i * 86400, headline: 'S&P 500 צפוי לעלות השבוע לפני דוחות החברות הגדולות של עונת הדוחות הנוכחית ועוד מילים', reason: 'הסנטימנט תומך בתנועה, והנתונים שפורסמו הבוקר מצטרפים לתמונה חיובית יותר מהצפוי, אם כי לא בכל הסקטורים.',
  base_px: 5000, out_px: 5080, base_date: '2026-10-09', out_date: '2026-10-13', path: [] });
const hits = [mk(1, 'hit', 1.6), mk(2, 'hit', 2.4)];
const decks = {
  'digest (lesson fixture)': compose(fl, { analysts: pool, endTs: fl.at(-1).ts + 60, template: 26 }),
  'digest (simple fixture)': compose(fs, { analysts: pool, endTs: fs.at(-1).ts + 60, template: 3 }),
  'digest (wall)': compose(wall, { endTs: wall.at(-1).ts + 60, template: 26 }),
  'stories (simple)': composeStories(fs, { analysts: pool, story: 'top', palette: 'flare' }),
  'stories (wall)': composeStories(wall, { story: 'top', palette: 'flare' }),
  'reel': composeReel(fl, { template: 26, endTs: fl.at(-1).ts + 60 }),
  'proof post': composeCallbackPost(hits, { score: { hit: 49, miss: 70 }, board: rankRecord([...hits, mk(3, 'miss', -1)]) }),
  'analysts': composeAnalysts([...pool.map(c => A(c.tg_id, '')), A(1, '‏UBS מעלה יעד ל-Meta ל-884 דולר\n\n‏UBS העלה את מחיר היעד ל-884 דולר ושמר על המלצת קנייה חיובית לטווח הארוך של שנתיים לפחות.'),
    A(2, '‏Goldman\n\n‏Goldman Sachs שדרג את Zeta Global מהחזק לקנייה, עם מחיר יעד 45 דולר.'),
    A(3, '‏Cantor\n\n‏Cantor Fitzgerald העלה את מחיר היעד ל-208 דולר.'), A(4, '‏Dell\n\n‏הסיבה: Barclays הורידה את הדירוג ל-Equal Weight')], { now: t }),
};
for (const [name, deck] of Object.entries(decks)) {
  if (deck.skip) { console.log(`skip ${name}: ${deck.skip}`); continue; }
  const over = deck.slides.flatMap((s, i) => overBudget(s).map(x => `#${i + 1} ${s.type} ${x}`));
  check(`${name}: every board inside budget (${deck.slides.length} boards)`, !over.length, over.join(' | '));
}
const wallStory = decks['stories (wall)'].slides.find(s => s.type === 'note');
if (wallStory) {
  check('the wall story carries one supporting line', (wallStory.basis ?? []).length <= 1, wallStory.basis?.length);
  check('…of at most 16 words', words(wallStory.basis?.[0] ?? '').length <= 16, words(wallStory.basis?.[0] ?? '').length);
}
process.exit(bad ? 1 : 0);
