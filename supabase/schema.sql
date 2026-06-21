-- SPUN — multi-user schema. Run once in Supabase → SQL Editor → New query → Run.
-- Every row is owned by a user (auth.uid()); row-level security makes each
-- person's collection private and invisible to everyone else.

create extension if not exists "pgcrypto";

-- ---------- tables ----------
create table if not exists public.records (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  album        text default '',
  artist       text default '',
  year         int,
  genre        text default '',
  notes        text default '',
  cover_url    text,
  cover_source text,
  has_photo    boolean default false,
  photo        text,                 -- personal photo as a data: URL (base64)
  label        text default '',
  catalog_no   text default '',
  tags         text[] default '{}',
  created_at   bigint,
  updated_at   bigint
);

create table if not exists public.plays (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  record_id uuid not null,
  played_at bigint
);

create table if not exists public.wants (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  album      text default '',
  artist     text default '',
  year       int,
  genre      text default '',
  notes      text default '',
  cover_url  text,
  created_at bigint
);

create index if not exists records_user_idx on public.records(user_id);
create index if not exists plays_user_idx   on public.plays(user_id);
create index if not exists plays_record_idx on public.plays(record_id);
create index if not exists wants_user_idx    on public.wants(user_id);

-- ---------- row-level security: owner-only ----------
alter table public.records enable row level security;
alter table public.plays   enable row level security;
alter table public.wants   enable row level security;

drop policy if exists "own records" on public.records;
drop policy if exists "own plays"   on public.plays;
drop policy if exists "own wants"   on public.wants;

create policy "own records" on public.records for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own plays" on public.plays for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own wants" on public.wants for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
