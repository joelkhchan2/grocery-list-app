-- Adds an optional per-item unit (e.g. "ml", "g", "bags") shown next to the quantity on the
-- clean item rows and edited in the item editor sheet. Quantity stays in `amount` (free text);
-- `unit` is the separate label. Run once (idempotent), then reload PostgREST's schema cache
-- so the column is writable immediately.
alter table items add column if not exists unit text;
notify pgrst, 'reload schema';
