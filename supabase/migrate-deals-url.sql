-- Adds the Flipp deep-link URL to the shared "Deals this week" feed. The watcher writes an
-- item-level flipp.com URL per deal (falling back to flyer-level); the app renders the deal
-- name as a link into the Flipp flyer. Run once (idempotent), then reload PostgREST's cache
-- so the new column is writable immediately.
alter table deals add column if not exists flipp_url text;
notify pgrst, 'reload schema';
