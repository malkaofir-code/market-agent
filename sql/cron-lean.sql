-- ─────────────────────────────────────────────────────────────
-- cron-lean.sql — one dispatch per slot that can act.
--
-- THE OUTAGE THIS FILE EXISTS BECAUSE OF
--
-- On 21 Sep 2026 at 22:42 local the account stopped publishing. Every
-- layer looked healthy and that is what made it slow to find:
--
--   · pg_cron fired on time
--   · pg_net POSTed the dispatch
--   · GitHub answered 204 — accepted
--   · a workflow run was created
--   · the run FAILED in two seconds, with zero steps executed
--
-- A job that fails before "Set up job" has not run at all: no runner
-- was ever allocated. On a PRIVATE repo that means the account's
-- Actions allowance is gone — 1,024 runs had been started since the
-- 1st, and GitHub bills every job rounded UP to a whole minute.
--
-- So the old schedule was the bug. Dispatching hourly and letting
-- run.js decide is a lovely design and it is free only on a public
-- repo. Here, a tick that exits in four seconds saying "not a reel
-- hour" still costs a minute, and there were sixty of them a day.
--
--   digest    31 4-21 * * *   → 18/day, of which 2 could publish
--   reel       6 4-21 * * *   → 18/day, of which 2 could publish
--   callback  41 4-21 * * *   → 18/day, of which ~1 could publish
--   stories   16 6,9,12,16    →  4/day, all of which could publish
--   insights  11 7,20         →  2/day
--                               ── 60/day, ~1,800 billed minutes a
--                                  month before a single frame is
--                                  rendered. The allowance is 2,000.
--
-- Now every job fires only on the hours its track can actually use:
-- about 18 a day, nearer 500 billed minutes a month including the
-- rendering, which leaves real headroom.
--
-- WHY TWO UTC HOURS PER SLOT
--
-- pg_cron thinks in UTC and Israel moves its clocks twice a year, so
-- one UTC hour per slot is right for half the year and an hour wrong
-- for the other half — and run.js gates on the LOCAL hour, so the
-- wrong half would publish nothing at all for five months. Firing
-- both candidate hours costs one extra no-op tick and is correct on
-- both sides of the change. The no-op exits in seconds.
--
-- The alternative — pinning one hour and editing this file twice a
-- year — is a maintenance trap that fails silently and in exactly
-- the season nobody is looking.
-- ─────────────────────────────────────────────────────────────

-- One place the token is read, instead of five copies of the same
-- twenty lines drifting apart.
create or replace function agent.fire(mode text) returns bigint language sql as $$
  select net.http_post(
    url     := 'https://api.github.com/repos/malkaofir-code/market-agent/actions/workflows/agent.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization',        'Bearer ' || (select v from agent.secrets where k = 'gh_token'),
      'Accept',               'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'Content-Type',         'application/json',
      'User-Agent',           'market-agent-cron'),
    body    := jsonb_build_object('ref', 'main',
                                  'inputs', jsonb_build_object('mode', mode)));
$$;

select cron.unschedule(jobname) from cron.job
 where jobname in ('market-agent-digest','market-agent-reel','market-agent-callback');

--                                        UTC hours        summer local / winter local
select cron.schedule('market-agent-digest',        '31 5,6,18,19 * * *',  $$select agent.fire('digest')$$);   -- 08 & 21 / 07 & 20
select cron.schedule('market-agent-reel',          '6 10,11,16,17 * * *', $$select agent.fire('reel')$$);     -- 13 & 19 / 12 & 18
select cron.schedule('market-agent-reel-weekly',   '6 6,7 * * 1',         $$select agent.fire('reel')$$);     -- Mon 09 / Mon 08
select cron.schedule('market-agent-callback',      '41 6,7 * * *',        $$select agent.fire('callback')$$); -- scoring, daily
select cron.schedule('market-agent-callback-post', '41 12,13 * * 4',      $$select agent.fire('callback')$$); -- Thu 15 / Thu 14

-- ── check it ─────────────────────────────────────────────────
--   select jobname, schedule, active from cron.job order by jobname;
--
-- And when the page goes quiet again, start HERE, not in the agent:
--   select id, status_code from net._http_response order by id desc limit 5;
-- A 204 with no publishing means the dispatch left cleanly and the
-- failure is on GitHub's side — check the run's job for zero steps.
