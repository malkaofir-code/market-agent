// The lesson format. A reader should be able to say, after one swipe
// through, what happened and what it teaches — so the deck is held to
// that: few boards, every story shown with its meaning, one lesson,
// and a closing board that tells the truth about the schedule.
import { readFileSync } from 'fs';
process.env.DIGEST_FORMAT = 'lesson';
process.env.DIGEST_HOURS = '8,21';
const { compose } = await import('../src/compose.js');
const { lessonFor, LESSONS } = await import('../src/lessons.js');

let bad = 0;
const check = (name, ok, got = '') => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(58)} ${got}`);
};

// ── the matcher, on real messages ───────────────────────────
const L = t => lessonFor({ headline: t.split('\n')[0], note: (t.match(/💡 משמעות: (.*)/) ?? [])[1], text: t })?.id ?? null;
check('breadth story -> breadth', L('קו העלייה ירידה צנח\n💡 משמעות: היחלשות הרוחב עשויה להגביר את הרגישות') === 'breadth');
check('Fed-focus story -> fed, not data',
  L('הפד: אף חבר FOMC לא רואה סיכון\n💡 משמעות: מיקוד הפד באינפלציה עשוי להאט את קצב הורדות הריבית') === 'fed');
check('an earnings headline -> earnings', L('אינטל מפרסמת דוח רבעוני חזק') === 'earnings');
check('"June" is a month, not a Fed lesson', L('המכירות ביוני היו חלשות') === null);
check('"rejects" is not "report"', L('הנהלת החברה דוחה את ההצעה') === null);
check('every lesson has three steps and a takeaway, and no digits',
  LESSONS.every(l => l.steps.length === 3 && l.takeaway && !/\d/.test(l.steps.join('') + l.takeaway + l.title)));

// ── the deck, on the window that actually went out ──────────
const rows = JSON.parse(readFileSync(new URL('./fixture-lesson.json', import.meta.url)));
const now = Math.floor(new Date('2026-09-24T05:34:00Z').getTime() / 1000);
const deck = compose(rows, { now, endTs: rows.at(-1).ts + 60, template: 16 });
const types = deck.slides.map(s => s.type);
check('six boards at most (the old deck was ten)', deck.slides.length <= 6, `(${deck.slides.length}: ${types})`);
check('it teaches exactly one lesson', types.filter(t => t === 'lesson').length === 1);
check('the lead says what it means', types.includes('voice'));
check('the brief carries a meaning on every row',
  (deck.slides.find(s => s.type === 'brief')?.rows ?? []).every(r => r.meaning));
check('no byline left in a headline (":Letter Kobeissi The")',
  !deck.slides.some(s => /Kobeissi/.test(s.headline ?? '')));
check('the caption ends on the lesson', /📘 השיעור:/.test(deck.caption));
check('every message in the window is spent', deck.consumed.length === rows.length);
check('the closing board promises only posts that exist',
  !JSON.stringify(deck.slides.at(-1)).includes('15:00'));

// ── the evening version closes on the real schedule ─────────
const eve = compose(rows, { now: now + 13 * 3600, endTs: rows.at(-1).ts + 60, template: 16 });
const tg = eve.slides.at(-1);
check('evening closes on the Telegram card', tg.type === 'telegram');
check('…listing 08:00 and 21:00, and nothing else',
  JSON.stringify(tg.schedule?.map(x => x.time)) === JSON.stringify(['08:00', '21:00']));

process.exit(bad ? 1 : 0);
