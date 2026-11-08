// Every board inside its word budget, whichever composer built it.
import { readFileSync } from 'fs';
import { overBudget, tight, words } from '../src/budget.js';
import { composeEvening, composeStories, composeWeekReel } from '../src/compose.js';
import { composeCallbackPost, rankRecord } from '../src/proof.js';
let bad = 0;
const check = (name, ok, got) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${got}`}`); };

check('tight keeps a short line', tight('שלוש מילים בלבד', 5), 'שלוש מילים בלבד');
check('tight cuts at a sentence', tight('הנפט עלה היום. הסיבה היא המלחמה בין שתי מדינות.', 5), 'הנפט עלה היום.');
check('tight cuts at a clause', tight('הנפט עלה היום ב-3%, הסיבה היא המלחמה בין שתי מדינות', 6), 'הנפט עלה היום ב-3%');
check('tight never ends on a dangling word', !/ (של|על|את)…$/.test(tight('מדד המחירים לצרכן של ארצות הברית של אמריקה עלה', 5)), true);
check('tight leaves marked html alone', tight('א <em>ב</em> ג ד ה ו ז ח ט י כ', 3).includes('<em>'), true);

const rows = JSON.parse(readFileSync(new URL('./fixture-cards.json', import.meta.url)));
const t = 1790000000;
const mk = (i, st, mv) => ({ id: i, symbol: 'S' + i, asset: 'S&P 500', dir: 'up', kind: 'forecast', status: st, klass: 'index', horizon: 3,
  move_pct: String(mv), days_after: 2, posted_at: t - i * 86400, headline: 'S&P 500 צפוי לעלות השבוע לפני דוחות החברות הגדולות של עונת הדוחות הנוכחית ועוד מילים', reason: 'הסנטימנט תומך בתנועה, והנתונים שפורסמו הבוקר מצטרפים לתמונה חיובית יותר מהצפוי, אם כי לא בכל הסקטורים.',
  base_px: 5000, out_px: 5080, base_date: '2026-10-09', out_date: '2026-10-13', path: [] });
const hits = [mk(1, 'hit', 1.6), mk(2, 'hit', 2.4)];
const now = 1793306265 + 3600;
const decks = {
  'evening': composeEvening(rows, { now }),
  'story': composeStories(rows.slice(1, 3), {}),
  'week reel': composeWeekReel(rows, { now, score: { hit: 3, miss: 2 } }),
  'proof post': composeCallbackPost(hits, { score: { hit: 49, miss: 70 }, board: rankRecord([...hits, mk(3, 'miss', -1)]) }),
};
for (const [name, deck] of Object.entries(decks)) {
  if (deck.skip) { console.log(`skip ${name}: ${deck.skip}`); continue; }
  const over = deck.slides.flatMap((s, i) => overBudget(s).map(x => `#${i + 1} ${s.type} ${x}`));
  check(`${name}: every board inside budget (${deck.slides.length} boards)`, !over.length, over.join(' | '));
}
process.exit(bad ? 1 : 0);
