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
  const { rowCount } = await q(
    `insert into agent.messages (tg_id, ts, text, has_media, media_url, media_at) values ${vals.join(',')}
     on conflict (tg_id) do update set text = excluded.text,
       media_url = coalesce(agent.messages.media_url, excluded.media_url),
       media_at  = coalesce(agent.messages.media_at,  excluded.media_at)`, params);
  return rowCount;
}

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
export const postsToday = () =>
  q(`select count(*)::int n from agent.windows
     where status='posted' and posted_at > extract(epoch from now())::bigint - 86400`)
    .then(r => r.rows[0].n);

export const lastPostAt = () =>
  q(`select max(posted_at) t from agent.windows where status='posted'`).then(r => r.rows[0].t);

export const recentOutcomes = n =>
  q(`select status from agent.windows where status in ('posted','failed')
     order by coalesce(posted_at, end_ts) desc limit $1`, [n]).then(r => r.rows.map(x => x.status));

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

export const close = () => pool.end();
