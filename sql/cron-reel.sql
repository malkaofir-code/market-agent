-- ─────────────────────────────────────────────────────────────
-- cron-reel.sql — the reel heartbeat.
--
-- Run cron.sql FIRST (it creates the extensions and agent.secrets and
-- stores the GitHub token); this file only adds one job.
--
--   reel   every hour at :06 — but run.js only acts on the hours in
--                              REEL_HOURS (9, 13, 17 local), plus the
--                              weekly scoreboard slot (Sun 12).
--
-- Hourly on purpose, exactly like the digest. pg_cron thinks in UTC
-- and Israel moves its clocks twice a year, so a job pinned to 14:06
-- UTC is 17:06 in August and 16:06 in November. Dispatching every hour
-- and letting the agent read the LOCAL hour keeps 17:00 at 17:00 all
-- year; the twenty-odd extra dispatches cost a GitHub minute each and
-- exit in seconds with "not a reel hour".
--
-- :06 keeps it clear of the two tracks already running — stories at
-- :16, digest at :31 — because the workflow's concurrency group lets
-- only one tick run at a time and a reel takes the longest of the
-- three.
-- ─────────────────────────────────────────────────────────────

select cron.unschedule('market-agent-reel')
  where exists (select 1 from cron.job where jobname = 'market-agent-reel');

select cron.schedule('market-agent-reel', '6 4-21 * * *', $job$
  select net.http_post(
    url     := 'https://api.github.com/repos/malkaofir-code/market-agent/actions/workflows/agent.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization',        'Bearer ' || (select v from agent.secrets where k = 'gh_token'),
      'Accept',               'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'Content-Type',         'application/json',
      'User-Agent',           'market-agent-cron'),
    body    := jsonb_build_object('ref', 'main',
                                  'inputs', jsonb_build_object('mode', 'reel'))
  );
$job$);

-- ── check it ─────────────────────────────────────────────────
--   select jobname, schedule, active from cron.job;
--   select key, status, posted_at from agent.windows
--     where key like 'R:%' order by posted_at desc limit 10;
