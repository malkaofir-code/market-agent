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
  storyMessagesIn, oldestUnstoriedBefore, markStoried, storiesToday, retireStories,
  upsertWindow, setWindow, getWindow, postsToday, lastPostAt, recentOutcomes, clearFailed,
  logRun, getState, setState, getToken, setToken, close,
} from './db.js';
import { compose, composeStories, windowOf, WIN } from './compose.js';
import { renderDeck } from './render.js';
import { connect, alert } from './tg.js';

const DRY = process.argv.includes('--dry') || process.env.DRY_RUN === '1';
// Two tracks over the same channel. A digest summarises the hours
// since the last one; stories tell the last hour as it happened. They
// read the same messages through separate cursors, so neither one
// starves the other.
const STORIES = process.argv.includes('--stories') || process.env.MODE === 'stories';
// Scheduled ticks render for review only; publishing needs a person.
const REVIEW = process.env.REVIEW === '1';
const CARRY_KEY = 'tape-carry';
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// A stray rejection must never take the run down mid-publish.
//
// gramJS's update loop outlives the ingest that started it and throws
// TIMEOUT into the void about forty seconds later. Node's default is
// to treat that as fatal, so on 30 Aug it killed the process between
// story 2 and story 3 — two boards on Instagram, the third never
// built, and no row written to say any of it had happened.
//
// Every real failure path below is awaited and recorded. Nothing that
// reaches here is load-bearing, so it is logged and stepped over.
process.on('unhandledRejection', e => {
  say('unhandled rejection ignored:', e?.message ?? e);
});

// ── rails ────────────────────────────────────────────────────
async function blocked({ stories = false } = {}) {
  const ks = process.env.KILL_SWITCH || './PAUSED';
  if (existsSync(ks)) return `kill switch present (${ks})`;

  const hour = Number(new Intl.DateTimeFormat('en-GB',
    { timeZone: process.env.TZ || 'Asia/Jerusalem', hour: '2-digit', hour12: false })
    .format(new Date()));
  const from = Number(process.env.ACTIVE_FROM_HOUR ?? 7);
  const to = Number(process.env.ACTIVE_TO_HOUR ?? 24);
  if (hour < from || hour >= to) return `outside active hours (${hour}:00, active ${from}-${to})`;

  // The post-rate rails are about POSTS. A story is a different thing
  // on a different clock — three of them at :16 must not be silenced
  // because a digest went out at 15:31, and they have their own cap
  // inside runStories(). The kill switch, the active hours and the
  // failure latch apply to both.
  if (!stories) {
    const cap = Number(process.env.MAX_POSTS_PER_DAY || 12);
    const n = await postsToday();
    if (n >= cap) return `daily cap reached (${n}/${cap})`;

    const gap = Number(process.env.MIN_MINUTES_BETWEEN_POSTS || 12);
    const last = await lastPostAt();
    if (last && (Date.now() / 1000 - last) < gap * 60)
      return `only ${Math.round((Date.now() / 1000 - last) / 60)}min since last post (min ${gap})`;
  }

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

/**
 * The story track, end to end.
 *
 * Deliberately simpler than the digest: no retire loop, no
 * merge-forward, no review gate. A story is about the hour it belongs
 * to, so an hour that went by unstoried is not worth telling later —
 * it is skipped, and the digest will still summarise it.
 */
async function runStories() {
  const nowWindow = windowOf(Math.floor(Date.now() / 1000)).start;
  const maxBehind = Number(process.env.MAX_STORY_LAG_WINDOWS ?? 2);

  // Everything too old to be "now", retired in one statement before
  // anything else happens.
  //
  // This used to retire a SINGLE window per run and return. The cursor
  // arrived null on every message in the table, so the track opened on
  // a backlog of weeks and advanced one hour per hour — it would have
  // spent a fortnight walking through August and never once reached
  // today. That is why the first day of stories posted nothing at all.
  const cutoff = nowWindow - maxBehind * WIN * 60;
  const retired = await retireStories(cutoff);
  if (retired) say(`retired ${retired} message(s) older than the story window`);

  const oldest = await oldestUnstoriedBefore(nowWindow);
  if (oldest == null) { say('SKIP — nothing unstoried'); return; }

  const w = windowOf(Number(oldest));

  const rows = await storyMessagesIn(w.start, w.end);
  if (!rows.length) { say(`SKIP — ${w.key} has nothing unstoried`); return; }

  const cap = Number(process.env.MAX_STORIES_PER_DAY || 40);
  const told = await storiesToday();
  if (!DRY && told >= cap) { say(`SKIP — story cap reached (${told}/${cap})`); return; }

  const deck = composeStories(rows, { carry: (await getState(CARRY_KEY)) ?? {}, endTs: w.end });
  const consumed = deck.consumed.map(Number);
  if (deck.skip) {
    say('SKIP —', w.key, `(${deck.skip})`);
    await markStoried(deck.key ?? `S:${w.key}`, consumed);
    return;
  }
  // The carry is the tape's running level and belongs to whichever
  // track saw the snapshot last — both write it, and both are right.
  if (deck.carry) await setState(CARRY_KEY, deck.carry);

  say(`${deck.key} — ${rows.length} msgs -> ${deck.slides.length} story(ies) `
    + `[${deck.slides.map(x => x.type)}]`);

  const dir = join('./out', deck.key.replace(/[:]/g, '').replace('S', 'S-'));
  const { files } = await renderDeck(deck, dir, { format: 'jpeg', story: true });
  say('rendered', files.length, 'story board(s)');

  if (REVIEW) {
    say(`REVIEW — ${files.length} stories rendered for ${deck.key}, NOT published`);
    await markStoried(deck.key, consumed);
    await upsertWindow(deck.key, w.start, w.end);
    await setWindow({ key: deck.key, status: 'review', slides: files.length });
    return;
  }

  const { upload, remove, publishStory } = await import('./publish/api.js');
  const prefix = deck.key.replace(/[:]/g, '');
  const urls = await upload(files, prefix);
  say('uploaded', urls.length);

  // Claim the hour BEFORE publishing, not after.
  //
  // The digest marks its messages once the post is safely up, because
  // a digest that is lost can simply be told again. A story cannot:
  // if the run dies part-way through the set — which is exactly what
  // happened on 30 Aug — the messages stay unclaimed, the next tick
  // finds the same hour still inside its lag window, and re-tells the
  // boards that are already live. Duplicates on the account are worse
  // than a missed hour, and the digest still carries the content
  // either way.
  // A dry run claims nothing — it is a rehearsal, and the hour still
  // belongs to whoever tells it for real.
  if (!DRY) {
    await upsertWindow(deck.key, w.start, w.end);
    await markStoried(deck.key, consumed);
  }

  // One at a time, and a failure on the third does not undo the first
  // two. Instagram counts each story against the same 100-per-24h
  // ceiling as a post, which is why they are capped separately above.
  let posted = 0, failure = null;
  try {
    for (const [i, url] of urls.entries()) {
      try {
        const r = await publishStory(url, { dryRun: DRY });
        posted++;
        say(DRY ? `  DRY story ${i + 1}/${urls.length} built, NOT published`
                : `  STORY ${i + 1}/${urls.length} posted ${r.id}`);
      } catch (e) { failure = e; say(`  story ${i + 1} FAILED — ${e.message}`); break; }
    }
  } finally {
    await remove(files, prefix);
  }

  if (DRY) { say(`DRY RUN OK — ${files.length} stories built`); return; }

  if (posted) {
    await setWindow({ key: deck.key, status: 'posted', slides: posted,
      posted_at: Math.floor(Date.now() / 1000),
      error: failure ? `${posted}/${urls.length}: ${failure.message}` : null });
    await logRun(deck.key, 'stories', true, `${posted}/${urls.length}`);
    say(`POSTED ${posted} story(ies)`);
    // Stories used to report only their failures, which made "three
    // went up" and "the track is stuck in August" look identical from
    // the outside — for a whole day.
    await notify(`📱 ${deck.key} — ${posted} story(ies) live`);
  } else {
    await setWindow({ key: deck.key, status: 'failed', slides: 0, error: failure?.message });
    await logRun(deck.key, 'stories', false, failure?.message ?? 'nothing posted');
    await notify(`❌ stories ${deck.key}\n${failure?.message ?? 'nothing posted'}`);
    process.exitCode = 1;
  }
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

  // A review run publishes nothing, so the post-rate guards have no
  // opinion about it — let it render even at the daily cap.
  const stop = (DRY || REVIEW) ? null : await blocked({ stories: STORIES });
  if (stop) { say('SKIP —', stop); return; }

  // The story track shares the kill switch, the active hours and the
  // failure latch above, and nothing else: its own cap lives inside.
  if (STORIES) return runStories();

  // Three digests a day, not one an hour — stories carry the hour now,
  // and a digest that repeats them an hour later is the same news
  // twice. The gate is HERE rather than in the cron expression
  // because pg_cron thinks in UTC and Israel moves twice a year; this
  // reads the local hour, so 08:31 stays 08:31 through the change.
  const hours = (process.env.DIGEST_HOURS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (hours.length && process.env.IGNORE_SCHEDULE !== '1' && !DRY
      && !process.argv.some(a => a.startsWith('--window='))) {
    const hour = new Intl.DateTimeFormat('en-GB',
      { timeZone: process.env.TZ || 'Asia/Jerusalem', hour: '2-digit', hour12: false })
      .format(new Date());
    if (!hours.includes(String(Number(hour)))) {
      say(`SKIP — ${hour}:xx is not a digest hour (${hours.join(', ')})`);
      return;
    }
  }

  let w = await pickWindow();
  if (!w) { say('SKIP — nothing unconsumed'); return; }

  // Old news is worse than no news - but retire the whole stale
  // backlog in ONE pass, not one window per run. The migration
  // arrived carrying a week of unconsumed history, and retiring a
  // single window per hourly tick would have spent three days
  // replaying August before reaching today. The same loop absorbs
  // any future outage.
  // MAX_WINDOW_AGE_MIN=0 disables retirement entirely: nothing that was
  // never posted is ever thrown away, however far behind we are. The
  // backlog then drains oldest-first, throttled by
  // MIN_MINUTES_BETWEEN_POSTS and MAX_POSTS_PER_DAY.
  const maxAge = Number(process.env.MAX_WINDOW_AGE_MIN ?? 0);
  const stale = x => maxAge > 0 && Math.floor((Date.now() / 1000 - x.end) / 60) > maxAge;
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
      // Every skip left here means the window genuinely has nothing to
      // post — no messages, or nothing but futures snapshots. A deck
      // with even one slide never reaches this branch any more.
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

  // ── the review gate ──────────────────────────────────────
  // Scheduled ticks render and stop. The slides go up as a run
  // artifact and the window is marked 'review'; nothing reaches
  // Instagram until a person dispatches that window with publish
  // ticked. The messages are consumed either way, so the next tick
  // advances to fresh news instead of re-rendering the same deck
  // every hour — a replay (--window=) ignores consumed_by, so an
  // approved deck can still be published hours later.
  if (REVIEW && !w.replay) {
    say(`REVIEW — ${deck.slides.length} slides rendered for ${w.key}, NOT published`);
    await markConsumed(w.key, consumed);
    await setWindow({ key: w.key, status: 'review', slides: deck.slides.length, shed });
    await logRun(w.key, 'review', true, `${files.length} slide(s)`);
    await notify(`🖼️ ${w.key} — ${deck.slides.length} slides ready for review\n`
      + `Actions → tick → window=${w.key}, publish ✔`);
    return;
  }

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
  let c = null;
  try {
    c = await connect(); await c.connect();
    await alert(c, text);
  } catch (e) { console.warn('telegram alert failed:', e.message); }
  finally {
    if (c) { try { await c.disconnect(); } catch {} try { await c.destroy(); } catch {} }
  }
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
