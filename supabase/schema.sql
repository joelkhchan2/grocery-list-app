-- lists + items
create table lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text,
  sort_order int not null default 0,
  is_template boolean not null default false,   -- true = a reusable template, hidden from the main lists
  created_by uuid default auth.uid(),   -- who added it (for future "who added this" UI); null for admin/dashboard inserts
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  name text not null,
  amount text not null default '1',
  checked boolean not null default false,
  watch boolean not null default false,
  note text,
  store text,
  sort_order int not null default 0,
  created_by uuid default auth.uid(),   -- who added it (for future "who added this" UI); null for admin/dashboard inserts
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_list_id_idx on items(list_id);

-- bump updated_at on every write
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
create trigger lists_touch before update on lists for each row execute function touch_updated_at();
create trigger items_touch before update on items for each row execute function touch_updated_at();

-- RLS scoped to the two household accounts (Joel + Gabrielle, each their own login).
-- Data is shared (household-global), so both accounts get identical full access;
-- every other user is denied. UIDs below are the real Auth -> Users ids for this project.
alter table lists enable row level security;
alter table items enable row level security;
-- first uid = Joel's account, second = Gabrielle's account (see Supabase Auth → Users)
create policy household_lists on lists for all
  using (auth.uid() in ('4ec75d05-7398-418c-99cf-aff7ac137602', 'c704c703-af29-461a-bb3c-651dd91ac5b1'))
  with check (auth.uid() in ('4ec75d05-7398-418c-99cf-aff7ac137602', 'c704c703-af29-461a-bb3c-651dd91ac5b1'));
create policy household_items on items for all
  using (auth.uid() in ('4ec75d05-7398-418c-99cf-aff7ac137602', 'c704c703-af29-461a-bb3c-651dd91ac5b1'))
  with check (auth.uid() in ('4ec75d05-7398-418c-99cf-aff7ac137602', 'c704c703-af29-461a-bb3c-651dd91ac5b1'));

-- Item history: autocomplete + "recently used" suggestions across the household
create table item_history (
  name_key text primary key,          -- lower(trim(name)); case-insensitive dedup key
  name text not null,                 -- display name, as last entered
  uses int not null default 1,
  last_amount text,
  last_note text,
  last_used timestamptz not null default now()
);
alter table item_history enable row level security;
create policy household_history on item_history for all
  using (auth.uid() in ('4ec75d05-7398-418c-99cf-aff7ac137602', 'c704c703-af29-461a-bb3c-651dd91ac5b1'))
  with check (auth.uid() in ('4ec75d05-7398-418c-99cf-aff7ac137602', 'c704c703-af29-461a-bb3c-651dd91ac5b1'));

-- Realtime: publish both tables
alter publication supabase_realtime add table lists;
alter publication supabase_realtime add table items;
