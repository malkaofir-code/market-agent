// Beginner-first. The deck is read in the order a newcomer needs it:
// the one thing that matters and what it means, the other things
// worth knowing, what it may move — and only then, for whoever keeps
// swiping, the mechanism and the details. Run on the real window of
// 30 Sep 2026 (21:15–08:14), the deck that went out as Dd5l5JMlFJf.
import { readFileSync } from 'fs';
process.env.DIGEST_FORMAT = 'lesson';
process.env.DIGEST_HOURS = '8,21';
const { compose } = await import('../src/compose.js');
const { glossFor } = await import('../src/glossary.js');

let bad = 0;
const check = (name, ok, got = '') => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(62)} ${got}`);
};
const rows = JSON.parse(readFileSync(new URL('./fixture-simple.json', import.meta.url)));
const now = Math.floor(new Date('2026-09-30T05:33:00Z').getTime() / 1000);
const deck = compose(rows, { now, endTs: rows.at(-1).ts + 60, template: 26 });
const S = deck.slides, types = S.map(s => s.type);
const text = JSON.stringify(S);

// ── the order ───────────────────────────────────────────────
check('cover → brief → outlook → lesson → detail → close',
  JSON.stringify(types.slice(1)) === JSON.stringify(['brief', 'outlook', 'lesson', 'detail', 'ask']), types.join(','));
check('six boards at most', S.length <= 6);
check('the deeper boards say they are deeper',
  S.filter(s => ['lesson', 'detail'].includes(s.type)).every(s => /^לעומק/.test(s.eyebrow)));
check('the first boards tell you to swipe, and what for',
  S.slice(0, 3).every(s => s.swipe) && !S.at(-1).swipe);

// ── the lead ────────────────────────────────────────────────
const cover = S[0];
check('the lead is the news, not an agenda line or a commentator',
  /Nvidia/.test(cover.headline), cover.headline);
check('…under the eyebrow "הכי חשוב עכשיו"', cover.eyebrow === 'הכי חשוב עכשיו');
check('…and the cover says what it means, not the headline again',
  cover.stand && !cover.stand.startsWith('Nvidia'), cover.stand);
check('no agenda line ("היום ב-15:30") leads or fills the brief',
  ![cover.headline, ...S[1].rows.map(r => r.headline)].some(h => /^היום ב/.test(h)));
check('no channel board (📋 לוח) in the brief',
  !S[1].rows.some(r => /לוח/.test(r.headline)));

// ── words a beginner can read ───────────────────────────────
check('no wire symbols (^NDX, ^GSPC, CL=F) anywhere on the boards',
  !/\^[A-Z]{2,5}|[A-Z]{2}=F/.test(text));
check('…or in the caption', !/\^[A-Z]{2,5}|[A-Z]{2}=F/.test(deck.caption));
check('the cover explains "רכישה עצמית"', cover.gloss?.[0]?.term === 'רכישה עצמית');
const terms = S.flatMap(s => (s.gloss ?? []).map(g => g.term));
check('no word is explained twice in one deck', new Set(terms).size === terms.length, terms.join(', '));
check('the technical word beats the index name',
  glossFor('רק 25% ממניות ה-S&P 500 מעל הממוצע הנע')[0]?.term === 'ממוצע נע');
check('no "מקור: שעון ניו יורק"', !/שעון ניו יורק/.test(deck.caption.split('\n').filter(l => /^מקור/.test(l)).join()));
check('details are sentences, not paragraphs',
  (S.find(s => s.type === 'detail')?.facts ?? []).every(f => f.length <= 190));

// ── the caption, in the same order ──────────────────────────
const c = deck.caption, at = t => c.indexOf(t);
check('caption: most important → more → deeper',
  at('🔑 הכי חשוב') > 0 && at('🔑') < at('עוד שכדאי לדעת') && at('עוד שכדאי לדעת') < at('📖 לעומק'));
check('caption under Instagram\'s limit', c.length <= 2120, `(${c.length})`);

process.exit(bad ? 1 : 0);
