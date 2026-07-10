-- Watches list: a reserved list type for standing "alert me when this is under $X"
-- items (distinct from weekly shopping lists). Nullable-free boolean, defaults false so
-- every existing list stays a normal shopping list. Run once in the Supabase SQL editor.
alter table lists add column is_watchlist boolean not null default false;
