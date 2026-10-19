-- The weekly analysts post. Wednesday 18:00 Israel: 15 UTC in summer, 16 in
-- winter; run.js gates on the local hour, so both are fired and one is a no-op.
select cron.unschedule(jobname) from cron.job where jobname = 'market-agent-analysts';
select cron.schedule('market-agent-analysts', '41 15,16 * * 3', $$select agent.fire('analysts')$$);
