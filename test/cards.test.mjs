// The one design: the channel's story, its picture when licensed, what it means.
import { readFileSync } from 'fs';
import { storyOf, storiesOf, imageOf, headlineOf } from '../src/story.js';
import { composeEvening, composeStories, composeWeekReel, signed } from '../src/compose.js';
import { overBudget } from '../src/budget.js';
let bad = 0;
const check = (name, got, want) => { const ok = got === want; if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${JSON.stringify(got)} (want ${JSON.stringify(want)})`}`); };
const rows = JSON.parse(readFileSync(new URL('./fixture-cards.json', import.meta.url)));
const by = id => rows.find(r => r.tg_id === id);

// ── reading the channel's format ──
check('a flash is filed under its story, not "מבזק"', headlineOf(by(3944).text), 'Microsoft: הרווח וההכנסות לרבעון מכים את התחזיות');
check('"מבזק:" prefix comes off', headlineOf(by(3968).text), 'Amazon, רבעון שלישי');
check('a photo-only message is no story', storyOf(by(3933)), null);
check('the 💡 line is the meaning', storyOf(by(3944)).meaning.startsWith('צמיחת Azure'), true);
check('the 📊 line is where we are', storyOf(by(3970)).where.startsWith('נאסד"ק 100 ירד 1.4%'), true);
check('the channel\'s opinion is kept apart', storyOf(by(3970)).opinion.startsWith('אני נוטה'), true);
check('a 🧭 post is a read', storyOf(by(3970)).kind, 'read');
// ── pictures: only licensed ones ──
check('Wikimedia + CC: the picture is used', !!imageOf(by(3944)).url, true);
check('…and credited', imageOf(by(3944)).credit, 'תמונה: Wikimedia Commons / Briansmale / CC BY-SA 4.0');
check('"תמונה: CNBC": used, with its credit (owner, 13 Nov)', `${!!imageOf(by(3968)).url}:${imageOf(by(3968)).credit}`, 'true:תמונה: CNBC');
check('uncredited picture: used, no credit line invented', `${!!imageOf({ ...by(3970) }).url}:${imageOf({ ...by(3970) }).credit}`, 'true:null');
check('credited but no media attached: no picture', imageOf(by(3957)).url, null);
check('a bare fall is printed signed', signed('2.6%', 'dn'), '-2.6%');

// ── the same story told twice is one story ──
const twice = [...rows, { ...by(3944), tg_id: 9944, ts: by(3944).ts + 600 }];
check('a retold story appears once', storiesOf(twice).filter(s => /^Microsoft/.test(s.headline)).length, 1);
check('…the newest telling wins', storiesOf(twice).find(s => /^Microsoft/.test(s.headline)).tg_id, 9944);

// ── 21:00 · the explainer carousel (v2) ──
import { insightOf, chartSymbolFor } from '../src/chart.js';
import { boardOf } from '../src/story.js';
const now = 1793306265 + 3600;
const pts = []; let c = 100; const d0 = Date.parse('2026-08-03');
for (let i = 0; i < 70; i++) { c *= i < 60 ? 1.002 : 0.98; pts.push({ d: new Date(d0 + i * 86400000).toISOString().slice(0, 10), c }); }
const e = composeEvening(rows, { now, carry: { SPX: { sym: 'SPX', chg: -0.3, last: '7720', at: now } }, series: { sym: '^NDX', points: pts } });
const types = e.slides.map(s => s.type);
const heat = [['^SPX', -0.3], ['^NDX', -1.4], ['NVDA', -3.2], ['AAPL', 0.4], ['MSFT', 1.6], ['GOOGL', -6.1], ['AMZN', -0.8], ['META', -2.2]].map(([sym, chg]) => ({ sym, chg }));
const em = composeEvening(rows, { now, series: { sym: '^NDX', points: pts }, heat });
check('evening: opens on the brand cover', types[0], 'kCover');
check('evening: 5–6 pages', types.length >= 5 && types.length <= 6, true);
check('evening: the numbers board', types.includes('kBoard'), true);
check('evening: two stories beside the board', types.filter(t => t === 'kStory').length, 2);
check('evening: no map → the big number and the chart page', `${!!e.slides[0].big}:${types.includes('kChart')}:${e.cover}`, 'true:true:number');
check('evening: with a map, the map is the cover and the chart page goes', `${em.slides[0].tiles.length}:${em.slides.some(s => s.type === 'kChart')}:${em.cover}`, '8:false:map');
check('map: fewer than six moves is no map', composeEvening(rows, { now, heat: heat.slice(0, 4) }).slides[0].tiles, null);
check('map: an implausible move is dropped', composeEvening(rows, { now, heat: [...heat.slice(0, 7), { sym: 'META', chg: 80 }] }).slides[0].tiles.length, 7);
check('evening: no story line ends in "…"', e.slides.filter(s => s.type === 'kStory').every(s => !/…$/.test(s.mean ?? '') && !/…$/.test(s.headline)), true);
check('evening: a story line is one glance (≤12 words)', e.slides.filter(s => s.type === 'kStory').every(s => !s.mean || s.mean.split(/\s+/).length <= 12), true);
check('evening: ends on the send prompt', types.at(-1), 'kClose');
check('evening: the cover is the channel\'s read', e.slides[0].headline, 'המכירה מרוכזת בטכנולוגיה, לא בכל השוק');
check('evening: the cover carries the index move', e.slides[0].big?.value, '-1.4%');
check('evening: the cover carries the reader\'s money', !!e.slides[0].money?.stake, true);
check('evening: no story twice', new Set(e.slides.filter(s => s.type === 'kStory').map(s => s.tg_id)).size, 2);
check('evening: every page inside its budget', [...e.slides, ...em.slides].flatMap(overBudget).length, 0);
check('evening: a photo-only message is consumed too', e.consumed.includes(3933), true);
check('evening: every message read is consumed', e.consumed.length, rows.length);
check('evening caption: a send prompt', e.caption.includes('שלחו לו'), true);
check('evening caption: the schedule', e.caption.includes('ראשון: השבוע בדקה'), true);
check('evening caption: the trust line', e.caption.includes('לא ייעוץ השקעות'), true);
check('evening caption: under Instagram\'s limit', e.caption.length <= 2200, true);
const { buildSlide } = await import('../src/builder.js');
const ctx = { poses: { welcome: ['data:x'], explain: ['data:x'], point: ['data:x'], yes: ['data:x'], pause: ['data:x'] }, quotes: [] };
check('evening: Ron hosts the cover and the close', `${buildSlide(e.slides[0], ctx, 0, 6).includes('k-ron')}:${buildSlide(e.slides.at(-1), ctx, 5, 6).includes('k-ron')}`, 'true:true');
check('evening: every page builds', em.slides.every((sl, i) => buildSlide(sl, ctx, i, em.slides.length).includes('class="slide kx')), true);

// ── למה זה זז? ──
const { composeWhyReel, composeProofReel, composeAcademy } = await import('../src/compose.js');
const why = composeWhyReel(rows, { now });
check('why reel: opens on the move as a question', why.slides[0].headline, 'למה הנאסד״ק ירד היום?');
check('why reel: the number is on the first frame', why.slides[0].big, '-1.4%');
check('why reel: the answer is the channel\'s read', why.slides[1].headline, 'המכירה מרוכזת בטכנולוגיה, לא בכל השוק');
check('why reel: ends on a question', why.slides.at(-1).headline, 'עולה או יורד מחר?');
check('why reel: every frame has a spoken line', why.slides.every(s => !!s.say), true);
check('why reel: every frame builds in the brand', why.slides.every((sl, i) => buildSlide(sl, ctx, i, why.slides.length).includes('a-ks')), true);
check('why reel: one message is not a reel', !!composeWhyReel(rows.slice(0, 1), { now }).skip, true);

// ── צדקנו או טעינו? ──
const pr = composeProofReel({ misses: [{ id: 1, asset: 'Tesla', dir: 'up', move_pct: -4.2, headline: 'x' }],
  hits: [{ id: 2, asset: 'Nvidia', dir: 'up', move_pct: 5.1, headline: 'y' }] }, { now, score: { hit: 9, miss: 4 } });
check('proof reel: the miss comes first', pr.slides[1].chip, 'טעינו ✗');
check('proof reel: the record is stated with its denominator', pr.slides.at(-1).headline, 'צדקנו 9 מתוך 13');
check('proof reel: one settled call is not a record', !!composeProofReel({ hits: [{ id: 2, asset: 'Nvidia', dir: 'up', move_pct: 5.1 }], misses: [] }, { now }).skip, true);

// ── האקדמיה של רון ──
const { LESSONS } = await import('../src/academy.js');
const ac = composeAcademy(7, { now });
check('academy: cover, three steps, the line to keep, the ask', ac.slides.map(s => s.type).join(' '), 'kLesson kStep kStep kStep kTake kClose');
check('academy: thirty lessons', LESSONS.length, 30);
check('academy: lesson 31 is lesson 1 again', composeAcademy(31, { now }).lesson, 1);
check('academy: every lesson fits its pages', LESSONS.every((_, i) => composeAcademy(i + 1, { now }).slides.flatMap(overBudget).length === 0), true);
check('academy: every lesson has three steps and one line', LESSONS.every(l => l.steps.length === 3 && l.take && l.hook && l.title), true);
const ADV = /כדאי|מומלץ|תקנו|תמכרו|לקנות עכשיו|למכור עכשיו/;
check('academy: no lesson gives advice', LESSONS.every(l => !ADV.test([l.title, l.hook, ...l.steps, l.take].join(' '))), true);
check('academy: no lesson carries a number that goes stale', LESSONS.every(l => !/\d+(?:\.\d+)?%/.test([l.hook, ...l.steps, l.take].join(' '))), true);
check('academy: every lesson builds', ac.slides.every((sl, i) => buildSlide(sl, ctx, i, 6).includes('class="slide kx')), true);

const empty = composeEvening([by(3933)], { now });
check('evening: nothing but a photo is a skip that still consumes', `${!!empty.skip}:${empty.consumed.length}`, 'true:1');

// ── one line, or none ──
const { oneLine } = await import('../src/compose.js');
check('oneLine: a short sentence stays', oneLine('הפד השאיר את הריבית. והשוק עלה.'), 'הפד השאיר את הריבית');
check('oneLine: a long sentence falls back to its clause', oneLine('תחזית AWS החלשה אכזבה את המשקיעים בצורה ברורה, אחרי צמיחת ענן חזקה אצל Google ו-Microsoft שהגבירה ציפיות'), 'תחזית AWS החלשה אכזבה את המשקיעים בצורה ברורה');
check('oneLine: nothing fits, nothing printed', oneLine('א ב ג ד ה ו ז ח ט י כ ל מ נ ס ע פ צ ק ר'), null);

// ── the midweek reel ──
const mid = composeWeekReel(rows, { now, span: 'days' });
check('midweek reel: called השוק בדקה', mid.skip ? true : mid.caption.startsWith('השוק בדקה'), true);
check('midweek reel: ends on tomorrow', mid.skip ? true : mid.slides.at(-1).headline, mid.skip ? true : 'עולה או יורד מחר?');
check('midweek reel: no week record scene', mid.skip ? true : mid.slides.every(s => !/צדקנו/.test(s.headline)), true);

// ── the chart's headline is computed, and true ──
const lowIns = insightOf(pts, '^NDX');
check('chart: a 10-session fall to the low says so', lowIns.headline.startsWith('הנאסד״ק 100: הסגירה הנמוכה'), true);
const up = pts.map((p, i) => ({ ...p, c: 100 + i }));
check('chart: a new high says so', insightOf(up, '^SPX').headline.includes('הגבוהה'), true);
const flat = pts.map((p, i) => ({ ...p, c: 100 + Math.sin(i) }));
check('chart: otherwise the change over the period', /ב-3 חודשים: [+-]/.test(insightOf(flat, '^SPX').headline), true);
const fall = pts.map((p, i) => ({ ...p, c: i < 40 ? 100 + i : 140 - (i - 40) * 0.6 + (i % 2 ? 2 : 0) }));
check('chart: a fall from the peak says how far', /מהשיא של \d\d\.\d\d/.test(insightOf(fall, '^NDX').headline), true);
check('chart: too few sessions is no chart', insightOf(pts.slice(0, 10), '^SPX'), null);
check('chart: the day about the Nasdaq charts the Nasdaq', chartSymbolFor('📊 נאסד״ק 100 ירד 1.4%, S&P 500 ירד 0.3%'), '^NDX');

// ── the channel's 📊 line as a board ──
check('board: names and signed moves', JSON.stringify(boardOf('נאסד"ק 100 ירד 1.4%, S&P 500 ירד 0.3%, VIX 17.2').map(r => r.value)), '["-1.4%","-0.3%","17.2"]');
check('board: "S&P 500" is not a 500 move', boardOf('S&P 500 +0.28%')[0].value, '+0.28%');
check('board: an item saying two things is dropped', boardOf('נאסד״ק 100 נסגר אתמול ב-1.38%- ל-29,402 נקודות וחוזיו יורדים כעת 2.6%').length, 0);

// ── stories ──
const st = composeStories([by(3944), by(3945)], {});
check('story: one card', st.slides.length, 1);
check('story: the picture is on it', !!st.slides[0].photo, true);
check('story: in the brand', st.slides[0].type, 'kStory');
check('story: inside budget', overBudget(st.slides[0]).length, 0);

// ── Sunday ──
const r = composeWeekReel(rows, { now, score: { hit: 4, miss: 3 } });
check('week reel: hook, 3 stories, record, ask', r.slides.length, 6);
check('week reel: the record scene', r.slides[4].headline, 'צדקנו 4 מתוך 7');
check('week reel: the question closes it', r.slides.at(-1).headline, 'עולה או יורד השבוע?');
check('week reel: Ron only opens and closes', r.slides.map(s => s.ron === null ? 0 : 1).join(''), '100001');
check('week reel: hook number is signed', /^[+-]/.test(r.slides[0].big ?? '+'), true);
check('week reel: thin week is a skip', !!composeWeekReel(rows.slice(0, 3), { now }).skip, true);
check('week reel caption: the record', r.caption.includes('צדקנו 4 מתוך 7'), true);
process.exit(bad ? 1 : 0);
