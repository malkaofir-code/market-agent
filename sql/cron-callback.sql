-- ─────────────────────────────────────────────────────────────
-- cron-callback.sql — the callback heartbeat.
--
-- Run cron.sql FIRST (extensions, agent.secrets, the GitHub token)
-- and callbacks.sql (the two tables). This adds one job.
--
--   callback  every hour at :41 — run.js acts only on the hours in
--                                 CALLBACK_HOURS (9, 17 local) and
--                                 CALLBACK_POST_HOURS (12 local).
--
-- Hourly for the same reason as the reel: pg_cron thinks in UTC and
-- Israel moves its clocks twice a year, so a job pinned to 06:41 UTC
-- is 09:41 in August and 08:41 in November. The agent reads the LOCAL
-- hour; the extra dispatches exit in seconds.
--
-- :41 keeps it clear of the three tracks already running — reel :06,
-- stories :16, digest :31 — because the workflow's concurrency group
-- runs one tick at a time.
--
-- Morning and late afternoon for the two stories, noon for the
-- carousel. The number on every one of these boards is a CLOSE, and
-- by nine in the Israeli morning last night's US session is final.
-- ─────────────────────────────────────────────────────────────

select cron.unschedule('market-agent-callback')
  where exists (select 1 from cron.job where jobname = 'market-agent-callback');

select cron.schedule('market-agent-callback', '41 4-21 * * *', $job$
  select net.http_post(
    url     := 'https://api.github.com/repos/malkaofir-code/market-agent/actions/workflows/agent.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization',        'Bearer ' || (select v from agent.secrets where k = 'gh_token'),
      'Accept',               'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'Content-Type',         'application/json',
      'User-Agent',           'market-agent-cron'),
    body    := jsonb_build_object('ref', 'main',
                                  'inputs', jsonb_build_object('mode', 'callback'))
  );
$job$);

-- ── check it ─────────────────────────────────────────────────
--   select jobname, schedule, active from cron.job;
--   select key, status, posted_at from agent.windows
--     where key like 'C:%' order by posted_at desc limit 10;
