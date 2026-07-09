alter table items rename column quantity to amount;
alter table items alter column amount type text using amount::text;
alter table items alter column amount set default '1';
alter table items add column note text;

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
