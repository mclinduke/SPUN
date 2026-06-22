-- SPUN — Groups + "what your friends are spinning" feed. Run ONCE in Supabase →
-- SQL Editor. Requires friends.sql (profiles) to have run first. Safe/idempotent.
--
-- Same hardened pattern as friends/usernames: base tables (plays/records) keep
-- owner-only RLS; all cross-member reads go through SECURITY DEFINER functions
-- gated on group membership; direct writes to the group tables are revoked so
-- the RPCs are the only path. No email is ever exposed.

-- ============================ tables ============================
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  invite_code text not null unique,
  created_at  timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members(user_id);

alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
-- All access is via the SECURITY DEFINER RPCs below. No permissive policy + a
-- revoke = direct client reads/writes denied two ways.
revoke insert, update, delete on public.groups        from authenticated, anon;
revoke insert, update, delete on public.group_members from authenticated, anon;

-- ============================ helper ============================
create or replace function public.in_group(p_uid uuid, p_gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members m where m.group_id = p_gid and m.user_id = p_uid);
$$;

-- ============================ create / join / leave ============================
create or replace function public.create_group(p_name text)
returns table (id uuid, name text, invite_code text)
language plpgsql security definer set search_path = public as $$
declare gid uuid; code text; nm text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  nm := nullif(trim(p_name), '');
  if nm is null then raise exception 'name required'; end if;
  for i in 1..6 loop
    code := lower(substr(md5(gen_random_uuid()::text), 1, 6));
    begin
      insert into public.groups (owner_id, name, invite_code) values (auth.uid(), nm, code) returning groups.id into gid;
      exit;
    exception when unique_violation then gid := null; end;
  end loop;
  if gid is null then raise exception 'could not create group, try again'; end if;
  insert into public.group_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return query select gid, nm, code;
end; $$;

create or replace function public.join_group(p_code text)
returns table (id uuid, name text)
language plpgsql security definer set search_path = public as $$
declare gid uuid; nm text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select g.id, g.name into gid, nm from public.groups g where g.invite_code = lower(trim(p_code)) limit 1;
  if gid is null then return; end if; -- no match → empty result, client shows "not found"
  insert into public.group_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return query select gid, nm;
end; $$;

create or replace function public.leave_group(p_gid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.group_members where group_id = p_gid and user_id = auth.uid();
  -- clean up an empty group the caller owned
  delete from public.groups g where g.id = p_gid and g.owner_id = auth.uid()
    and not exists (select 1 from public.group_members m where m.group_id = p_gid);
end; $$;

-- ============================ reads (membership-gated) ============================
create or replace function public.list_my_groups()
returns table (id uuid, name text, invite_code text, member_count bigint, is_owner boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.invite_code,
         (select count(*) from public.group_members m2 where m2.group_id = g.id),
         g.owner_id = auth.uid()
  from public.groups g
  join public.group_members m on m.group_id = g.id and m.user_id = auth.uid()
  order by g.created_at desc;
$$;

create or replace function public.group_members_list(p_gid uuid)
returns table (user_id uuid, username text, display_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.in_group(auth.uid(), p_gid) then raise exception 'not a member'; end if;
  return query
    select p.id, p.username, p.display_name
    from public.group_members m join public.profiles p on p.id = m.user_id
    where m.group_id = p_gid
    order by p.username nulls last;
end; $$;

-- The feed: recent spins across every member of a group I'm in. Exposes only
-- album/artist/cover + who + when — never notes, photos, or email.
create or replace function public.group_feed(p_gid uuid, p_limit int default 60)
returns table (user_id uuid, username text, display_name text, record_id uuid, album text, artist text, cover_url text, played_at bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.in_group(auth.uid(), p_gid) then raise exception 'not a member'; end if;
  return query
    select pl.user_id, p.username, p.display_name, r.id, r.album, r.artist, r.cover_url, pl.played_at
    from public.plays pl
    join public.group_members m on m.group_id = p_gid and m.user_id = pl.user_id
    join public.profiles p on p.id = pl.user_id
    join public.records r on r.id = pl.record_id
    order by pl.played_at desc
    limit least(coalesce(p_limit, 60), 200);
end; $$;

-- ============================ grants ============================
revoke execute on function public.in_group(uuid, uuid)            from public, anon, authenticated;
revoke execute on function public.create_group(text)             from public, anon;
revoke execute on function public.join_group(text)               from public, anon;
revoke execute on function public.leave_group(uuid)              from public, anon;
revoke execute on function public.list_my_groups()               from public, anon;
revoke execute on function public.group_members_list(uuid)       from public, anon;
revoke execute on function public.group_feed(uuid, int)          from public, anon;
grant  execute on function public.create_group(text)             to authenticated;
grant  execute on function public.join_group(text)               to authenticated;
grant  execute on function public.leave_group(uuid)              to authenticated;
grant  execute on function public.list_my_groups()               to authenticated;
grant  execute on function public.group_members_list(uuid)       to authenticated;
grant  execute on function public.group_feed(uuid, int)          to authenticated;
