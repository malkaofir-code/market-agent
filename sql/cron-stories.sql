-- ─────────────────────────────────────────────────────────────
-- cron-stories.sql — the two-track heartbeat.
--
-- Replaces the single hourly job in cron.sql. Run cron.sql FIRST (it
-- creates the extensions and agent.secrets and stores the token);
-- this file only re-schedules.
--
--   stories  every hour at :16  — up to 3 boards for the hour just gone
--   digest   every hour at :31  — but run.js only acts on the hours in
--                                 DIGEST_HOURS (08, 15, 21 local).
--
-- Both jobs fire every hour on purpose. pg_cron thinks in UTC and
-- Israel moves its clocks twice a year, so a cron expression pinned to
-- 05:31 UTC would drift an hour off in the winter. Dispatching hourly
-- and letting the agent read the LOCAL hour keeps 08:31 at 08:31 all
-- year; the extra dispatches cost one GitHub minute each and exit
-- immediately with "not a digest hour".
-- ─────────────────────────────────────────────────────────────

-- The old single job, if it is still there.
select cron.unschedule('market-agent-tick')
  where exists (select 1 from cron.job where jobname = 'market-agent-tick');
select cron.unschedule('market-agent-stories')
  where exists (select 1 from cron.job where jobname = 'market-agent-stories');
select cron.unschedule('market-agent-digest')
  where exists (select 1 from cron.job where jobname = 'market-agent-digest');

select cron.schedule('market-agent-stories', '16 4-21 * * *', $job$
  select net.http_post(
    url     := 'https://api.github.com/repos/malkaofir-code/market-agent/actions/workflows/agent.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization',        'Bearer ' || (select v from agent.secrets where k = 'gh_token'),
      'Accept',               'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'Content-Type',         'application/json',
      'User-Agent',           'market-agent-cron'),
    body    := jsonb_build_object('ref', 'main',
                                  'inputs', jsonb_build_object('mode', 'stories'))
  );
$job$);

select cron.schedule('market-agent-digest', '31 4-21 * * *', $job$
  select net.http_post(
    url     := 'https://api.github.com/repos/malkaofir-code/market-agent/actions/workflows/agent.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization',        'Bearer ' || (select v from agent.secrets where k = 'gh_token'),
      'Accept',               'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'Content-Type',         'application/json',
      'User-Agent',           'market-agent-cron'),
    body    := jsonb_build_object('ref', 'main',
                                  'inputs', jsonb_build_object('mode', 'digest'))
  );
$job$);

-- ── check it ─────────────────────────────────────────────────
--   select jobname, schedule, active from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
--   select status_code, created from net._http_response order by created desc limit 5;
