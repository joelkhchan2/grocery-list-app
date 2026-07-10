-- Optional per-watch store scoping. Comma-separated store names; empty/null = watch
-- every configured store. The watcher only counts a match from these merchants.
-- Run once in the Supabase SQL editor.
alter table items add column if not exists watch_stores text;
