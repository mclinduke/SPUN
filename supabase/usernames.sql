-- SPUN — usernames + find-friends-by-username. Run ONCE in Supabase → SQL Editor.
-- Safe / idempotent. Adds a public @handle people can search by, so friends no
-- longer need to share an email. Search returns ONLY username + display name —
-- never the email (that stays owner-only via the profiles RLS from friends.sql).

-- ---------- username column ----------
alter table public.profiles add column if not exists username text;
-- case-insensitive unique handle (nulls allowed until a user claims one)
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username)) where username is not null;

-- ---------- claim / change a username ----------
-- Returns 'ok' | 'invalid' | 'taken'. 3-20 chars, lowercase letters/digits/_.
create or replace function public.set_username(p_username text)
returns text language plpgsql security definer set search_path = public as $$
declare u text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  u := lower(trim(p_username));
  if u !~ '^[a-z0-9_]{3,20}$' then return 'invalid'; end if;
  if exists (select 1 from public.profiles p where lower(p.username) = u and p.id <> auth.uid()) then
    return 'taken';
  end if;
  update public.profiles set username = u where id = auth.uid();
  return 'ok';
end; $$;

-- ---------- search users by username prefix ----------
-- Handles are public-by-design (that's the point of a username). Email is NEVER
-- returned here. Prefix match, capped at 10, excludes the caller.
create or replace function public.search_users(p_query text)
returns table (id uuid, username text, display_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name
  from public.profiles p
  where p.username is not null
    and p.id <> auth.uid()
    and char_length(trim(p_query)) >= 2
    and lower(p.username) like lower(trim(p_query)) || '%'
  order by p.username
  limit 10;
$$;

-- ---------- shared request logic (internal; clients never call this directly) ----------
create or replace function public._request_friend(target uuid)
returns text language plpgsql security definer set search_path = public as $$
declare existing public.friendships;
begin
  if target is null or target = auth.uid() then return 'not_found'; end if;
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
  insert into public.friendships (requester_id, addressee_id, status) values (auth.uid(), target, 'pending');
  return 'requested';
end; $$;

-- ---------- send a request by username ----------
create or replace function public.send_friend_request_username(p_username text)
returns text language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into target from public.profiles
    where lower(username) = lower(trim(p_username)) and id <> auth.uid() limit 1;
  if target is null then return 'not_found'; end if;
  return public._request_friend(target);
end; $$;

-- ---------- list_friends now also returns the other person's @username ----------
-- (RETURNS TABLE shape changes, so drop + recreate.)
drop function if exists public.list_friends();
create or replace function public.list_friends()
returns table (friendship_id uuid, other_id uuid, other_name text, other_username text, other_email text, status text, direction text)
language sql stable security definer set search_path = public as $$
  select
    f.id,
    case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end,
    p.display_name,
    p.username,
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

-- ---------- grants ----------
revoke execute on function public._request_friend(uuid)               from public, anon, authenticated;
revoke execute on function public.set_username(text)                  from public, anon;
revoke execute on function public.search_users(text)                  from public, anon;
revoke execute on function public.send_friend_request_username(text)  from public, anon;
revoke execute on function public.list_friends()                      from public, anon;
grant  execute on function public.set_username(text)                  to authenticated;
grant  execute on function public.search_users(text)                  to authenticated;
grant  execute on function public.send_friend_request_username(text)  to authenticated;
grant  execute on function public.list_friends()                      to authenticated;
