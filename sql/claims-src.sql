-- The post a claim was made in, kept so a proof card can show it.
-- One JPEG per claim-bearing slide, under archive/ in the media bucket.
alter table agent.claims add column if not exists src_img text;
