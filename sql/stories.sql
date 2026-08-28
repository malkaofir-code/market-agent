-- ─────────────────────────────────────────────────────────────
-- stories.sql — the second track.
--
-- Paste into Supabase's SQL Editor and Run. Safe to run twice.
--
-- Stories and digests read the SAME messages and must not consume
-- each other's work, so the story track gets its own cursor rather
-- than sharing consumed_by. A window that has been told as stories
-- is still available to the next digest, and the other way round.
-- ─────────────────────────────────────────────────────────────
alter table agent.messages add column if not exists story_of text;

create index if not exists ix_msg_unstoried on agent.messages (ts) where story_of is null;

-- Story windows live in the same table under an 'S:' key, so every
-- rail that reads agent.windows keeps working. The daily cap and the
-- minimum gap between posts must NOT count them — a story is not a
-- post — which is what the key prefix is for.
create index if not exists ix_win_stories on agent.windows (posted_at)
  where status = 'posted' and key like 'S:%';
