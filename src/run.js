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
  lastStoryAt, reelsToday, lastReelAt,
  upsertWindow, setWindow, getWindow, postsToday, lastPostAt, recentOutcomes, clearFailed,
  putClaims, bestHit, markClaimShown, claimScore, callbacksToday, publishedMessages,
  logRun, getState, setState, getToken, setToken, close,
} from './db.js';
import { compose, composeStories, composeReel, composeCallback, windowOf, WIN } from './compose.js';
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
const REEL = process.argv.includes('--reel') || process.env.MODE === 'reel';
// The fourth track. Not a news track at all: it reads what the account
// already published and asks the market whether it was right.
const CALLBACK = process.argv.includes('--callback') || process.env.MODE === 'callback';
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
/** The local wall clock as YYYY-MM-DDTHH — a key that is unique per hour. */
function stampKey(at = Math.floor(Date.now() / 1000)) {
  const tz = process.env.TZ || 'Asia/Jerusalem';
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric',
    month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
    .formatToParts(new Date(at * 1000))
    .reduce((a, x) => (a[x.type] = x.value, a), {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}`;
}

/** The local hour, as a number. Every schedule gate reads this. */
const localHour = () => Number(new Intl.DateTimeFormat('en-GB',
  { timeZone: process.env.TZ || 'Asia/Jerusalem', hour: '2-digit', hour12: false })
  .format(new Date()));

const TZ = process.env.TZ || 'Asia/Jerusalem';

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
// The source channel's numeric identity, kept so a rename of its
// @username cannot cut the agent off from it again.
const PEER_KEY = 'tg-peer';

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
async function blocked({ stories = false, reel = false } = {}) {
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
  // inside runStories(). A reel is a third thing again, on a clock of
  // hours rather than minutes, with its rails inside runReel(). The
  // kill switch, the active hours and the failure latch apply to all
  // three.
  if (!stories && !reel) {
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
    await recordClaims(rows, deck, { wkey: deck.key, media_id: firstId,
      posted_at: Math.floor(Date.now() / 1000) });
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

/**
 * File every checkable claim the post just made.
 *
 * Only messages that actually reached the board are read. A claim is
 * the account saying something in public; a message that sat in the
 * window and never appeared on a slide or in the caption said nothing,
 * and a callback card built on one would quote a headline nobody was
 * ever shown. The deck as published is the evidence, so that is what
 * is searched — slides and caption together.
 */
async function recordClaims(rows, deck, meta) {
  if (process.env.CLAIMS === '0') return 0;
  try {
    const { claimsFrom } = await import('./claims.js');
    const shown = JSON.stringify(deck);
    const out = [];
    for (const r of rows) {
      const head = String(r.text ?? '').split('\n')[0].replace(/[\u200e\u200f]/g, '').trim();
      // 24 characters, not the whole headline: a reel card trims to
      // nine words and a story board can squeeze, so an exact match
      // would file nothing at all from the two tracks that publish most.
      if (head.length < 12 || !shown.includes(head.slice(0, 24))) continue;
      out.push(...claimsFrom(r));
    }
    const n = await putClaims(out, meta);
    if (n) say(`filed ${n} claim(s) from ${meta.wkey}`);
    return n;
  } catch (e) {
    // A claim that failed to file costs a callback in three days. It
    // must never cost the post that is already live.
    say('claims NOT filed —', e.message);
    return 0;
  }
}

/**
 * The callback track — the only thing on this account that looks back.
 *
 * Everything else answers "what just happened". This answers "and were
 * we right", which is the only question that compounds: a stranger who
 * sees a board saying what we published on Monday and what the market
 * did by Wednesday learns something about the account, not about the
 * news. It runs once a day, publishes at most one board, and publishes
 * nothing at all on a day when no claim settled — which will be most
 * days, and is the correct behaviour.
 */
async function runCallback() {
  // One slot a day, gated on the LOCAL hour — the cron dispatches
  // hourly because pg_cron is UTC and Israel moves its clocks twice a
  // year. Morning, because the number on the board is a CLOSE: at
  // 09:00 Israel last night's US session is settled and final, and
  // anything earlier in the day would be quoting a price that is
  // still moving.
  const hours = (process.env.CALLBACK_HOURS || '9').split(',').map(x => x.trim()).filter(Boolean);
  if (hours.length && process.env.IGNORE_SCHEDULE !== '1' && !DRY
      && !hours.includes(String(localHour()))) {
    say(`SKIP — ${localHour()}:xx is not a callback hour (${hours.join(', ')})`);
    return 'none';
  }

  // ── the backfill ─────────────────────────────────────────
  // Without it the first callback card is three days away, on an
  // account that has been publishing for weeks and already has the
  // claims sitting in its own archive. Runs once — the unique key on
  // (tg_id, symbol, kind) makes a second pass a no-op — and reaches
  // only as far back as a claim could still be settling.
  const backDays = Number(process.env.BACKFILL_DAYS || 0);
  if (backDays > 0) {
    const { claimsFrom } = await import('./claims.js');
    const rows = await publishedMessages(backDays);
    let filed = 0;
    for (const r of rows) {
      const cs = claimsFrom(r);
      if (!cs.length) continue;
      filed += await putClaims(cs, { wkey: r.wkey, media_id: r.media_id,
        permalink: r.permalink, posted_at: Number(r.posted_at) });
    }
    say(`backfill — ${rows.length} published message(s) read, ${filed} claim(s) filed`);
  }

  const { checkAll } = await import('./callback.js');
  const res = await checkAll(say);
  say(`checked ${res.checked} claim(s) — ${res.hits} hit, ${res.misses} miss, ${res.open ?? 0} still open`);

  const score = await claimScore(30);
  for (const r of score) say(`  30d ${r.kind}: ${r.hit} hit / ${r.miss} miss / ${r.open} open`);

  const cap = Number(process.env.MAX_CALLBACKS_PER_DAY || 1);
  const done = await callbacksToday();
  if (!DRY && done >= cap) { say(`SKIP — callback cap reached (${done}/${cap})`); return 'none'; }

  const hit = await bestHit();
  if (!hit) { say('SKIP — nothing settled worth showing'); return 'none'; }

  const deck = composeCallback(hit);
  say(`${deck.key} — ${hit.kind} on ${hit.symbol}: ${hit.move_pct}% in ${hit.days_after} session(s)`);

  const dir = join('./out', deck.key.replace(/[:]/g, '').replace('C', 'C-'));
  const { files } = await renderDeck(deck, dir, { format: 'jpeg', story: true });
  if (!files.length) { say('SKIP — nothing rendered'); return 'none'; }

  if (DRY || REVIEW) {
    say(`${DRY ? 'DRY' : 'REVIEW'} — callback board rendered, NOT published (${files[0]})`);
    return 'done';
  }

  const { upload, remove, publishStory } = await import('./publish/api.js');
  const prefix = deck.key.replace(/[:]/g, '');
  const urls = await upload(files, prefix);

  // The claim is marked BEFORE the board goes up, for the same reason
  // the story track claims its hour first: a run that dies half way
  // must not show the same callback again tomorrow.
  await upsertWindow(deck.key, Number(hit.posted_at), Math.floor(Date.now() / 1000));
  await markClaimShown(hit.id);

  let r = null, failure = null;
  try { r = await publishStory(urls[0], { dryRun: false }); }
  catch (e) { failure = e; }
  finally { await remove(files, prefix); }

  if (r) {
    await setWindow({ key: deck.key, status: 'posted', slides: 1,
      posted_at: Math.floor(Date.now() / 1000) });
    await setPublished(deck.key, { media_id: r.id ?? null,
      choices: { kind: hit.kind, symbol: hit.symbol, move: hit.move_pct,
        days: hit.days_after, claim: hit.id } });
    await logRun(deck.key, 'callback', true, `${hit.symbol} ${hit.move_pct}%`);
    say(`POSTED callback ${r.id}`);
    await notify(`🎯 ${hit.kind === 'forecast' ? 'אמרנו והתממש' : 'עדכון המשך'} — `
      + `${hit.asset} ${hit.move_pct}% תוך ${hit.days_after} ימי מסחר\n${hit.headline ?? ''}`);
  } else {
    await setWindow({ key: deck.key, status: 'failed', slides: 0, error: failure?.message });
    await logRun(deck.key, 'callback', false, failure?.message ?? 'nothing posted');
    await notify(`❌ callback ${deck.key}\n${failure?.message ?? 'nothing posted'}`);
  }
  return 'done';
}

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

/**
 * The reel track: one a day, and the only thing this account
 * publishes that a stranger can see.
 *
 * It reads the same window a digest would and consumes nothing —
 * deliberately. A reel is a second telling of the day for a different
 * audience, not a competitor for the carousel's material, so it never
 * marks a message used and never blocks a digest.
 */
async function runReel() {
  const { haveFfmpeg, buildReel, audioBed } = await import('./reel.js');
  // Loud, not quiet. A reel track that skips itself every day because
  // the encoder is missing looks exactly like a reel track that has
  // nothing to say — which is the failure mode that cost this account
  // seven silent hours in September.
  if (!await haveFfmpeg()) {
    say('SKIP — ffmpeg not on this runner');
    if (!DRY) {
      await notify('❌ reel — ffmpeg is not installed on the runner, so no reel was built.');
      process.exitCode = 1;
    }
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const day = dayStart();

  // ── the reel's own two rails ─────────────────────────────
  // One or two a day, hours apart. The cron owns the rhythm; these
  // are the belt that holds it when a dispatch fires twice or a hand
  // dispatches one on top of the schedule. Same shape as the story
  // rails, and counted from local midnight for the same reason.
  const cap = Number(process.env.MAX_REELS_PER_DAY || 2);
  const made = await reelsToday();
  if (!DRY && made >= cap) { say(`SKIP — reel cap reached (${made}/${cap})`); return; }

  // 'now' on the dispatch lifts the spacing rail as well as the hour
  // gate — the same way 'catchup' lifts the story gap. Deliberately
  // telling a hand-dispatched reel to wait three hours makes the one
  // thing a person does at the console (test the change they just
  // pushed) the one thing the rails forbid. The daily cap still holds:
  // two is a real limit, three hours is a rhythm.
  const forced = process.env.IGNORE_SCHEDULE === '1';
  const gap = forced ? 0 : Number(process.env.MIN_MINUTES_BETWEEN_REELS || 180);
  const last = await lastReelAt();
  const since = last ? Math.round((now - last) / 60) : null;
  if (!DRY && gap && since != null && since < gap) {
    say(`SKIP — only ${since}min since the last reel (min ${gap})`);
    return;
  }

  // A reel covers what has happened SINCE the last one, not the whole
  // day over again. Both of the day's runs read the same table, so a
  // floor at midnight would have handed the evening reel the same four
  // beats the afternoon one already used — the same film twice, which
  // is worse than one film.
  // A forced dispatch reads the whole day, not just since the last
  // reel.
  //
  // The floor is right for the schedule — the evening reel should
  // cover what happened since the afternoon one, not repeat it — and
  // exactly wrong for a person testing a change they just pushed. At
  // 22:43 tonight it said "only 0 message(s) since the last reel",
  // which was true and completely useless: the reel had gone out
  // half an hour earlier and no news arrives in half an hour at that
  // time of night. A forced reel re-telling the day is a duplicate
  // nobody scheduled; a forced reel that cannot run at all is a
  // feature nobody can test.
  // "The day" at five in the afternoon is not midnight to now.
  //
  // The US session runs 16:30 to 23:00 local, so a reel at 17:00 that
  // reads from midnight has the day's build-up and almost none of its
  // trading. A rolling window catches last night's close as well as
  // this morning, which is what somebody means when they ask what the
  // market did.
  const back = Number(process.env.REEL_LOOKBACK_HOURS || 24) * 3600;
  const floor = (!forced && last && last > day) ? Number(last)
    : Math.min(day, now - back);
  const rows = await messagesInAll(floor, now);
  const need = Number(process.env.REEL_MIN_MESSAGES || 5);
  if (rows.length < need) {
    say(`SKIP — only ${rows.length} message(s) in the window (need ${need})`);
    return;
  }

  const { t: tpl, recent: tplRecent } = await nextTemplate(`R:${stampKey(now)}`);
  const deck = composeReel(rows, {
    carry: (await getState(CARRY_KEY)) ?? {}, template: tpl.id, endTs: now });
  if (deck.skip) { say('SKIP — reel', `(${deck.skip})`); return; }

  // One row per reel, not one row per day.
  //
  // composeReel keys itself off the first message it was given, so two
  // runs over an overlapping day could land on the same key — the
  // second silently overwriting the first's row, taking its media id
  // with it and leaving the cap above convinced only one had gone out.
  // The key carries the hour it was published in instead.
  deck.key = `R:${stampKey(now)}`;

  say(`${deck.key} — ${rows.length} msgs -> ${deck.slides.length} frames `
    + `[${deck.slides.map(x => x.type)}] · template ${tpl.id} ${tpl.name}`);

  // ── the headlines, in English ─────────────────────────────
  // The structured line — "Chip stocks, up three point seven five
  // percent" — is true and safe and is not news. A stranger scrolling
  // past learns that a number moved, never what happened. So the
  // headline itself gets translated, and the translation is checked
  // rather than trusted: any English line carrying a digit the Hebrew
  // does not have is thrown away and that card keeps the structured
  // line it already had. The account's own cards, the tape read and
  // the closing ask, are never sent at all.
  //
  // The translator is a small free model running on this machine. An
  // ANTHROPIC_API_KEY, if one is ever set, upgrades it and changes
  // nothing else — the guards are the same either way, because the
  // guards are the part that matters.
  // Translation exists to be SPOKEN. With the voice off nothing reads
  // these lines aloud and nothing puts them on screen — the cards are
  // Hebrew by design — so running a model to produce English that no
  // one will ever hear is a minute of runner time and a class of bug
  // for nothing. One condition rather than two env flags that can
  // disagree with each other.
  if (process.env.REEL_TRANSLATE !== '0' && process.env.REEL_VOICE !== '0') {
    try {
      const { translate, speakable } = await import('./translate.js');
      const src = deck.slides.map(sl => (sl.own ? null : sl.headline ?? null));
      const r = await translate(src);
      if (r) {
        const { connective } = await import('./compose.js');
        let used = 0;
        r.lines.forEach((en, i) => {
          if (!en) return;
          deck.slides[i].say = speakable(en);
          used++;
        });
        // The connectives go on LAST, over whatever each card ended up
        // saying — a translated headline or the structured line it
        // fell back to. Numbering only the translated ones produced
        // "Also," on the second story and nothing on the third when
        // the middle one had been rejected, which is the join sounding
        // like a fault rather than a sentence.
        let beat = 0;
        deck.slides.forEach(sl => {
          if (sl.own || !sl.say) return;
          sl.say = connective(beat++) + sl.say;
        });
        say(`translated ${used}/${src.filter(Boolean).length} headline(s) · ${r.backend}`);
        // A rejection is the guard doing its job, and it is the single
        // most interesting line this run can print — it means a model
        // tried to state a number the source never gave.
        for (const bad of r.rejected)
          say(`  REJECTED (${bad.why}) — ${bad.en || '(empty)'}\n     source: ${bad.he}`);
      }
    } catch (e) {
      say(`translation unavailable — ${e.message}; keeping the structured lines`);
    }
  }

  const dir = join('./out', deck.key.replace(/[:]/g, '').replace('R', 'R-'));
  // Two passes over the same deck: the market, then him and the line
  // on nothing. Rendered apart so they can be moved apart.
  const { files: bgs } = await renderDeck(deck, dir, { format: 'jpeg', layer: 'bg' });
  const { files: fgs } = await renderDeck(deck, dir, { format: 'png', layer: 'fg' });
  say('rendered', bgs.length, 'scene(s) in two planes');

  // ── the narration ────────────────────────────────────────
  // English over Hebrew boards, from lines compose built out of
  // figures the parser matched — never a translation, because a
  // paraphrased financial headline is a machine for inventing
  // numbers, and this account has already published one.
  //
  // Every failure here is soft on purpose. A missing Piper, a slow
  // model download, a line that will not synthesise: each costs the
  // narration and nothing else. A silent reel is a reel; no reel is
  // the day's only chance at a stranger, gone.
  const { holdsFor, MAX_HOLD, moodOf } = await import('./reel.js');
  let voices = null, holds = null;
  if (process.env.REEL_VOICE !== '0') {
    const { ensureVoice, sayAll, seconds } = await import('./voice.js');
    const t0 = Date.now();
    if (await ensureVoice()) {
      try {
        // All six lines in one process. One model load, not six.
        voices = await sayAll(deck.slides.map(sl => sl.say), dir);
        const secs = [];
        for (const [i, wav] of voices.entries()) {
          const len = wav ? await seconds(wav).catch(() => 0) : 0;
          // Silence beats a cut word. A line longer than a scene can
          // hold is dropped whole rather than played and chopped —
          // half a sentence over a card reads as broken; silence
          // reads as a choice.
          if (len > MAX_HOLD) {
            say(`  voice ${i + 1} dropped — ${len.toFixed(1)}s exceeds the ${MAX_HOLD}s scene cap`);
            voices[i] = null; secs.push(0);
          } else secs.push(len);
        }
        holds = holdsFor(secs, deck.slides.length);
        say(`narrated ${voices.filter(Boolean).length}/${deck.slides.length} scene(s)`
          + ` in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      } catch (e) {
        // Narration is the one part of a reel that is optional.
        say(`voice failed — ${e.message}; the reel goes out with the bed alone`);
        voices = null; holds = null;
      }
    } else {
      say('no voice on this runner — the reel goes out with the bed alone');
    }
  }

  const mp4 = join(dir, 'reel.mp4');
  const mood = moodOf(deck.slides);
  const built = await buildReel(bgs, fgs, mp4, { audio: audioBed(mood), voices, holds });
  say(`encoded ${built.seconds}s · ${built.scenes} scenes · ${built.audio} · ${mood}`);

  if (DRY) { say('DRY RUN OK —', mp4); return; }

  const { upload, remove, publishReel } = await import('./publish/api.js');
  const prefix = deck.key.replace(/[:]/g, '');
  // The cover goes up as an image beside the video so the profile
  // grid shows the hook rather than whatever frame Instagram picks.
  const urls = await upload([mp4, bgs[0]], prefix);
  say('uploaded');
  // The row exists BEFORE the attempt, so a reel that Meta refuses
  // leaves a record instead of vanishing. It counts toward nothing
  // until it is 'posted', so a failure never eats the day's second
  // slot — it just stops the failure from being invisible.
  await upsertWindow(deck.key, floor, Math.floor(Date.now() / 1000));
  try {
    const r = await publishReel(urls[0], deck.caption, { coverUrl: urls[1] });
    say(`POSTED ${r.permalink ?? r.id}`);
    await keepTemplate(tplRecent, tpl.id);
    await setWindow({ key: deck.key, status: 'posted', slides: bgs.length,
      posted_at: Math.floor(Date.now() / 1000) });
    await setPublished(deck.key, { media_id: r.id, permalink: r.permalink,
      choices: { template: String(tpl.id), name: tpl.name, kind: 'reel',
        seconds: built.seconds, audio: built.audio, mood,
        // Whether a reel was narrated is the whole question this
        // format is asking, so it is recorded beside the result
        // rather than inferred from the log later.
        voice: voices ? voices.filter(Boolean).length : 0 } });
    await recordClaims(rows, deck, { wkey: deck.key, media_id: r.id,
      permalink: r.permalink ?? null, posted_at: Math.floor(Date.now() / 1000) });
    await logRun(deck.key, 'reel', true, r.permalink ?? r.id);
    await notify(`🎬 ${deck.key} — reel live (${built.seconds}s)\n${r.permalink ?? ''}`);
  } catch (e) {
    say('REEL FAILED —', e.message);
    await setWindow({ key: deck.key, status: 'failed', slides: bgs.length, error: e.message });
    await logRun(deck.key, 'reel', false, e.message);
    await notify(`❌ reel ${deck.key}\n${e.message}`);
    process.exitCode = 1;
  } finally {
    await remove([mp4, bgs[0]], prefix);
  }
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
      const pinned = (await getState(PEER_KEY)) ?? null;
      const { rows, peer } = await fetchRecent(80, await withMedia(), pinned);
      const fresh = await putMessages(rows);
      if (peer) await setState(PEER_KEY, peer);
      // "ingested 80" for four days running, while nothing published.
      //
      // 80 was the number FETCHED, and fetchRecent always fetches 80.
      // The log said the same thing whether the channel had posted
      // thirty times or not at all since the last tick, so the one
      // number that mattered — how many were NEW — was the one number
      // it did not print. Every track then went quiet in its own
      // vocabulary ("nothing unstoried", "nothing unconsumed", "only
      // 2 messages in the window") and none of them said why.
      say(`ingested ${rows.length} message(s), ${fresh} new`);

      // And if the source has stopped talking, say so out loud —
      // but only when silence would actually be strange.
      //
      // The first version of this alarm used "nothing new for eight
      // hours", which is wrong twice over and would have cried wolf
      // until it was ignored. The channel posts US market news: it
      // goes quiet overnight for twelve hours as a matter of course,
      // and all weekend, because the market it reports on is shut. It
      // was exactly that weekend silence — Saturday the 12th and
      // Sunday the 13th — that looked like a dead pipeline and was
      // not one.
      //
      // So the question is not "how long has it been quiet" but "has
      // it been quiet when it had no business being". On a US trading
      // day, by early afternoon in Israel, a live channel has posted.
      // That is the only moment worth checking.
      const { newestMessageTs } = await import('./db.js');
      const newest = await newestMessageTs();
      const staleH = Number(process.env.STALE_SOURCE_HOURS || 6);
      const ageH = newest ? (Date.now() / 1000 - newest) / 3600 : Infinity;
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ,
        weekday: 'short', hour: '2-digit', hour12: false })
        .formatToParts(new Date()).reduce((a, x) => (a[x.type] = x.value, a), {});
      // Saturday and Sunday the US market is closed and so is the
      // channel. Friday is a trading day and is checked like any other.
      const tradingDay = !['Sat', 'Sun'].includes(parts.weekday);
      const afternoon = Number(parts.hour) >= Number(process.env.STALE_CHECK_HOUR || 14);
      if (tradingDay && afternoon && ageH > staleH) {
        const hrs = Number.isFinite(ageH) ? ageH.toFixed(1) : '∞';
        say(`SOURCE STALE — newest message is ${hrs}h old on a trading afternoon`);
        const last = Number((await getState('stale-alert')) ?? 0);
        // One alert a day, not one an hour.
        if (Date.now() / 1000 - last > 20 * 3600) {
          await setState('stale-alert', Math.floor(Date.now() / 1000));
          await notify(`⚠️ המקור שקט — ההודעה החדשה ביותר בת ${hrs} שעות.\n\n`
            + `הערוץ הפסיק לפרסם, שונה שמו, או שה-session של טלגרם מת. `
            + `כל עוד זה כך, אין סטוריז, אין דייג׳סט ואין ריל — והריצות ימשיכו להיות ירוקות.`);
        }
      }
    } catch (e) {
      // This used to be swallowed with a log line and nothing else.
      //
      // On 6 September the source channel renamed itself and this threw
      // on every tick for seven hours. Every run stayed green, the
      // dashboards looked healthy, and the account simply stopped —
      // the failure mode that takes longest to notice is the one that
      // does not announce itself. A dead source is worth waking
      // somebody for.
      say('INGEST FAILED —', e.message);
      await notify(`❌ ingest failed\n${e.message}\n\nThe source channel may have been renamed or the session may be dead. Nothing new will be posted until this is fixed.`);
      process.exitCode = 1;
    }
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
  const stop = (DRY || REVIEW) ? null : await blocked({ stories: STORIES || CALLBACK, reel: REEL });
  if (stop) { say('SKIP —', stop); return; }

  // A reel publishes, so unlike insights it sits BEHIND the kill
  // switch, the active hours and the failure latch — not in front of
  // them with the read-only mode.
  if (CALLBACK) return runCallback();

  if (REEL) {
    // Two slots a day, gated on the LOCAL hour for the same reason the
    // digest is: pg_cron thinks in UTC and Israel moves its clocks
    // twice a year, so a cron expression pinned to the right minute in
    // August is an hour wrong in November. The cron dispatches every
    // hour; this is what makes only two of them do anything.
    const hours = (process.env.REEL_HOURS || '').split(',').map(x => x.trim()).filter(Boolean);
    if (hours.length && process.env.IGNORE_SCHEDULE !== '1' && !DRY
        && !hours.includes(String(localHour()))) {
      say(`SKIP — ${localHour()}:xx is not a reel hour (${hours.join(', ')})`);
      return;
    }
    return runReel();
  }

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
  await recordClaims(w.rows ?? [], deck, { wkey: w.key, media_id: result.id,
    permalink: result.permalink ?? null, posted_at: Math.floor(Date.now() / 1000) });
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
