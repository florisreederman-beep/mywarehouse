-- MyWarehouse: database for accounts. Paste this whole file into Supabase → SQL Editor → Run.
-- Every user can only read and change their own rows (row level security).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  business text,
  phone text,
  city text,
  plan jsonb,              -- the floor plan
  updated_at timestamptz not null default now()
);

create table if not exists public.items (
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  data jsonb,              -- the whole item, including the photo
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, code)
);
create index if not exists items_user_updated on public.items (user_id, updated_at);

-- the server sets the time of every change, so devices with a wrong clock still sync correctly
create or replace function public.mw_touch() returns trigger language plpgsql as $$
begin new.updated_at = clock_timestamp(); return new; end $$;
drop trigger if exists items_touch on public.items;
create trigger items_touch before insert or update on public.items for each row execute function public.mw_touch();
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before insert or update on public.profiles for each row execute function public.mw_touch();

alter table public.profiles enable row level security;
alter table public.items enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own items" on public.items;
create policy "own items" on public.items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
