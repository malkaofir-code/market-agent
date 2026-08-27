// ─────────────────────────────────────────────────────────────
// run.js — one window, end to end.
//   pick -> compose -> render -> upload -> publish -> record
//
// Safe to run repeatedly and safe to run anywhere: all state lives in
// Postgres, so a GitHub Actions runner that keeps nothing between
// invocations behaves exactly like a long-lived machine.
//
//   node src/run.js --ingest                      pull new messages first
//   node src/run.js --dry                         everything but publish
//   node src/run.js --dry --window=2026-08-26T08:00
// ─────────────────────────────────────────────────────────────
import { existsSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';
import {
  putMessages, messagesIn, messagesInAll, oldestUnconsumedBefore, markConsumed,
  upsertWindow, setWindow, getWindow, postsToday, lastPostAt, recentOutcomes, clearFailed,
  logRun, getState, setState, getToken, setToken, close,
} from './db.js';
import { compose, windowOf, WIN } from './compose.js';
import { renderDeck } from './render.js';
import { connect, alert } from './tg.js';

const DRY = process.argv.includes('--dry') || process.env.DRY_RUN === '1';
const CARRY_KEY = 'tape-carry';
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── rails ────────────────────────────────────────────────────
async function blocked() {
  const ks = process.env.KILL_SWITCH || './PAUSED';
  if (existsSync(ks)) return `kill switch present (${ks})`;

  const hour = Number(new Intl.DateTimeFormat('en-GB',
    { timeZone: process.env.TZ || 'Asia/Jerusalem', hour: '2-digit', hour12: false })
    .format(new Date()));
  const from = Number(process.env.ACTIVE_FROM_HOUR ?? 7);
  const to = Number(process.env.ACTIVE_TO_HOUR ?? 24);
  if (hour < from || hour >= to) return `outside active hours (${hour}:00, active ${from}-${to})`;

  const cap = Number(process.env.MAX_POSTS_PER_DAY || 12);
  const n = await postsToday();
  if (n >= cap) return `daily cap reached (${n}/${cap})`;

  const gap = Number(process.env.MIN_MINUTES_BETWEEN_POSTS || 12);
  const last = await lastPostAt();
  if (last && (Date.now() / 1000 - last) < gap * 60)
    return `only ${Math.round((Date.now() / 1000 - last) / 60)}min since last post (min ${gap})`;

  const need = Number(process.env.PAUSE_AFTER_FAILURES || 2);
  const within = Number(process.env.PAUSE_WINDOW_MIN || 180);
  const recent = await recentOutcomes(need, within);
  if (recent.length >= need && recent.every(s => s === 'failed'))
    return `${need} consecutive failures in the last ${within}min — paused. `
         + `Fix, then re-run with resume ticked (or wait ${within}min).`;

  return null;
}

// ── the window to work on ────────────────────────────────────
// The OLDEST closed window still holding unconsumed messages, not
// simply the last one. A scheduler that misses ticks (a sleeping
// laptop, a late GitHub cron) would otherwise drop those bursts
// permanently. MAX_WINDOW_AGE_MIN stops the catch-up from publishing
// stale news.
async function pickWindow() {
  const arg = process.argv.find(a => a.startsWith('--window='));
  if (arg) {
    const key = arg.slice(9);
    const start = Math.floor(Date.parse(key + ':00+03:00') / 1000);
    if (!Number.isFinite(start)) throw new Error(`bad --window (want 2026-08-26T08:00): ${key}`);
    return { key, start, end: start + WIN * 60, replay: true,
      rows: await messagesInAll(start, start + WIN * 60) };
  }
  const nowWindow = windowOf(Math.floor(Date.now() / 1000)).start;   // still open, skip it
  const oldest = await oldestUnconsumedBefore(nowWindow);
  if (!oldest) return null;
  const w = windowOf(Number(oldest));
  return { key: w.key, start: w.start, end: w.end,
    rows: await messagesIn(w.start, w.end),
    backlog: Math.floor((nowWindow - w.start) / (WIN * 60)) };
}

async function main() {
  if (process.argv.includes('--ingest')) {
    try {
      const { fetchRecent } = await import('./ingest.js');
      const { withMedia } = await import('./db.js');
      const rows = await fetchRecent(80, await withMedia());
      await putMessages(rows);
      say('ingested', rows.length, 'message(s)');
    } catch (e) { say('ingest failed (continuing):', e.message); }
  }

  // .env seeds the token once; after that Postgres holds the live one
  // (refresh-token.js writes there, and a runner has no disk).
  const stored = await getToken();
  if (stored) process.env.IG_ACCESS_TOKEN = stored;
  else if (process.env.IG_ACCESS_TOKEN) {
    await setToken(process.env.IG_ACCESS_TOKEN, null);
    say('seeded Instagram token into the database');
  }

  const stop = DRY ? null : await blocked();
  if (stop) { say('SKIP —', stop); return; }

  let w = await pickWindow();
  if (!w) { say('SKIP — nothing unconsumed'); return; }

  // Old news is worse than no news - but retire the whole stale
  // backlog in ONE pass, not one window per run. The migration
  // arrived carrying a week of unconsumed history, and retiring a
  // single window per hourly tick would have spent three days
  // replaying August before reaching today. The same loop absorbs
  // any future outage.
  const maxAge = Number(process.env.MAX_WINDOW_AGE_MIN || 90);
  const stale = x => Math.floor((Date.now() / 1000 - x.end) / 60) > maxAge;
  let retired = 0, dropped = 0;
  while (w && !w.replay && stale(w)) {
    await upsertWindow(w.key, w.start, w.end);
    await markConsumed(w.key, w.rows.map(r => Number(r.tg_id)));
    // A failed publish leaves its messages unconsumed, so the next
    // tick's retire loop used to sweep the window up and overwrite
    // 'failed' with 'stale' - laundering the failure, so the
    // auto-pause counted zero and never latched. Consume the
    // messages, but never downgrade a recorded failure.
    const prior = await getWindow(w.key);
    if (prior?.status !== 'failed') await setWindow({ key: w.key, status: 'stale', slides: 0 });
    retired++; dropped += w.rows.length;
    if (retired >= 500) { say('retire loop hit its 500-window guard'); break; }
    w = await pickWindow();
  }
  if (retired) say(`RETIRED ${retired} stale window(s), ${dropped} msg(s)`);
  if (!w) { say('SKIP — nothing fresh left'); return; }
  if (w.backlog > 1) say(`catching up — ${w.key} is ${w.backlog} window(s) behind`);

  // A three-message window makes a four-slide post, and four slides
  // read as an afterthought next to a full deck. Merge forward into
  // the following CLOSED windows until there is enough to fill one.
  // Deliberately after the retire loop: merging moves the end forward,
  // so doing it earlier would make every stale window look fresh.
  if (!w.replay) {
    const minMsgs = Number(process.env.MIN_MESSAGES || 6);
    const openStart = windowOf(Math.floor(Date.now() / 1000)).start;
    let merged = 0;
    while (w.rows.length < minMsgs && w.end < openStart) {
      w.end += WIN * 60;
      w.rows = await messagesIn(w.start, w.end);
      merged++;
    }
    if (merged) say(`merged ${merged} following window(s) — ${w.rows.length} msg(s)`);
  }

  await upsertWindow(w.key, w.start, w.end);
  if (!w.rows.length) { say(`SKIP — ${w.key} has no unconsumed messages`); return; }
  if (!w.replay && (await getWindow(w.key))?.status === 'posted') {
    say('SKIP —', w.key, 'already posted'); return;
  }

  const carry = (await getState(CARRY_KEY)) ?? {};
  const deck = compose(w.rows, { carry, endTs: w.end });
  if (deck.carry) await setState(CARRY_KEY, deck.carry);

  const consumed = deck.consumed.map(Number);
  if (deck.skip) {
    say('SKIP —', w.key, `(${deck.skip})`);
    if (!w.replay) {
      await markConsumed(w.key, consumed);
      await setWindow({ key: w.key, status: deck.skip, slides: deck.slides.length });
    }
    return;
  }

  say(`${w.key} — ${w.rows.length} msgs -> ${deck.slides.length} slides [${deck.slides.map(s => s.type)}]`);

  const api = (process.env.PUBLISHER || 'api') === 'api';
  const dir = join('./out', w.key.replace(/:/g, ''));
  const { files, shed } = await renderDeck(deck, dir, { format: api ? 'jpeg' : 'png' });
  if (shed.length) say('tripwire shed', shed.length, 'row(s):', shed.map(s => s.headline.slice(0, 40)));
  say('rendered', files.length, 'slide(s)');

  let result;
  try {
    // Both publishers expose the same upload/remove/publish, so
    // everything above this line is identical. The browser one
    // uploads nothing - it hands the local files to instagram.com.
    const { upload, remove, publish } = api
      ? await import('./publish/api.js')
      : await import('./publish/browser.js');
    const prefix = w.key.replace(/:/g, '');
    const urls = await upload(files, prefix);
    say('uploaded', urls.length);
    try {
      result = await publish(urls, deck.caption, { dryRun: DRY });
      say(DRY ? `DRY RUN OK — ${deck.slides.length} slides built, NOT published`
              + (result.note ? ` (${result.note})` : '')
              : `POSTED ${result.permalink ?? result.id}`);
    } finally {
      await remove(files, prefix);
    }
  } catch (e) {
    say('FAILED —', e.message);
    await setWindow({ key: w.key, status: 'failed', slides: deck.slides.length, shed, error: e.message });
    await logRun(w.key, 'publish', false, e.message);
    await notify(`❌ ${w.key}\n${e.message}`);
    process.exitCode = 1;
    return;
  }

  if (DRY) { say('dry run — window left open'); return; }
  await markConsumed(w.key, consumed);
  await setWindow({ key: w.key, status: 'posted', slides: deck.slides.length, shed,
    posted_at: Math.floor(Date.now() / 1000) });
  await logRun(w.key, 'publish', true, result.permalink ?? result.id);
  await notify(`✅ ${w.key} — ${deck.slides.length} slides\n${result.permalink ?? ''}`);
}

async function notify(text) {
  try {
    const c = await connect(); await c.connect();
    await alert(c, text); await c.disconnect();
  } catch (e) { console.warn('telegram alert failed:', e.message); }
}

// gramJS keeps an update loop alive after the work is done — without an
// explicit exit the process idles until the runner's job timeout, which
// is how one failed tick ate seven minutes of a one-hour slot.
// RESUME=1 lifts a pause without anyone touching SQL — it is a
// checkbox on the workflow, because the person who needs it is
// looking at a red run, not a psql prompt.
if (process.env.RESUME === '1') {
  const n = await clearFailed();
  say(`resume — retired ${n} failed window(s)`);
}

try { await main(); } finally { await close(); }
process.exit(process.exitCode ?? 0);
