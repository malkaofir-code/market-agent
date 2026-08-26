-- ─────────────────────────────────────────────────────────────
-- market-agent state, on Postgres.
--
-- Paste this into your Supabase project's SQL Editor and Run.
-- Same shape as the SQLite version it replaces: the UNIQUE tg_id is
-- what makes every stage idempotent, so a crashed or half-finished
-- run resumes instead of double-posting.
--
-- Lives in its own schema so it can never collide with anything else
-- in the project, and stays out of the auto-exposed public API.
-- ─────────────────────────────────────────────────────────────
create schema if not exists agent;

create table if not exists agent.messages (
  tg_id       bigint primary key,          -- unique => replay is free
  ts          bigint not null,             -- unix seconds, UTC
  text        text,
  has_media   boolean default false,
  consumed_by text,                        -- window key, once used on a deck
  seen_at     bigint default extract(epoch from now())::bigint
);
create index if not exists ix_msg_ts on agent.messages (ts);
-- the hot query: oldest unconsumed message before the open window
create index if not exists ix_msg_unconsumed on agent.messages (ts) where consumed_by is null;

create table if not exists agent.windows (
  key       text primary key,              -- '2026-08-26T08:00' (Asia/Jerusalem)
  start_ts  bigint not null,
  end_ts    bigint not null,
  status    text default 'open',           -- open|empty|thin|stale|snapshots-only|posted|failed
  slides    int,
  shed      jsonb,                         -- rows dropped by the tripwire
  error     text,
  posted_at bigint
);
create index if not exists ix_win_posted on agent.windows (posted_at) where status = 'posted';

create table if not exists agent.runs (
  id     bigserial primary key,
  wkey   text,
  phase  text,
  ok     boolean,
  detail text,
  at     bigint default extract(epoch from now())::bigint
);

-- Carry-forward tape levels: the file that used to be out/carry.json.
-- Needed because an Actions runner keeps nothing between runs.
create table if not exists agent.state (
  k text primary key,
  v jsonb not null,
  updated_at timestamptz default now()
);

-- Nothing here should ever be reachable with the anon key. RLS on,
-- no policies: the service_role key bypasses it, everyone else sees
-- nothing.
alter table agent.messages enable row level security;
alter table agent.windows  enable row level security;
alter table agent.runs     enable row level security;
alter table agent.state    enable row level security;

-- ── media (added with the Direction A redesign) ──────────────
-- 44% of source messages carry a photo or chart. The paper design
-- discarded them; the dark one is built around them. We keep only the
-- public URL of the copy pushed to storage - never the bytes.
alter table agent.messages add column if not exists media_url text;
alter table agent.messages add column if not exists media_at  bigint;
