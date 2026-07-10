-- Optional per-unit target for a watch: lb | kg | 100g | ea (null/empty = flat package price).
-- When set, the watcher normalizes flyer prices into this unit before comparing to the target.
-- Run once in the Supabase SQL editor.
alter table items add column if not exists target_unit text;

-- Set the already-seeded chicken-breast watch to per-lb (its $4.99 target is a /lb price).
update items set target_unit = 'lb'
where watch and lower(name) like '%chicken breast%' and target_unit is null;
