-- 020_athlete_directory.sql (v2, 10/21, ROADMAP s7): public athlete profiles at /athletes/<username>, listed at
-- /athletes. Two new columns on profiles (username, is_public), a read-only view that exposes only the public
-- columns of opted-in rows, a username RPC that owns validation, uniqueness and the 30-day hold on released names.
-- Nothing changes for a profile that never opts in: is_public defaults false and the base table keeps its own-row
-- RLS, so the view is the only public read path. Safe to re-run. Staging first, prod on Kurt's go.

-- ---------- columns ----------
alter table profiles
  add column if not exists username  text,
  add column if not exists is_public boolean not null default false;

-- Lowercase, 3-30 chars, letters digits underscore. The RPC lowercases; the check makes sure nothing else can store
-- a different shape.
alter table profiles drop constraint if exists profiles_username_shape;
alter table profiles add constraint profiles_username_shape
  check (username is null or username ~ '^[a-z0-9_]{3,30}$');
-- A public profile needs a URL; the account page turns is_public off when the username is cleared, this backs it.
alter table profiles drop constraint if exists profiles_public_needs_username;
alter table profiles add constraint profiles_public_needs_username
  check (not is_public or username is not null);
create unique index if not exists profiles_username_key on profiles (username) where username is not null;

-- Owner may flip visibility directly (same column-grant pattern as 006/013); username only moves through the RPC.
grant update (is_public) on profiles to authenticated;

-- ---------- released usernames: 30-day hold ----------
-- When a user changes or clears their username the old one is held so a stranger cannot pick up the link right away.
-- The previous owner can take it back at any time.
create table if not exists username_holds (
  username    text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  released_at timestamptz not null default now()
);
alter table username_holds enable row level security;
revoke all on username_holds from anon, authenticated;   -- no policies: only the RPC (security definer) touches it

-- Words that would collide with routes or read as official. Lowercase; compared after the RPC lowercases.
create or replace function zt_username_reserved(p text) returns boolean language sql immutable as $$
  select p = any (array[
    'admin', 'administrator', 'root', 'system', 'support', 'help', 'staff', 'team', 'official', 'moderator', 'mod',
    'zerotacky', 'zt', 'slate', 'api', 'www', 'app', 'athletes', 'athlete', 'shows', 'show', 'gyms', 'gym', 'trainers',
    'trainer', 'promoter', 'promoters', 'account', 'settings', 'login', 'signin', 'signup', 'register', 'join', 'scorer',
    'demo', 'legal', 'terms', 'privacy', 'about', 'contact', 'me', 'you', 'null', 'undefined', 'anonymous', 'unknown'
  ]);
$$;

-- Set, change or clear (null / '') the caller's username. Returns the stored value. Raises with a plain message the
-- account page shows as-is.
create or replace function zt_set_username(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_new  text := lower(trim(coalesce(p_username, '')));
  v_old  text;
  v_hold username_holds%rowtype;
begin
  if v_uid is null then
    raise exception 'Sign in first.';
  end if;
  select username into v_old from profiles where id = v_uid for update;
  if not found then
    raise exception 'No profile for this account.';
  end if;

  if v_new = '' then
    -- Clearing also unlists the profile (constraint above would refuse otherwise).
    if v_old is not null then
      insert into username_holds (username, user_id, released_at) values (v_old, v_uid, now())
        on conflict (username) do update set user_id = excluded.user_id, released_at = excluded.released_at;
    end if;
    update profiles set username = null, is_public = false where id = v_uid;
    return null;
  end if;

  if v_new = v_old then
    return v_old;
  end if;
  if v_new !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'Usernames are 3 to 30 characters: lowercase letters, numbers and underscores.';
  end if;
  if zt_username_reserved(v_new) then
    raise exception 'That username is reserved.';
  end if;
  if exists (select 1 from profiles where username = v_new and id <> v_uid) then
    raise exception 'That username is taken.';
  end if;
  select * into v_hold from username_holds where username = v_new;
  if found and v_hold.user_id <> v_uid and v_hold.released_at > now() - interval '30 days' then
    raise exception 'That username was released recently and is on hold for 30 days.';
  end if;

  if v_old is not null then
    insert into username_holds (username, user_id, released_at) values (v_old, v_uid, now())
      on conflict (username) do update set user_id = excluded.user_id, released_at = excluded.released_at;
  end if;
  delete from username_holds where username = v_new;
  update profiles set username = v_new where id = v_uid;
  return v_new;
exception
  when unique_violation then
    raise exception 'That username is taken.';
end $$;
revoke all on function zt_set_username(text) from public, anon, authenticated;
grant execute on function zt_set_username(text) to authenticated;

-- Availability check for the account page (typing feedback). Reserved and held names read as unavailable.
create or replace function zt_username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null
     and lower(trim(coalesce(p_username, ''))) ~ '^[a-z0-9_]{3,30}$'
     and not zt_username_reserved(lower(trim(p_username)))
     and not exists (select 1 from profiles where username = lower(trim(p_username)) and id <> auth.uid())
     and not exists (select 1 from username_holds h
                      where h.username = lower(trim(p_username)) and h.user_id <> auth.uid()
                        and h.released_at > now() - interval '30 days');
$$;
revoke all on function zt_username_available(text) from public, anon, authenticated;
grant execute on function zt_username_available(text) to authenticated;

-- ---------- public read ----------
-- The view is the public surface (same pattern as zt_public_meets in 005): it runs as its owner, so the base table's
-- own-row RLS does not apply, and the WHERE is the opt-in gate. email, created_at and anything not listed never
-- leave the table. security_barrier keeps a leaky function in a caller's WHERE from seeing non-public rows.
create or replace view zt_public_profiles
with (security_barrier = true) as
  select id, username, display_name, is_athlete, is_promoter, is_gym_owner, is_trainer, trainer_in_person, trainer_online,
         favorite_lift, favorite_lift_note, location, home_gym_name, prs, socials, avatar_path, updated_at
    from profiles
   where is_public and username is not null;
revoke all on zt_public_profiles from public, anon, authenticated;
grant select on zt_public_profiles to anon, authenticated;

-- Verify (run after apply):
--   select username, is_public from profiles where username is not null;
--   select count(*) from zt_public_profiles;                       -- as anon via REST: /rest/v1/zt_public_profiles
--   select zt_username_available('admin');                         -- false (reserved) as any signed-in user
