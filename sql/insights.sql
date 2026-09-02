-- ─────────────────────────────────────────────────────────────
-- insights.sql — the account learns which boards work.
--
-- Paste into Supabase's SQL Editor and Run. Safe to run twice.
--
-- Everything the agent decides today is a guess: which of thirty
-- templates opens best, whether the question cover beats the plain
-- one, whether a story told at 10:16 is seen more than one at 19:16.
-- None of it can be answered without the numbers, and the numbers
-- cannot be joined to a decision without knowing which post carried
-- which choices. So the window remembers what it published and what
-- it chose, and insights are pulled against it afterwards.
-- ─────────────────────────────────────────────────────────────

-- What went out, and what the deck decided.
alter table agent.windows add column if not exists media_id  text;
alter table agent.windows add column if not exists permalink text;
-- { template, cover, types[], slot, asks } — the choices, kept beside
-- the result so a query can ask which of them paid.
alter table agent.windows add column if not exists choices  jsonb;

create index if not exists ix_win_media on agent.windows (media_id)
  where media_id is not null;

-- One row per media per pull. Kept as a series, not overwritten: a
-- post keeps earning for days, and "reach after 1 hour" and "reach
-- after 3 days" are different questions. The latest row per media is
-- the current picture; the series is how fast it got there.
create table if not exists agent.insights (
  media_id  text   not null,
  wkey      text,
  kind      text,                         -- 'post' | 'story'
  at        bigint not null default extract(epoch from now())::bigint,
  age_min   int,                          -- minutes between publish and pull
  reach     int,
  views     int,
  likes     int,
  comments  int,
  saved     int,
  shares    int,
  replies   int,                           -- stories
  profile_visits int,
  follows   int,
  raw       jsonb,
  primary key (media_id, at)
);
create index if not exists ix_ins_wkey on agent.insights (wkey);

alter table agent.insights enable row level security;

-- The latest pull for each media, joined to what the deck chose.
create or replace view agent.performance as
select
  i.media_id, i.wkey, i.kind, i.age_min,
  i.reach, i.views, i.likes, i.comments, i.saved, i.shares, i.replies,
  w.choices ->> 'template'          as template,
  w.choices ->> 'cover'             as cover,
  w.choices ->> 'slot'              as slot,
  w.choices -> 'types'              as types,
  to_char(to_timestamp(w.posted_at) at time zone 'Asia/Jerusalem', 'DD.MM HH24:MI') as posted,
  -- Saves and shares are what the ranking actually rewards; a like is
  -- the cheapest thing a person can do and predicts the least.
  case when i.reach > 0
       then round(100.0 * (coalesce(i.saved,0) + coalesce(i.shares,0)) / i.reach, 2)
  end as spread_pct
from agent.insights i
join lateral (
  select * from agent.insights x
  where x.media_id = i.media_id order by x.at desc limit 1
) latest on latest.at = i.at
left join agent.windows w on w.key = i.wkey;
