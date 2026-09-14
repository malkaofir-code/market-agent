-- ─────────────────────────────────────────────────────────────
-- callbacks.sql — what the account said, and what the market did.
--
-- Paste into Supabase's SQL Editor and Run. Safe to run twice.
--
-- Every other table here records what was PUBLISHED. These two record
-- whether it was RIGHT, which is the only thing on this account that
-- compounds: a stranger who sees "we posted this on Monday, here is
-- what the market did by Wednesday" learns something about the
-- account rather than about the news.
--
--   agent.claims  one checkable statement from one published post
--   agent.prices  daily closes, cached from a free keyless feed
-- ─────────────────────────────────────────────────────────────

create table if not exists agent.claims (
  id          bigserial primary key,
  tg_id       bigint,
  wkey        text,                  -- the window that published it
  media_id    text,
  permalink   text,
  posted_at   bigint not null,       -- when WE said it
  msg_ts      bigint,                -- when the channel said it
  symbol      text not null,         -- '^SPX' · 'NVDA' · 'BTCUSD'
  asset       text not null,         -- the Hebrew label for the board
  klass       text not null,         -- index | stock | crypto | commodity
  dir         text check (dir in ('up','dn')),   -- null on a follow-up
  kind        text not null default 'watch',     -- forecast | watch
  horizon     int  not null default 3,           -- sessions it gets
  headline    text,
  quote       text,
  base_px     numeric, base_date date,   -- the last close BEFORE we posted
  out_px      numeric, out_date date,
  move_pct    numeric, days_after int,
  status      text not null default 'open',      -- open|hit|miss|shown|nodata
  checked_at  bigint, shown_at bigint,
  created_at  bigint not null default extract(epoch from now())::bigint,
  -- One claim per instrument per message per kind. This is also what
  -- makes the backfill idempotent: re-reading the archive files nothing.
  unique (tg_id, symbol, kind)
);
create index if not exists ix_claims_open on agent.claims (status, posted_at desc);
create index if not exists ix_claims_sym  on agent.claims (symbol);
alter table agent.claims enable row level security;

create table if not exists agent.prices (
  symbol text    not null,
  d      date    not null,
  close  numeric not null,
  at     bigint  not null default extract(epoch from now())::bigint,
  primary key (symbol, d)
);
alter table agent.prices enable row level security;

-- The scoreboard, in one read.
create or replace view agent.callbacks as
select c.*,
  to_char(to_timestamp(c.posted_at) at time zone 'Asia/Jerusalem', 'DD.MM') as posted_he
from agent.claims c
where c.status in ('hit','shown')
order by c.checked_at desc nulls last;

-- ── check it ─────────────────────────────────────────────────
--   select kind, status, count(*) from agent.claims group by 1,2;
--   select posted_he, asset, move_pct, days_after, headline
--     from agent.callbacks limit 10;
