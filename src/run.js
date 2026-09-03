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
  storyMessagesIn, oldestUnstoriedBefore, markStoried, storiesToday, retireStories, unretireStoriesSince,
  setPublished, publishedSince, putInsight, performanceBy,
  lastStoryAt,
  upsertWindow, setWindow, getWindow, postsToday, lastPostAt, recentOutcomes, clearFailed,
  logRun, getState, setState, getToken, setToken, close,
} from './db.js';
import { compose, composeStories, windowOf, WIN } from './compose.js';
import { pickTemplate, pickStoryTemplate, remember, byId } from './templates.js';
import { renderDeck } from './render.js';
import { connect, alert } from './tg.js';

const DRY = process.argv.includes('--dry') || process.env.DRY_RUN === '1';
// Two tracks over the same channel. A digest summarises the hours
// since the last one; stories tell the last hour as it happened. They
// read the same messages through separate cursors, so neither one
// starves the other.
const STORIES = process.argv.includes('--stories') || process.env.MODE === 'stories';
const INSIGHTS = process.argv.includes('--insights') || process.env.MODE === 'insights';
// Scheduled ticks render for review only; publishing needs a person.
const REVIEW = process.env.REVIEW === '1';
// Telling an hour late, on purpose.
//
// The story track drops any hour it did not tell at the time — that
// is the design, and it is right: a story is about the hour it
// belongs to. But when the track itself was the thing that broke, the
// day's news was never told at all, and dropping it a second time
// just to honour a rule about timeliness serves nobody. Catch-up is
// therefore explicit and never scheduled: it reaches back to this
// morning, not into last week, and every board it makes is stamped
// with the hour it is ABOUT rather than announcing itself as "now".
const CATCHUP = process.env.CATCHUP === '1';
let recovered = false;   // the catch-up recovers once, not once per window

/** Local midnight, in unix seconds — the floor a catch-up reaches to. */
function dayStart() {
  const tz = process.env.TZ || 'Asia/Jerusalem';
  const [d, m, y] = new Intl.DateTimeFormat('en-GB', { timeZone: tz,
    day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date()).split('/');
  // Midnight local, found by asking what UTC instant wears that wall clock.
  const guess = Date.parse(`${y}-${m}-${d}T00:00:00Z`) / 1000;
  const offMin = (guess - Math.floor(Date.parse(
    new Intl.DateTimeFormat('sv-SE', { timeZone: tz, dateStyle: 'short', timeStyle: 'medium' })
      .format(new Date(guess * 1000)).replace(' ', 'T') + 'Z') / 1000));
  return guess + offMin;
}
const CARRY_KEY = 'tape-carry';
// One shared memory across BOTH tracks. Separate lists would let an
// hour's stories and the digest that follows them land on the same
// template, which is exactly the repetition the rotation exists to
// prevent — the two appear side by side on the profile.
const TPL_KEY = 'template-recent';
// Boards told since the last Telegram card. A set is two or three
// boards, so "every sixth" only means anything if the count survives
// between runs.
const TALLY_KEY = 'story-tally';

/**
 * The next look, and the promise not to reuse it.
 *
 * Seeded from the window key so a replay reproduces the deck it
 * replayed instead of inventing a new one.
 */
async function nextTemplate(key) {
  const recent = (await getState(TPL_KEY)) ?? [];
  const seed = [...key].reduce((a, c) => a + c.charCodeAt(0), 0);
  const t = pickTemplate(recent, seed);
  return { t, recent };
}
const keepTemplate = (recent, id) => setState(TPL_KEY, remember(recent, id));

// Stories rotate on their own memory. Sharing the posts' list would
// have been quietly wrong once the two stopped drawing from the same
// pool: a story template is a LAYOUT, a post template is an opening
// plus two grounds, and the ids do not overlap — one shared "recent"
// would have let a post exclude a story it has nothing to do with.
const STORY_TPL_KEY = 'story-template-recent';
async function nextStoryTemplate(key) {
  const recent = (await getState(STORY_TPL_KEY)) ?? [];
  const seed = [...key].reduce((a, c) => a + c.charCodeAt(0), 0);
  return { t: pickStoryTemplate(recent, seed), recent };
}
const keepStoryTemplate = (recent, id) => setState(STORY_TPL_KEY, remember(recent, id));
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
  // Catch-up still retires — just at a different line. Yesterday and
  // everything before it is gone either way; what it spares is the
  // hours of TODAY that the track owed and never delivered.
  // Today's hours were discarded by the very ticks that could not
  // publish them, so they are sitting in the table marked retired.
  // Hand them back before anything else looks for work — otherwise a
  // catch-up would faithfully find nothing to catch up on.
  if (CATCHUP && !recovered) {
    recovered = true;
    const back = await unretireStoriesSince(dayStart());
    if (back) say(`recovered ${back} message(s) the failed ticks had retired`);
  }

  const cutoff = CATCHUP ? dayStart() : nowWindow - maxBehind * WIN * 60;
  const retired = await retireStories(cutoff);
  if (retired) say(`retired ${retired} message(s) older than the story window`);

  const oldest = await oldestUnstoriedBefore(nowWindow);
  if (oldest == null) { say('SKIP — nothing unstoried'); return 'none'; }

  const w = windowOf(Number(oldest));

  const rows = await storyMessagesIn(w.start, w.end);
  if (!rows.length) { say(`SKIP — ${w.key} has nothing unstoried`); return 'none'; }

  const cap = Number(process.env.MAX_STORIES_PER_DAY || 40);
  const told = await storiesToday();
  if (!DRY && told >= cap) { say(`SKIP — story cap reached (${told}/${cap})`); return 'none'; }

  // The cron sets the ninety-minute rhythm; this is the belt that
  // holds it if a dispatch fires twice or a catch-up run lands early.
  // The gap is the cron's ninety minutes held in code. A catch-up is
  // deliberately telling several hours in one sitting, so the rail
  // that exists to stop that is the one thing it must not obey.
  const gap = CATCHUP ? 0 : Number(process.env.MIN_MINUTES_BETWEEN_STORIES || 0);
  if (!DRY && gap) {
    const last = await lastStoryAt();
    const since = last ? Math.round((Date.now() / 1000 - last) / 60) : null;
    if (since != null && since < gap) {
      say(`SKIP — only ${since}min since the last story (min ${gap})`);
      return 'none';
    }
  }

  const { t: tpl, recent: tplRecent } = await nextStoryTemplate(`S:${w.key}`);
  const tally = Number((await getState(TALLY_KEY)) ?? 0);
  const deck = composeStories(rows, {
    carry: (await getState(CARRY_KEY)) ?? {}, endTs: w.end, template: null, tally,
    catchup: CATCHUP, story: tpl.layout, palette: tpl.pal });
  const consumed = deck.consumed.map(Number);
  if (deck.skip) {
    say('SKIP —', w.key, `(${deck.skip})`);
    await markStoried(deck.key ?? `S:${w.key}`, consumed);
    return 'done';
  }
  // The carry is the tape's running level and belongs to whichever
  // track saw the snapshot last — both write it, and both are right.
  if (deck.carry) await setState(CARRY_KEY, deck.carry);

  say(`${deck.key} — ${rows.length} msgs -> ${deck.slides.length} story(ies) `
    + `[${deck.slides.map(x => x.type)}] · template ${tpl.id} ${tpl.name}`);

  const dir = join('./out', deck.key.replace(/[:]/g, '').replace('S', 'S-'));
  const { files } = await renderDeck(deck, dir, { format: 'jpeg', story: true });
  say('rendered', files.length, 'story board(s)');

  if (REVIEW) {
    say(`REVIEW — ${files.length} stories rendered for ${deck.key}, NOT published`);
    await markStoried(deck.key, consumed);
    await upsertWindow(deck.key, w.start, w.end);
    await setWindow({ key: deck.key, status: 'review', slides: files.length });
    return 'done';
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
  let posted = 0, failure = null, firstId = null;
  try {
    for (const [i, url] of urls.entries()) {
      try {
        const r = await publishStory(url, { dryRun: DRY });
        posted++;
        firstId ??= r.id ?? null;
        say(DRY ? `  DRY story ${i + 1}/${urls.length} built, NOT published`
                : `  STORY ${i + 1}/${urls.length} posted ${r.id}`);
      } catch (e) { failure = e; say(`  story ${i + 1} FAILED — ${e.message}`); break; }
    }
  } finally {
    await remove(files, prefix);
  }

  if (DRY) { say(`DRY RUN OK — ${files.length} stories built`); return 'done'; }

  if (posted) {
    await keepStoryTemplate(tplRecent, tpl.id);
    // Only after something actually went up — a set that failed on its
    // first board must not push the card an hour further away.
    if (deck.tally != null) await setState(TALLY_KEY, deck.tally);
    await setWindow({ key: deck.key, status: 'posted', slides: posted,
      posted_at: Math.floor(Date.now() / 1000),
      error: failure ? `${posted}/${urls.length}: ${failure.message}` : null });
    // A set is one board now, so the first id IS the set. If it grows
    // back to three this still measures the opener, which is the board
    // that decides whether the other two are ever seen.
    if (firstId) await setPublished(deck.key, { media_id: firstId,
      choices: { template: String(tpl.id), name: tpl.name, cover: deck.slides[0]?.type,
        types: deck.slides.map(x => x.type) } });
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
    return 'failed';
  }
  return 'done';
}

/**
 * Reading the account back.
 *
 * Runs once a day and pulls the numbers for everything published in
 * the last fortnight, then says which choices paid. Ranked on saves
 * and shares against reach, never on likes: a like is the cheapest
 * thing a viewer can do and predicts least about whether the next
 * post reaches anyone at all.
 *
 * Two pulls matter and this makes both: a post an hour old and the
 * same post three days later are different questions, and the rows
 * are a series rather than an overwrite so the difference survives.
 *
 * Nothing here writes to the publishing tables and nothing it
 * discovers changes a decision on its own. The agent does not get to
 * tune itself on three data points; the numbers are for a person to
 * read and decide with.
 */
async function runInsights() {
  const { mediaInsights, accountInsights } = await import('./publish/insights.js');
  const days = Number(process.env.INSIGHT_DAYS || 14);
  const rows = await publishedSince(days);
  if (!rows.length) {
    say('SKIP — nothing published with a media id yet.');
    say('       Media ids are recorded from this build forward; the');
    say('       first numbers arrive after the next post goes out.');
    return;
  }

  let got = 0, gone = 0;
  for (const r of rows) {
    let data = null;
    try { data = await mediaInsights(r.media_id, r.kind); }
    catch (e) { say(`  ${r.key} — ${e.message}`); continue; }
    // A story past its 24 hours reports nothing. That is not a
    // failure, it is the medium.
    if (!data) { gone++; continue; }
    await putInsight({
      media_id: r.media_id, wkey: r.key, kind: r.kind,
      age_min: Math.round((Date.now() / 1000 - Number(r.posted_at)) / 60),
      reach: data.reach ?? null, views: data.views ?? null,
      likes: data.likes ?? null, comments: data.comments ?? null,
      saved: data.saved ?? null, shares: data.shares ?? null,
      replies: data.replies ?? null,
      profile_visits: data.profile_visits ?? null, follows: data.follows ?? null,
      raw: data,
    });
    got++;
  }
  say(`pulled ${got} of ${rows.length}${gone ? ` (${gone} expired)` : ''}`);

  try {
    const acc = await accountInsights(7);
    if (acc) say('account, 7d:', Object.entries(acc).map(([k, v]) => `${k} ${v}`).join(' · '));
  } catch (e) { say('account insights unavailable:', e.message); }

  // ── what paid ────────────────────────────────────────────
  // Two of anything is not a finding, so the grouping drops any
  // bucket with fewer than two posts in it rather than announcing
  // that template 17 is the best on the strength of one lucky
  // afternoon.
  const lines = [];
  for (const [label, field] of [['opening', 'cover'], ['template', 'template']]) {
    const by = await performanceBy(field, 30, 'post').catch(() => []);
    if (!by.length) continue;
    lines.push(`${label}:`);
    for (const b of by.slice(0, 6))
      lines.push(`  ${String(b.k).padEnd(12)} n=${b.n}  reach ${b.reach}  saves+shares ${b.spread} (${b.spread_pct}%)`);
  }
  if (lines.length) { say('— what paid, 30d —'); lines.forEach(l => say(l)); }
  else say('not enough posts measured yet to rank anything — needs two per bucket.');
}

async function main() {
  // Reading the account back is not publishing: it ingests nothing,
  // and the kill switch, the active hours and the failure latch have
  // no opinion about a run that only asks questions. It does still
  // need the live token, so it sits after that and before every rail.
  if (process.argv.includes('--ingest') && !INSIGHTS) {
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

  if (INSIGHTS) return runInsights();

  // A review run publishes nothing, so the post-rate guards have no
  // opinion about it — let it render even at the daily cap.
  const stop = (DRY || REVIEW) ? null : await blocked({ stories: STORIES });
  if (stop) { say('SKIP —', stop); return; }

  // The story track shares the kill switch, the active hours and the
  // failure latch above, and nothing else: its own cap lives inside.
  if (STORIES && !CATCHUP) return runStories();
  if (STORIES) {
    // One window per run is the normal rhythm; a catch-up walks the
    // day until it runs out of untold hours or hits the daily cap,
    // whichever comes first. The guard is the number of windows in a
    // day, so a bug here costs one wasted run and not an afternoon of
    // stories.
    say('CATCH-UP — telling every hour of today the track still owes');
    for (let i = 0; i < 24; i++) {
      const r = await runStories();
      if (r !== 'done') { say(`catch-up stopped after ${i} set(s) — ${r}`); return; }
    }
    say('catch-up hit its 24-window guard'); return;
  }

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
  const { t: tpl, recent: tplRecent } = await nextTemplate(w.key);
  const deck = compose(w.rows, { carry, endTs: w.end, template: tpl.id });
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

  say(`${w.key} — ${w.rows.length} msgs -> ${deck.slides.length} slides `
    + `[${deck.slides.map(s => s.type)}] · template ${tpl.id} ${tpl.name}`);

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
  await keepTemplate(tplRecent, tpl.id);
  await setWindow({ key: w.key, status: 'posted', slides: deck.slides.length, shed,
    posted_at: Math.floor(Date.now() / 1000) });
  // The result is worthless without the decision that produced it.
  await setPublished(w.key, { media_id: result.id, permalink: result.permalink,
    choices: { template: String(tpl.id), name: tpl.name, cover: deck.slides[0]?.type,
      types: deck.slides.map(x => x.type), slot: deck.slot ?? null } });
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
