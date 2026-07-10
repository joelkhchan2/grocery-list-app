-- Price history: the watcher logs the best observed price per watched item each weekly run
-- (writes with the service key, bypassing RLS). The app reads it to suggest a target price.
-- Run once in the Supabase SQL editor (idempotent).
create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  item_key text not null,            -- lower(trim(name)); groups observations per item
  name text not null,
  merchant text,
  price numeric not null,
  unit text,                         -- lb|kg|100g|ea for per-unit prices; null = shelf price
  observed_on timestamptz not null default now()
);
create index if not exists price_history_item_idx on price_history(item_key);

alter table price_history enable row level security;
drop policy if exists household_price_history on price_history;
create policy household_price_history on price_history for all
  using (auth.uid() in ('4ec75d05-7398-418c-99cf-aff7ac137602', 'c704c703-af29-461a-bb3c-651dd91ac5b1'))
  with check (auth.uid() in ('4ec75d05-7398-418c-99cf-aff7ac137602', 'c704c703-af29-461a-bb3c-651dd91ac5b1'));
