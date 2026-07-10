-- Watch-match parity with the yaml file: optional per-item keyword tuning.
-- match_keywords: comma-separated whole-token phrases the watcher matches on
--   (empty = derive from the item name). negative_keywords: comma-separated phrases
--   that veto a match (e.g. exclude bundles). Both nullable. Run once in the SQL editor.
alter table items add column if not exists match_keywords text;
alter table items add column if not exists negative_keywords text;
