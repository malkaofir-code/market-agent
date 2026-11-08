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

// ── 21:00 ──
const now = 1793306265 + 3600;
const e = composeEvening(rows, { now, carry: { SPX: { sym: 'SPX', chg: -0.3, last: '7720', at: now } } });
check('evening: three cards', e.slides.length, 3);
check('evening: every board is a card', e.slides.every(s => s.type === 'card'), true);
check('evening: the first card is the day (the channel\'s read)', e.slides[0].tg_id, 3970);
check('evening: the first card carries the money', !!e.slides[0].day?.money, true);
check('evening: no story twice', new Set(e.slides.map(s => s.tg_id)).size, 3);
check('evening: every board inside its budget', e.slides.flatMap(overBudget).length, 0);
check('evening: a photo-only message is consumed too', e.consumed.includes(3933), true);
check('evening: every message read is consumed', e.consumed.length, rows.length);
check('evening caption: the schedule', e.caption.includes('ראשון: השבוע בדקה'), true);
check('evening caption: a question', e.caption.includes('כתבו בתגובות'), true);
check('evening caption: under Instagram\'s limit', e.caption.length <= 2200, true);
const { buildSlide } = await import('../src/builder.js');
check('evening: no mascot on a card', buildSlide(e.slides[0], { poses: { welcome: ['x'], explain: ['x'], point: ['x'] }, quotes: [] }, 0, 3).includes('class="ron"'), false);
const empty = composeEvening([by(3933)], { now });
check('evening: nothing but a photo is a skip that still consumes', `${!!empty.skip}:${empty.consumed.length}`, 'true:1');

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
