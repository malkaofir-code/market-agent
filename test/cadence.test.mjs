// The weekly editions have to carry the WHOLE record, not the first
// three of it. The film is allowed to show fewer rows than the caption
// lists — a reel with a dozen rows is a spreadsheet — but nothing may
// silently fall off the end.
import { composeScoreboardReel, composeCallbackPost } from '../src/compose.js';

const hit = (i, move) => ({
  id: i, asset: `נכס ${i}`, symbol: `S${i}`, kind: 'forecast',
  move_pct: String(move), days_after: 1, posted_at: 1789000000 + i * 86400,
  headline: `כותרת מספיק ארוכה כדי לעבור את הסף ${i}`,
  reason: 'סיבה שנאמרה בזמן אמת, ארוכה דיה כדי להיחשב הסבר אמיתי.',
});
const hits = [1, 2, 3, 4, 5, 6, 7].map((i) => hit(i, i % 2 ? i : -i));

let bad = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(52)} -> ${got} (want ${want})`);
};

const five = composeScoreboardReel(hits, { score: { hit: 7 }, rows: 5 });
check('scoreboard film: hook + 5 rows + record', five.slides.length, 7);
check('scoreboard caption lists every proven call',
  five.caption.split('\n').filter(l => l.startsWith('▪')).length, hits.length);

const three = composeScoreboardReel(hits, { score: { hit: 7 } });
check('rows defaults to 3, so the old film is unchanged', three.slides.length, 5);

const one = composeScoreboardReel([hit(1, 4)], { score: { hit: 1 }, rows: 5 });
check('one proven call still builds a card', one.slides.length, 3);
check('nothing proven is a skip, not a crash',
  composeScoreboardReel([]).skip ? 'skip' : 'built', 'skip');

const post = composeCallbackPost(hits.slice(0, 6), { score: { hit: 9 } });
check('claim post: cover + 6 cards + record', post.slides.length, 8);
check('claim post caption lists all six',
  post.caption.split('\n').filter(l => l.startsWith('▪')).length, 6);

process.exit(bad ? 1 : 0);
