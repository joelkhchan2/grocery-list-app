-- Optional per-item emoji (leading glyph on the item name). Nullable.
-- Run once in the Supabase SQL editor.
alter table items add column if not exists emoji text;
