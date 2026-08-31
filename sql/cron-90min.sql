-- ─────────────────────────────────────────────────────────────
-- cron-90min.sql — stories every ninety minutes, not every hour.
--
-- Run cron.sql FIRST (it creates the extensions and the token).
-- This replaces the hourly story job; the digest job is untouched.
--
-- Eleven dispatches a day instead of seventeen, which is both the
-- cadence we want and cheaper in Actions minutes. Times are UTC and
-- Israel is UTC+3 in summer, so these land at 07:16, 08:46, 10:16,
-- 11:46, 13:16, 14:46, 16:16, 17:46, 19:16, 20:46 and 22:16 local.
-- In winter they drift an hour earlier, which for stories is
-- cosmetic — the digest gate that does care about the local hour is
-- in the code, not here.
-- ─────────────────────────────────────────────────────────────

select cron.unschedule('market-agent-stories')
  where exists (select 1 from cron.job where jobname = 'market-agent-stories');
select cron.unschedule('market-agent-stories-b')
  where exists (select 1 from cron.job where jobname = 'market-agent-stories-b');

-- on the hour+16, every three hours
select cron.schedule('market-agent-stories', '16 4,7,10,13,16,19 * * *', $job$
  select net.http_post(
    url     := 'https://api.github.com/repos/malkaofir-code/market-agent/actions/workflows/agent.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization',        'Bearer ' || (select v from agent.secrets where k = 'gh_token'),
      'Accept',               'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'Content-Type',         'application/json',
      'User-Agent',           'market-agent-cron'),
    body    := jsonb_build_object('ref', 'main',
                                  'inputs', jsonb_build_object('mode', 'stories')));
$job$);

-- and the half-hours in between, offset by ninety minutes
select cron.schedule('market-agent-stories-b', '46 5,8,11,14,17 * * *', $job$
  select net.http_post(
    url     := 'https://api.github.com/repos/malkaofir-code/market-agent/actions/workflows/agent.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization',        'Bearer ' || (select v from agent.secrets where k = 'gh_token'),
      'Accept',               'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'Content-Type',         'application/json',
      'User-Agent',           'market-agent-cron'),
    body    := jsonb_build_object('ref', 'main',
                                  'inputs', jsonb_build_object('mode', 'stories')));
$job$);

--   select jobname, schedule, active from cron.job order by jobname;
