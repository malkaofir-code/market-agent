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


// ── the honest record: N of M, misses included, no double counting ──
import { dedupeCalls } from '../src/compose.js';
const settled = [
  { ...hit(1, 4), status: 'hit', kind: 'forecast' },
  { ...hit(2, -2), status: 'miss', kind: 'forecast' },
];
const honest = composeCallbackPost(hits.slice(0, 3), { score: { hit: 49, miss: 70 }, recent: settled });
const rc = honest.slides.find(x => x.type === 'record');
check('record says the denominator', rc.of.includes('119'), true);
check('record counts hits', rc.count, '49');
check('record rows include the miss', rc.items.some(i => i.ok === false), true);
check('record rows include the hit', rc.items.some(i => i.ok === true), true);
check('caption states the full record', honest.caption.includes('49 מתוך 119'), true);
const sbh = composeScoreboardReel(hits, { score: { hit: 49, miss: 70 }, rows: 3 });
check('scoreboard hook has the denominator', sbh.slides[0].headline.includes('119'), true);
check('scoreboard caption has the denominator', sbh.caption.includes('49 מתוך 119'), true);
const twice = dedupeCalls([hit(1, 4), { ...hit(1, 4), id: 99 }]);
check('same call twice in a day is one call', twice.length, 1);

process.exit(bad ? 1 : 0);
