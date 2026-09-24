// The outlook board: what the window points at, up or down, and how
// fast. It may only say what the channel forecast or what a fixed
// mechanism implies from something the window reports — never fill.
import { readFileSync } from 'fs';
process.env.DIGEST_FORMAT = 'lesson';
process.env.DIGEST_HOURS = '8,21';
const { outlookFor } = await import('../src/outlook.js');
const { compose } = await import('../src/compose.js');

let bad = 0;
const check = (name, ok, got = '') => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(60)} ${got}`);
};
const R = (...texts) => texts.map((text, i) => ({ tg_id: i + 1, ts: 1_790_000_000 + i, text }));
const names = o => o ? { up: o.up.map(x => x.name), dn: o.dn.map(x => x.name) } : null;

// ── the real window ──────────────────────────────────────────
const rows = JSON.parse(readFileSync(new URL('./fixture-lesson.json', import.meta.url)));
const o = outlookFor(rows);
check('the real window has an outlook', !!o, JSON.stringify(names(o)));
check('…the channel\'s own oil forecast is on it, marked as theirs',
  o?.dn.some(x => x.name === 'נפט' && x.basis === 'report'));
check('…yields at a record put growth stocks on the down side',
  o?.dn.some(x => x.name.includes('טכנולוגיה') && x.basis === 'ours'));
check('…nothing about Bank of America or the S&P (the two misreads)',
  ![...(o?.up ?? []), ...(o?.dn ?? [])].some(x => /בנק|S&P/.test(x.name)));
check('…at most two a side and four in all',
  o && o.up.length <= 2 && o.dn.length <= 2 && o.up.length + o.dn.length <= 4);
check('…every row has a speed and a basis',
  [...o.up, ...o.dn].every(x => ['fast', 'mid', 'slow'].includes(x.speed) && ['report', 'ours'].includes(x.basis)));
check('…our own lines carry no figures',
  [...o.up, ...o.dn].filter(x => x.basis === 'ours').every(x => !/\d/.test(x.name + x.why)));

// ── nothing to say, nothing said ─────────────────────────────
check('a window with no forecast and no driver has no outlook',
  outlookFor(R('הנהלת החברה דוחה את ההצעה\nהדירקטוריון יתכנס בשבוע הבא.')) === null);
check('the same thing called both ways is dropped',
  names(outlookFor(R('אנליסטים: הנפט צפוי לעלות לקראת החורף',
    'אנליסטים: הנפט צפוי לרדת בגלל עודף היצע')))?.up.includes('נפט') !== true);
check('"retreats, yields at a record" reads yields as UP',
  names(outlookFor(R('וול סטריט נסוגה, תשואות ה-10 שנים בשיא')))?.dn.includes('מניות טכנולוגיה וצמיחה'));
check('yields falling puts growth stocks on the up side',
  names(outlookFor(R('תשואות האג"ח יורדות אחרי נתון חלש')))?.up.includes('מניות טכנולוגיה וצמיחה'));
check('mixed signals on a driver say nothing about it',
  outlookFor(R('תשואות האג"ח יורדות בבוקר', 'תשואות האג"ח עולות בערב')) === null);

// ── speed ───────────────────────────────────────────────────
const sp = outlookFor(R('אנליסטים: הזהב עשוי להמשיך לעלות בחודשים הקרובים'));
check('"בחודשים הקרובים" is weeks, not days', sp?.up[0]?.speed === 'mid', sp?.up[0]?.speed);
const sd = outlookFor(R('הדולר מתחזק מול כל המטבעות'));
check('a strong dollar reaches earnings in months', sd?.dn[0]?.speed === 'slow', sd?.dn[0]?.speed);

// ── in the deck ─────────────────────────────────────────────
const now = Math.floor(new Date('2026-09-24T05:34:00Z').getTime() / 1000);
const deck = compose(rows, { now, endTs: rows.at(-1).ts + 60, template: 16 });
const types = deck.slides.map(s => s.type);
check('the deck carries the outlook, still six boards at most', types.includes('outlook') && types.length <= 6, types.join(','));
check('…after the lesson, before the brief',
  types.indexOf('outlook') > types.indexOf('lesson') && types.indexOf('outlook') < types.indexOf('brief'));
check('…and the caption says it is an estimate', /🧭 .*\(הערכה, לא המלצה\)/.test(deck.caption));
process.env.DIGEST_OUTLOOK = '0';
const off = compose(rows, { now, endTs: rows.at(-1).ts + 60, template: 16 });
check('DIGEST_OUTLOOK=0 turns it off', !off.slides.some(s => s.type === 'outlook') && !/🧭/.test(off.caption));

process.exit(bad ? 1 : 0);
