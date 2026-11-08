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
check('"תמונה: CNBC": no picture', imageOf(by(3968)).url, null);
check('uncredited picture: no picture', imageOf({ ...by(3970) }).url, null);
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
check('evening: opens on the day', types[0], 'dayCover');
check('evening: 6–8 slides (under 5 underperforms)', types.length >= 6 && types.length <= 8, true);
check('evening: the numbers board', types.includes('board'), true);
check('evening: three stories', types.filter(t => t === 'card').length, 3);
check('evening: the chart of the day', types.includes('chart'), true);
check('evening: ends on the send prompt', types.at(-1), 'close');
check('evening: the cover is the channel\'s read', e.slides[0].headline, 'המכירה מרוכזת בטכנולוגיה, לא בכל השוק');
check('evening: the cover carries the index move', e.slides[0].big?.value, '-1.4%');
check('evening: the cover carries the money', !!e.slides[0].day?.money, true);
check('evening: no story twice', new Set(e.slides.filter(s => s.type === 'card').map(s => s.tg_id)).size, 3);
check('evening: every board inside its budget', e.slides.flatMap(overBudget).length, 0);
check('evening: a photo-only message is consumed too', e.consumed.includes(3933), true);
check('evening: every message read is consumed', e.consumed.length, rows.length);
check('evening caption: a send prompt', e.caption.includes('שלחו לו'), true);
check('evening caption: the schedule', e.caption.includes('ראשון: השבוע בדקה'), true);
check('evening caption: under Instagram\'s limit', e.caption.length <= 2200, true);
const noChart = composeEvening(rows, { now });
check('evening: no closes, no chart slide — still a post', `${noChart.slides.some(s => s.type === 'chart')}:${noChart.slides.length >= 5}`, 'false:true');
const { buildSlide } = await import('../src/builder.js');
check('evening: no mascot on any slide', e.slides.every(sl => !buildSlide(sl, { poses: { welcome: ['x'], explain: ['x'], point: ['x'], upward: ['x'] }, quotes: [] }, 0, 8).includes('class="ron"')), true);
const empty = composeEvening([by(3933)], { now });
check('evening: nothing but a photo is a skip that still consumes', `${!!empty.skip}:${empty.consumed.length}`, 'true:1');

// ── the chart's headline is computed, and true ──
const lowIns = insightOf(pts, '^NDX');
check('chart: a 10-session fall to the low says so', lowIns.headline.startsWith('הנאסד״ק 100: הסגירה הנמוכה'), true);
const up = pts.map((p, i) => ({ ...p, c: 100 + i }));
check('chart: a new high says so', insightOf(up, '^SPX').headline.includes('הגבוהה'), true);
const flat = pts.map((p, i) => ({ ...p, c: 100 + Math.sin(i) }));
check('chart: otherwise the change over the period', /ב-3 חודשים: [+-]/.test(insightOf(flat, '^SPX').headline), true);
check('chart: too few sessions is no chart', insightOf(pts.slice(0, 10), '^SPX'), null);
check('chart: the day about the Nasdaq charts the Nasdaq', chartSymbolFor('📊 נאסד״ק 100 ירד 1.4%, S&P 500 ירד 0.3%'), '^NDX');

// ── the channel's 📊 line as a board ──
check('board: names and signed moves', JSON.stringify(boardOf('נאסד"ק 100 ירד 1.4%, S&P 500 ירד 0.3%, VIX 17.2').map(r => r.value)), '["-1.4%","-0.3%","17.2"]');
check('board: "S&P 500" is not a 500 move', boardOf('S&P 500 +0.28%')[0].value, '+0.28%');
check('board: an item saying two things is dropped', boardOf('נאסד״ק 100 נסגר אתמול ב-1.38%- ל-29,402 נקודות וחוזיו יורדים כעת 2.6%').length, 0);

// ── stories ──
const st = composeStories([by(3944), by(3945)], {});
check('story: one card', st.slides.length, 1);
check('story: a licensed picture is on it', !!st.slides[0].photo, true);
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
