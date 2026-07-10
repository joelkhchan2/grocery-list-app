-- Stage 3: optional per-item target ("alert me at or under") price for the 🔔 watch.
-- The grocery-watcher reads this alongside watch=true items and flags 🎯 when a
-- store hits it. Nullable; existing rows stay null. Run once in the Supabase SQL editor.
alter table items add column target_price numeric;
