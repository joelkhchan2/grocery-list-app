-- A2: list templates. Run once in the Supabase SQL editor.
alter table lists add column is_template boolean not null default false;
