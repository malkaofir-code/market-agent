// ─────────────────────────────────────────────────────────────
// db.js — the spine, on Postgres.
//
// Was SQLite in a local file. A GitHub Actions runner keeps nothing
// between runs, so the message store, the window ledger AND the
// carry-forward tape all have to live outside the process. Same
// guarantees as before: tg_id is unique, so every stage is idempotent
// and a crashed run resumes rather than double-posting.
//
// Everything here is async now. That is the whole cost of the move.
// ─────────────────────────────────────────────────────────────
import pg from 'pg';
import 'dotenv/config';

const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error('SUPABASE_DB_URL missing from .env');

export const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },   // Supabase terminates TLS at the pooler
  max: 2,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 15_000,
});

const q = (text, params) => pool.query(text, params);

// ── messages ─────────────────────────────────────────────────
export async function putMessages(rows) {
  if (!rows.length) return 0;
  // One statement, not N round-trips: an Actions runner pays latency
  // to Frankfurt on every single query.
  const vals = [], params = [];
  rows.forEach((r, i) => {
    const b = i * 6;
    vals.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`);
    params.push(r.tg_id, r.ts, r.text, r.has_media, r.media_url ?? null, r.media_at ?? null);
  });
  // coalesce on media_url: a re-ingest of an old message carries no
  // buffer, and must not blank a URL we already harvested.
  // `xmax = 0` is true only for a row this statement INSERTED; an
  // updated row carries the id of the transaction that touched it.
  // It is the only way to tell "80 arrived" from "80 were re-read",
  // and that distinction is the whole point — see below.
  const { rows: back } = await q(
    `insert into agent.messages (tg_id, ts, text, has_media, media_url, media_at) values ${vals.join(',')}
     on conflict (tg_id) do update set text = excluded.text,
       media_url = coalesce(agent.messages.media_url, excluded.media_url),
       media_at  = coalesce(agent.messages.media_at,  excluded.media_at)
     returning (xmax = 0) as inserted`, params);
  return back.filter(r => r.inserted).length;
}

/** The timestamp of the newest message in the table — the only honest
 *  answer to "is the source still talking to us". */
export const newestMessageTs = () =>
  q(`select max(ts) t from agent.messages`).then(r => Number(r.rows[0]?.t ?? 0));

export const messagesIn = (from, to) =>
  q(`select * from agent.messages
     where ts >= $1 and ts < $2 and consumed_by is null order by ts asc`, [from, to])
    .then(r => r.rows);

/** Replay: ignores consumed_by, for --window reruns. */
export const messagesInAll = (from, to) =>
  q(`select * from agent.messages where ts >= $1 and ts < $2 order by ts asc`, [from, to])
    .then(r => r.rows);

export const oldestUnconsumedBefore = ts =>
  q(`select min(ts) t from agent.messages where consumed_by is null and ts < $1`, [ts])
    .then(r => r.rows[0]?.t ?? null);

export const markConsumed = (key, ids) =>
  ids.length ? q(`update agent.messages set consumed_by = $1 where tg_id = any($2::bigint[])`,
    [key, ids]) : null;

// ── the story track ──────────────────────────────────────────
// Same messages, its own cursor. A window told as stories at 17:16 is
// still there for the 21:15 digest to summarise, and a window already
// summarised is still available to be told as a story — the two reads
// are independent on purpose, because they say different things about
// the same hour.
export const storyMessagesIn = (from, to) =>
  q(`select * from agent.messages
     where ts >= $1 and ts < $2 and story_of is null order by ts asc`, [from, to])
    .then(r => r.rows);

export const oldestUnstoriedBefore = ts =>
  q(`select min(ts) t from agent.messages where story_of is null and ts < $1`, [ts])
    .then(r => r.rows[0]?.t ?? null);

export const markStoried = (key, ids) =>
  ids.length ? q(`update agent.messages set story_of = $1 where tg_id = any($2::bigint[])`,
    [key, ids]) : null;

/**
 * Everything older than the story track cares about, in ONE statement.
 *
 * The cursor arrived NULL on every message in the table, so the track
 * opened on a backlog of weeks. Draining it one window per run — which
 * is what the loop below used to do — advances an hour per hour and
 * never catches up: the story track would have stayed permanently in
 * the middle of August. Stories are about now; the past is the
 * digest's job, and it has already told it.
 */
/**
 * Give a discarded hour back to the story track.
 *
 * Only ever touches rows the track itself threw away — a told hour
 * carries its window key in story_of, never 'S:retired' — and only
 * from `sinceTs` forward, so a catch-up can recover this morning
 * without reopening August. Called from the catch-up path alone.
 */
export const unretireStoriesSince = sinceTs =>
  q(`update agent.messages set story_of = null
     where story_of = 'S:retired' and ts >= $1`, [sinceTs]).then(r => r.rowCount);

export const retireStories = beforeTs =>
  q(`update agent.messages set story_of = 'S:retired'
     where story_of is null and ts < $1`, [beforeTs]).then(r => r.rowCount);

// ── windows ──────────────────────────────────────────────────
export const upsertWindow = (key, start, end) =>
  q(`insert into agent.windows (key, start_ts, end_ts) values ($1,$2,$3)
     on conflict (key) do nothing`, [key, start, end]);

export const setWindow = ({ key, status, slides = null, shed = null, error = null, posted_at = null }) =>
  q(`update agent.windows set status=$2, slides=$3, shed=$4, error=$5, posted_at=$6 where key=$1`,
    [key, status, slides, shed ? JSON.stringify(shed) : null, error, posted_at]);

export const getWindow = key =>
  q(`select * from agent.windows where key=$1`, [key]).then(r => r.rows[0] ?? null);

// ── rails ────────────────────────────────────────────────────
// A story is not a post. It does not count toward the daily cap and it
// does not open the minimum gap — otherwise one story at :16 would
// silence the digest that follows it. The 'S:' prefix is what keeps
// the two ledgers apart in one table.
// ── the daily caps ───────────────────────────────────────────
//
// "Per day" means the calendar day in Israel, not a rolling 24 hours.
//
// The rolling version looks equivalent and is not. On 31 August the
// story track ran hourly at three boards a set — thirty boards. The
// next morning it ran at one board every ninety minutes under a cap
// of fourteen, and every single tick skipped: yesterday's thirty were
// still inside the trailing window and would stay there until
// midnight. A whole day of stories was lost to a cadence change that
// had already been made. A cap that counts today can only ever be
// spent by today.
const DAY_START = `extract(epoch from date_trunc('day', now() at time zone $tz) at time zone $tz)::bigint`
  .replace(/\$tz/g, `'${(process.env.TZ || 'Asia/Jerusalem').replace(/'/g, "''")}'`);

// A reel is not a post and must not spend the post budget.
//
// The prefixes are the whole ledger: 'S:' a story set, 'R:' a reel,
// bare a carousel. Every rail below filters on them explicitly rather
// than on "not a story", because the moment a third kind existed
// "not a story" quietly meant "post or reel" — one reel would have
// eaten a digest slot and opened the minimum gap in front of it.
const POSTS_ONLY = `key not like 'S:%' and key not like 'R:%' and key not like 'C:%'`;

export const postsToday = () =>
  q(`select count(*)::int n from agent.windows
     where status='posted' and ${POSTS_ONLY}
       and posted_at >= ${DAY_START}`)
    .then(r => r.rows[0].n);

/**
 * What a window published, and what its deck chose.
 *
 * Without the media id nothing can be measured; without the choices
 * beside it the measurement cannot be attributed. Both are written in
 * the same statement as the post going live, so a result can never
 * exist without the decision that produced it.
 */
export const setPublished = (key, { media_id = null, permalink = null, choices = null }) =>
  q(`update agent.windows set media_id = $2, permalink = $3, choices = $4 where key = $1`,
    [key, media_id, permalink, choices ? JSON.stringify(choices) : null]);

/** Everything published in the last `days` that still has a media id. */
export const publishedSince = (days = 14) =>
  q(`select key, media_id, posted_at, choices,
            case when key like 'S:%' then 'story'
                 when key like 'R:%' then 'reel'
                 else 'post' end as kind
     from agent.windows
     where status = 'posted' and media_id is not null
       and posted_at > extract(epoch from now())::bigint - $1 * 86400
     order by posted_at desc`, [days]).then(r => r.rows);

export const putInsight = (row) =>
  q(`insert into agent.insights
       (media_id, wkey, kind, age_min, reach, views, likes, comments,
        saved, shares, replies, profile_visits, follows, raw)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     on conflict (media_id, at) do nothing`,
    [row.media_id, row.wkey, row.kind, row.age_min, row.reach, row.views,
     row.likes, row.comments, row.saved, row.shares, row.replies,
     row.profile_visits, row.follows, JSON.stringify(row.raw ?? {})]);

/**
 * What actually worked, grouped however you ask.
 *
 * Ranked on saves + shares against reach, not on likes: a like is the
 * cheapest thing a person can do and predicts the least about whether
 * the next post reaches anybody.
 */
export const performanceBy = (field, days = 30, kind = 'post') =>
  q(`select coalesce(p.${field}, '(none)') as k, count(*)::int n,
            round(avg(p.reach))::int reach,
            round(avg(coalesce(p.saved,0) + coalesce(p.shares,0)), 1) spread,
            round(avg(p.spread_pct), 2) spread_pct
     from agent.performance p
     join agent.windows w on w.key = p.wkey
     where p.kind = $2 and w.posted_at > extract(epoch from now())::bigint - $1 * 86400
     group by 1 having count(*) >= 2 order by spread_pct desc nulls last`,
    [days, kind]).then(r => r.rows);

export const lastPostAt = () =>
  q(`select max(posted_at) t from agent.windows
     where status='posted' and ${POSTS_ONLY}`).then(r => r.rows[0].t);

/** When the last story went up — the other half of the spacing rule. */
export const lastStoryAt = () =>
  q(`select max(posted_at) t from agent.windows
     where status='posted' and key like 'S:%'`).then(r => r.rows[0].t);

/** Instagram's own ceiling is 100 published items per 24h, shared. */
export const storiesToday = () =>
  q(`select coalesce(sum(slides),0)::int n from agent.windows
     where status='posted' and (key like 'S:%' or key like 'C:%')
       and posted_at >= ${DAY_START}`)
    .then(r => r.rows[0].n);

// ── the reel track's own two rails ───────────────────────────
//
// One or two a day, hours apart. A reel is the only thing this
// account publishes that a stranger can be shown, so it is worth
// spending a run on — and worth NOT spending three, because two reels
// twenty minutes apart split the same audience across both and teach
// the ranker that neither held anyone.
//
// Counted from local midnight for the same reason the story cap is:
// a rolling 24 hours means a cadence change silently blocks the whole
// next day.
export const reelsToday = () =>
  q(`select count(*)::int n from agent.windows
     where status='posted' and key like 'R:%'
       and posted_at >= ${DAY_START}`)
    .then(r => r.rows[0].n);

/** A callback is a story too — its own rail, on the same ceiling. */
export const callbacksToday = () =>
  q(`select count(*)::int n from agent.windows
     where status='posted' and key like 'C:%'
       and posted_at >= ${DAY_START}`).then(r => r.rows[0].n);

export const lastReelAt = () =>
  q(`select max(posted_at) t from agent.windows
     where status='posted' and key like 'R:%'`).then(r => r.rows[0].t);

// Only outcomes from the last `sinceMin` minutes count toward the
// pause. A latch with no expiry is indistinguishable from a dead
// agent: three plumbing failures at breakfast would silently kill
// every window for the rest of the week.
export const recentOutcomes = (n, sinceMin = 0) =>
  q(`select status from agent.windows where status in ('posted','failed') and ${POSTS_ONLY}
     ${sinceMin ? 'and coalesce(posted_at, end_ts) > extract(epoch from now()) - $2' : ''}
     order by coalesce(posted_at, end_ts) desc limit $1`,
    sinceMin ? [n, sinceMin * 60] : [n]).then(r => r.rows.map(x => x.status));

/** Operator reset: retire failed windows so the pause lifts now.
 *  Deliberate and explicit — the retire loop must never do this. */
export const clearFailed = () =>
  q(`update agent.windows set status='stale' where status='failed'`).then(r => r.rowCount);

/** tg_ids whose photo is already in storage - so we never refetch. */
export const withMedia = () =>
  q(`select tg_id from agent.messages where media_url is not null`)
    .then(r => new Set(r.rows.map(x => Number(x.tg_id))));

export const logRun = (wkey, phase, ok, detail) =>
  q(`insert into agent.runs (wkey, phase, ok, detail) values ($1,$2,$3,$4)`,
    [wkey, phase, ok, detail]);

// ── state (replaces out/carry.json) ──────────────────────────
export const getState = k =>
  q(`select v from agent.state where k=$1`, [k]).then(r => r.rows[0]?.v ?? null);

export const setState = (k, v) =>
  q(`insert into agent.state (k,v) values ($1,$2)
     on conflict (k) do update set v=excluded.v, updated_at=now()`, [k, JSON.stringify(v)]);

/**
 * The Instagram token used to live in .env, refreshed in place. An
 * Actions runner has no .env to rewrite and no disk that survives, so
 * the live token lives here and .env is only the seed for the first
 * run.
 */
export const getToken = () => getState('ig-token').then(v => v?.access_token ?? null);
export const setToken = (access_token, expires_in) =>
  setState('ig-token', { access_token, expires_in, set_at: Math.floor(Date.now() / 1000) });


// ── claims: what we said, and what the market did about it ───
//
// A claim is written at PUBLISH time, never at ingest. The account
// can only be right about something it actually posted, so a claim
// that never went out is not a claim — it is a message.
export async function putClaims(claims, { wkey, media_id = null, permalink = null, posted_at }) {
  if (!claims.length) return 0;
  const vals = [], params = [];
  claims.forEach((c, i) => {
    const b = i * 13;
    vals.push(`(${Array.from({ length: 13 }, (_, k) => `$${b + k + 1}`).join(',')})`);
    params.push(c.tg_id, wkey, media_id, permalink, posted_at, c.msg_ts,
      c.symbol, c.asset, c.klass, c.dir ?? null, c.kind, c.horizon,
      `${c.headline ?? ''}`.slice(0, 300));
  });
  const { rows } = await q(
    `insert into agent.claims
       (tg_id, wkey, media_id, permalink, posted_at, msg_ts,
        symbol, asset, klass, dir, kind, horizon, headline)
     values ${vals.join(',')}
     on conflict (tg_id, symbol, kind) do nothing
     returning id`, params);
  return rows.length;
}

/**
 * Messages that a DIGEST actually published, for the backfill.
 *
 * Only the digest track, and only through consumed_by. A digest's
 * caption carries every headline in its window, so "consumed by a
 * posted digest" really does mean "this text went out on the
 * account". The story track's cursor cannot make that promise — it
 * marks every message in the hour, including the two the set did not
 * have room to tell — and a callback quoting one of those would be
 * the account taking credit for something it never said.
 */
export const publishedMessages = (days = 7) =>
  q(`select m.tg_id, m.ts, m.text, w.key wkey, w.media_id, w.permalink, w.posted_at
     from agent.messages m
     join agent.windows w on w.key = m.consumed_by
     where w.status = 'posted' and w.media_id is not null
       and w.posted_at > extract(epoch from now())::bigint - $1 * 86400
     order by w.posted_at asc`, [days]).then(r => r.rows);

/** Claims still inside their horizon, oldest first. */
export const openClaims = (grace = 2) =>
  q(`select * from agent.claims
     where status = 'open'
       and posted_at > extract(epoch from now())::bigint - (horizon + $1) * 86400 - 86400
     order by posted_at asc`, [grace]).then(r => r.rows);

export async function putPrices(symbol, series) {
  if (!series.length) return 0;
  const vals = [], params = [];
  series.forEach((p, i) => {
    const b = i * 3;
    vals.push(`($${b + 1},$${b + 2},$${b + 3})`);
    params.push(symbol, p.d, p.c);
  });
  await q(`insert into agent.prices (symbol, d, close) values ${vals.join(',')}
           on conflict (symbol, d) do update set close = excluded.close`, params);
  return series.length;
}

export const closesFor = (symbol, fromDate) =>
  q(`select to_char(d,'YYYY-MM-DD') d, close::float8 c from agent.prices
     where symbol = $1 and d >= $2::date order by d asc`, [symbol, fromDate])
    .then(r => r.rows);

export const setClaimOutcome = (id, o) =>
  q(`update agent.claims set status=$2, base_px=$3, base_date=$4, out_px=$5,
       out_date=$6, move_pct=$7, days_after=$8,
       checked_at=extract(epoch from now())::bigint
     where id=$1`,
    [id, o.status, o.base_px ?? null, o.base_date ?? null, o.out_px ?? null,
     o.out_date ?? null, o.move_pct ?? null, o.days_after ?? null]);

/**
 * The best unpublished hit — a forecast that landed beats a follow-up.
 *
 * Fresh ones only. With roughly nine claims filed a day and one board
 * published, hits queue up; ordering the queue by size alone would
 * eventually reach past a quiet week and post a fortnight-old call as
 * though it had just landed. A callback is news about a number that
 * settled YESTERDAY. Anything older has missed its moment and stays
 * in the table as a record instead.
 */
export const bestHit = (freshHours = Number(process.env.CALLBACK_FRESH_HOURS || 36)) =>
  q(`select * from agent.claims
     where status = 'hit' and shown_at is null
       and checked_at > extract(epoch from now())::bigint - $1 * 3600
     order by (kind = 'forecast') desc, abs(move_pct) desc limit 1`, [freshHours])
    .then(r => r.rows[0] ?? null);

export const markClaimShown = id =>
  q(`update agent.claims set status='shown', shown_at=extract(epoch from now())::bigint
     where id=$1`, [id]);

/** How the account is doing at this, in one row. */
export const claimScore = (days = 30) =>
  q(`select kind,
            count(*) filter (where status in ('hit','shown'))::int hit,
            count(*) filter (where status = 'miss')::int miss,
            count(*) filter (where status = 'open')::int open
     from agent.claims
     where posted_at > extract(epoch from now())::bigint - $1 * 86400
     group by kind order by kind`, [days]).then(r => r.rows);

export const close = () => pool.end();
