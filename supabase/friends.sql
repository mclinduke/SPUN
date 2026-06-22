-- SPUN — friends feature. Run ONCE in Supabase → SQL Editor → New query → Run.
-- (Safe to re-run; everything is create-if-not-exists / create-or-replace.)
--
-- Design: the base tables (records/plays/wants) keep their owner-only RLS — no
-- broad "friends can read" policy is ever added. Instead, a friend reads an
-- accepted friend's collection ONLY through SECURITY DEFINER functions that
-- check are_friends() first and decide exactly which columns to return. This
-- keeps the attack surface tiny: there is no way to read another user's rows
-- except via these gated functions.

-- ============================ pressing identifier ============================
-- Stores which exact pressing a user owns (Discogs release id + a snapshot:
-- year/country/label/catno/isOriginal). One jsonb column; null until identified.
-- Defined here (not only in schema.sql) so existing databases get it and the
-- friend-read function below can return it.
alter table public.records add column if not exists pressing jsonb;

-- ============================ profiles ============================
-- Mirrors auth.users so users can be found by email (to send a request) and
-- shown by name. Holds the per-user "share my notes with friends" opt-in.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  share_notes  boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user may read + update ONLY their own profile. Friend names/emails are
-- served via the SECURITY DEFINER functions below, never a broad select — so
-- the email directory can't be scraped.
drop policy if exists "own profile read"   on public.profiles;
drop policy if exists "own profile update" on public.profiles;
create policy "own profile read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Keep profiles synced with auth.users (email is the friend-lookup key).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do update set email = excluded.email;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.handle_new_user();

-- Backfill anyone who signed up before this migration (and refresh email on re-run).
insert into public.profiles (id, email, display_name)
select u.id, u.email, split_part(coalesce(u.email, ''), '@', 1)
from auth.users u
on conflict (id) do update set email = excluded.email;

-- Email is the friend-lookup key, so it must resolve to exactly one account.
create unique index if not exists profiles_email_lower_key on public.profiles (lower(email));

-- ============================ friendships ============================
create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index if not exists friendships_addressee_idx on public.friendships(addressee_id);
create index if not exists friendships_requester_idx on public.friendships(requester_id);
-- One row per pair regardless of direction — blocks opposite-direction duplicate
-- pending rows when two people request each other at the same instant.
create unique index if not exists friendships_pair_key on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table public.friendships enable row level security;

-- See rows you're part of; create only as the requester (pending); accept only
-- as the addressee; either party may delete (decline / cancel / unfriend).
drop policy if exists "see own friendships"   on public.friendships;
drop policy if exists "request friendship"    on public.friendships;
drop policy if exists "respond to friendship" on public.friendships;
drop policy if exists "delete friendship"     on public.friendships;
-- Reading your OWN edges is fine. Note there is deliberately NO insert/update/
-- delete policy: every write goes through the SECURITY DEFINER RPCs (which run
-- as the owner and bypass RLS). With RLS enabled and no permissive write policy,
-- direct table writes are denied even before grants are considered.
create policy "see own friendships" on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- CRITICAL (defense #2, redundant with the missing write policies above): the
-- RPCs are the ONLY write path. A prior version's loose UPDATE policy let a
-- client PATCH /rest/v1/friendships to forge an 'accepted' edge to any victim
-- and read their collection. Both the revoke AND the absent policies block that;
-- writes on public.friendships must NEVER be re-granted to authenticated/anon.
revoke insert, update, delete on public.friendships from authenticated, anon;

-- ============================ helpers ============================
create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

-- ============================ friend management ============================
-- Send a request by exact email. Returns a status string; if the other person
-- already requested YOU, this accepts it instead of creating a duplicate.
create or replace function public.send_friend_request(p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare target uuid; existing public.friendships;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into target from public.profiles
    where lower(email) = lower(trim(p_email)) and id <> auth.uid() limit 1;
  if target is null then return 'not_found'; end if;

  select * into existing from public.friendships f
    where (f.requester_id = auth.uid() and f.addressee_id = target)
       or (f.requester_id = target and f.addressee_id = auth.uid())
    limit 1;
  if found then
    if existing.status = 'accepted' then return 'already_friends'; end if;
    if existing.addressee_id = auth.uid() then
      update public.friendships set status = 'accepted', updated_at = now() where id = existing.id;
      return 'accepted';
    end if;
    return 'already_pending';
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (auth.uid(), target, 'pending');
  return 'requested';
end; $$;

-- All my friendships, enriched with the other person's name/email + direction.
create or replace function public.list_friends()
returns table (friendship_id uuid, other_id uuid, other_name text, other_email text, status text, direction text)
language sql stable security definer set search_path = public as $$
  select
    f.id,
    case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end,
    p.display_name,
    p.email,
    f.status,
    case
      when f.status = 'accepted' then 'friend'
      when f.requester_id = auth.uid() then 'outgoing'
      else 'incoming'
    end
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.requester_id = auth.uid() or f.addressee_id = auth.uid()
  order by f.status, f.updated_at desc;
$$;

-- Accept (addressee only) or decline/cancel/remove a pending request.
create or replace function public.respond_friend_request(p_friendship_id uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    update public.friendships set status = 'accepted', updated_at = now()
      where id = p_friendship_id and addressee_id = auth.uid() and status = 'pending';
    if not found then return 'no_op'; end if;
    return 'accepted';
  else
    delete from public.friendships
      where id = p_friendship_id and (addressee_id = auth.uid() or requester_id = auth.uid());
    return 'removed';
  end if;
end; $$;

create or replace function public.remove_friend(p_other_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.friendships
  where (requester_id = auth.uid() and addressee_id = p_other_id)
     or (requester_id = p_other_id and addressee_id = auth.uid());
$$;

-- ============================ read a friend's collection ============================
-- Records: only if accepted friends. notes are blanked unless the OWNER opted
-- in (profiles.share_notes); the personal photo blob is never shipped.
-- Explicit column list (not `setof public.records`) so it can't silently break
-- or leak a mislabeled column when the table gains columns later. user_id and
-- the photo blob are deliberately omitted; has_photo is forced false.
create or replace function public.get_friend_records(p_owner uuid)
returns table (
  id uuid, album text, artist text, year int, genre text, notes text,
  cover_url text, cover_source text, has_photo boolean,
  label text, catalog_no text, tags text[], created_at bigint, updated_at bigint,
  pressing jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.are_friends(auth.uid(), p_owner) then raise exception 'not friends'; end if;
  return query
    select r.id, r.album, r.artist, r.year, r.genre,
           case when (select share_notes from public.profiles where id = p_owner) then r.notes else '' end,
           r.cover_url, r.cover_source, false,
           r.label, r.catalog_no, r.tags, r.created_at, r.updated_at, r.pressing
    from public.records r
    where r.user_id = p_owner;
end; $$;

-- Plays: only if accepted friends (drives their listening stats).
create or replace function public.get_friend_plays(p_owner uuid)
returns table (id uuid, record_id uuid, played_at bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.are_friends(auth.uid(), p_owner) then raise exception 'not friends'; end if;
  return query select pl.id, pl.record_id, pl.played_at from public.plays pl where pl.user_id = p_owner;
end; $$;

-- ============================ grants ============================
-- Lock everything to PUBLIC/anon off first (Postgres grants EXECUTE to PUBLIC by
-- default — a common footgun), then grant only the callable RPCs to signed-in users.
revoke execute on function public.send_friend_request(text)             from public, anon;
revoke execute on function public.list_friends()                        from public, anon;
revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke execute on function public.remove_friend(uuid)                   from public, anon;
revoke execute on function public.get_friend_records(uuid)              from public, anon;
revoke execute on function public.get_friend_plays(uuid)               from public, anon;
grant execute on function public.send_friend_request(text)              to authenticated;
grant execute on function public.list_friends()                         to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean)  to authenticated;
grant execute on function public.remove_friend(uuid)                    to authenticated;
grant execute on function public.get_friend_records(uuid)               to authenticated;
grant execute on function public.get_friend_plays(uuid)                 to authenticated;
-- are_friends is INTERNAL ONLY: the gated read functions call it as the definer.
-- Never expose it to clients — directly callable it leaks whether any two
-- strangers are friends (social-graph disclosure).
revoke execute on function public.are_friends(uuid, uuid)               from public, anon, authenticated;
revoke execute on function public.handle_new_user()                     from public;
