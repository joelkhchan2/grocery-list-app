-- Shared "Deals this week" feed. The watcher replaces these rows each weekly run (service
-- key, bypassing RLS); both household accounts read them in the app. Run once (idempotent).
create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  item text not null,          -- the watch item this deal matched
  name text,                   -- flyer product name
  merchant text,
  price numeric,
  unit text,                   -- lb|kg|100g|ea for per-unit prices; null = shelf price
  target numeric,
  buy_now boolean not null default false,
  was_price numeric,
  discount_pct numeric,
  sale_story text,
  valid_to text,
  week_label text,
  created_at timestamptz not null default now()
);

alter table deals enable row level security;
drop policy if exists household_deals on deals;
create policy household_deals on deals for all
  using (auth.uid() in ('4ec75d05-7398-418c-99cf-aff7ac137602', 'c704c703-af29-461a-bb3c-651dd91ac5b1'))
  with check (auth.uid() in ('4ec75d05-7398-418c-99cf-aff7ac137602', 'c704c703-af29-461a-bb3c-651dd91ac5b1'));

-- Realtime so the app updates live when the weekly run posts.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'deals') then
    alter publication supabase_realtime add table deals;
  end if;
end $$;
