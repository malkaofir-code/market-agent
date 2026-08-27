-- ─────────────────────────────────────────────────────────────
-- cron.sql — the heartbeat, moved off GitHub.
--
-- GitHub runs `schedule:` on a best-effort basis and on 27 Aug it
-- stopped firing this repo's cron entirely: ~20 consecutive slots
-- skipped while every manual dispatch ran fine. Renaming the workflow
-- to re-register the schedule did not revive it.
--
-- So the clock lives here instead. pg_cron is a real scheduler inside
-- the database that already holds the agent's state, and pg_net lets
-- it call the GitHub API. GitHub still runs the job; it just no longer
-- decides *when*.
--
-- Paste this into the Supabase SQL editor and Run.
-- ─────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The token, kept out of the cron command itself: cron.job is readable
-- and a token pasted into the schedule would sit there in clear text.
create table if not exists agent.secrets (
  k text primary key,
  v text not null,
  updated_at timestamptz default now()
);
alter table agent.secrets enable row level security;   -- no policies: service_role only

-- ── PASTE THE TOKEN HERE, then run the file ──
insert into agent.secrets (k, v) values ('gh_token', 'PASTE_YOUR_TOKEN_HERE')
  on conflict (k) do update set v = excluded.v, updated_at = now();

-- Every hour at :16 UTC-relative — the workflow's own active-hours
-- guard (07:00-24:00 Asia/Jerusalem) decides whether there is anything
-- to do, so this only has to be generous, not clever.
select cron.unschedule('market-agent-tick')
  where exists (select 1 from cron.job where jobname = 'market-agent-tick');

select cron.schedule('market-agent-tick', '16 4-20 * * *', $job$
  select net.http_post(
    url     := 'https://api.github.com/repos/malkaofir-code/market-agent/actions/workflows/agent.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization',        'Bearer ' || (select v from agent.secrets where k = 'gh_token'),
      'Accept',               'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'Content-Type',         'application/json',
      'User-Agent',           'market-agent-cron'),
    body    := jsonb_build_object('ref', 'main')
  );
$job$);

-- ── check it ─────────────────────────────────────────────────
-- Fire one right now:
--   select net.http_post(
--     url := 'https://api.github.com/repos/malkaofir-code/market-agent/actions/workflows/agent.yml/dispatches',
--     headers := jsonb_build_object(
--       'Authorization','Bearer ' || (select v from agent.secrets where k='gh_token'),
--       'Accept','application/vnd.github+json','Content-Type','application/json',
--       'User-Agent','market-agent-cron'),
--     body := jsonb_build_object('ref','main'));
--   -- 204 = accepted. Then look at Actions.
--   select * from net._http_response order by created desc limit 3;
--
-- What has fired:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
