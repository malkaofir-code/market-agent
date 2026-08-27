-- ─────────────────────────────────────────────────────────────
-- recover.sql — give back the windows that were skipped but never
-- posted.
--
-- Windows retired as 'stale', dropped as 'thin', or left 'failed'
-- had their messages marked consumed, so the agent will never look
-- at them again. This releases them: the messages go back to
-- unconsumed and the window goes back to 'open', so the next tick
-- picks them up oldest-first and posts them.
--
-- 'snapshots-only' and 'empty' are deliberately NOT released — those
-- hours held nothing but futures quotes, and there is no post in them.
--
-- Run the SELECT first to see what you are about to bring back.
-- ─────────────────────────────────────────────────────────────

-- 1. Look before you leap.
select key, status, slides, to_timestamp(start_ts) at time zone 'Asia/Jerusalem' as starts
from agent.windows
where status in ('thin', 'stale', 'waiting', 'failed')
  and start_ts >= extract(epoch from (current_date at time zone 'Asia/Jerusalem'))
order by start_ts;

-- 2. Release them. Same WHERE clause as above — widen the date if you
--    want more than today (drop the start_ts line for everything).
with releasing as (
  select key from agent.windows
  where status in ('thin', 'stale', 'waiting', 'failed')
    and start_ts >= extract(epoch from (current_date at time zone 'Asia/Jerusalem'))
)
update agent.messages
   set consumed_by = null
 where consumed_by in (select key from releasing);

update agent.windows
   set status = 'open', error = null
 where status in ('thin', 'stale', 'waiting', 'failed')
   and start_ts >= extract(epoch from (current_date at time zone 'Asia/Jerusalem'));

-- 3. Fire a tick now instead of waiting for :16.
select net.http_post(
  url     := 'https://api.github.com/repos/malkaofir-code/market-agent/actions/workflows/agent.yml/dispatches',
  headers := jsonb_build_object(
    'Authorization',        'Bearer ' || (select v from agent.secrets where k = 'gh_token'),
    'Accept',               'application/vnd.github+json',
    'Content-Type',         'application/json',
    'User-Agent',           'market-agent-cron'),
  body    := jsonb_build_object('ref', 'main'));
