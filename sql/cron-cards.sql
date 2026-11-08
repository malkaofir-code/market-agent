-- The card schedule (Nov 2026). Daily: four story ticks and the 21:00
-- evening carousel. Thursday 15:00: the proof carousel. Sunday 19:00:
-- the week's only reel. Two UTC hours per slot (Israel changes clocks);
-- run.js gates on the local hour, so one of each pair is a no-op.
select cron.unschedule(jobname) from cron.job
 where jobname in ('market-agent-analysts', 'market-agent-reel-weekly', 'market-agent-reel');
select cron.schedule('market-agent-reel', '6 16,17 * * 0', $$select agent.fire('reel')$$);  -- Sun 19:00 local
-- unchanged: market-agent-digest '31 5,6,18,19 * * *' (21:00 gate in run.js),
--            market-agent-stories, market-agent-callback(-post), market-agent-insights
