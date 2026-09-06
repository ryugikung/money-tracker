-- Run this entire file in Supabase SQL Editor before opening the app.

create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  type text not null check (type in ('income','expense')),
  color text not null default '#8c73db',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id, name, type)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  type text not null check (type in ('income','expense')),
  amount numeric(12,2) not null check (amount > 0),
  note text check (char_length(note) <= 120),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'lavender' check (theme in ('light','dark','lavender','peach','mint')),
  currency text not null default 'THB',
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx on public.transactions(user_id, occurred_at desc);
create index if not exists categories_user_idx on public.categories(user_id);

alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.preferences enable row level security;

-- Recreate policies safely.
drop policy if exists "categories_own_rows" on public.categories;
create policy "categories_own_rows" on public.categories
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "transactions_own_rows" on public.transactions;
create policy "transactions_own_rows" on public.transactions
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "preferences_own_row" on public.preferences;
create policy "preferences_own_row" on public.preferences
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Permissions for the browser client. RLS still restricts each row to its owner.
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.preferences to authenticated;

-- Add starter categories whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.preferences(user_id) values (new.id) on conflict do nothing;

  insert into public.categories(user_id, name, type, color, is_default) values
    (new.id, 'Food', 'expense', '#f59e8b', true),
    (new.id, 'Transport', 'expense', '#6baed6', true),
    (new.id, 'Shopping', 'expense', '#b994e7', true),
    (new.id, 'Bills', 'expense', '#f1c75b', true),
    (new.id, 'Health', 'expense', '#65c3a5', true),
    (new.id, 'Entertainment', 'expense', '#eb83a9', true),
    (new.id, 'Education', 'expense', '#7d9ee6', true),
    (new.id, 'Other', 'expense', '#a8a8b3', true),
    (new.id, 'Salary', 'income', '#4caf7a', true),
    (new.id, 'Freelance', 'income', '#5cb8a9', true),
    (new.id, 'Gift', 'income', '#a58ce3', true),
    (new.id, 'Other', 'income', '#7bb68a', true)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill defaults for users created before this SQL was run.
insert into public.preferences(user_id)
select id from auth.users
on conflict do nothing;
