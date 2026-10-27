-- 029_profile_links.sql (10/27): Athlete Directory leftovers (ROADMAP s7 items 3 and 5).
--
-- 1. profiles.home_gym_id: the home gym as a directory row, next to the free-text home_gym_name (kept for gyms that
--    are not listed). Owner-updatable like the other 013 fields; the public page shows the gym as a link when the row
--    is still listed (unclaimed or claimed). "on delete set null" so removing a gym never breaks a profile.
-- 2. zt_profile_links(p_username): one anon-callable read for the public profile page: the home gym (slug + name),
--    the listed shows this person runs (when they wear the Promoter badge) and the claimed gyms they own (when they
--    wear the Gym owner badge). Answers only for PUBLIC profiles, returns no account ids, and reads meets.owner_id /
--    gyms.owner_id inside the function so neither column needs a public grant. The badge gates mean the person
--    controls what shows from their account page; unticking Promoter hides the shows block.
--
-- Verify (staging, then prod with Kurt's go):
--   select column_name from information_schema.columns where table_name = 'profiles' and column_name = 'home_gym_id';
--   select grantee, privilege_type from information_schema.column_privileges
--    where table_name = 'profiles' and column_name = 'home_gym_id';                  -- authenticated UPDATE (+ table-level SELECT/INSERT)
--   select zt_profile_links('slate');                                                 -- {"home_gym":..., "shows":[...], "gyms":[...]}
--   select zt_profile_links('nobody');                                                -- {}

alter table profiles add column if not exists home_gym_id uuid references gyms(id) on delete set null;
create index if not exists profiles_home_gym_id_idx on profiles (home_gym_id);
grant update (home_gym_id) on profiles to authenticated;

create or replace function zt_profile_links(p_username text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid; v_promoter boolean; v_gym_owner boolean; v_home jsonb; v_shows jsonb; v_gyms jsonb;
begin
  select id, is_promoter, is_gym_owner into v_uid, v_promoter, v_gym_owner from profiles
   where is_public and username is not null and lower(username) = lower(trim(both from coalesce(p_username, '')));
  if v_uid is null then
    return '{}'::jsonb;
  end if;

  select jsonb_build_object('slug', g.slug, 'name', g.name, 'city', g.city, 'state', g.state)
    into v_home
    from profiles p join gyms g on g.id = p.home_gym_id
   where p.id = v_uid and g.status in ('unclaimed', 'claimed');

  if v_promoter then
    select coalesce(jsonb_agg(row_to_json(q)::jsonb order by q.date desc nulls last, q.name), '[]'::jsonb)
      into v_shows
      from (
        select m.slug, m.name, m.date, m.competition_status, m.registration_status,
               (m.venue ->> 'city') as venue_city, (m.venue ->> 'state') as venue_state
          from meets m
         where m.owner_id = v_uid and m.is_public_listed and m.is_demo = false
      ) q;
  else
    v_shows := '[]'::jsonb;
  end if;

  if v_gym_owner then
    select coalesce(jsonb_agg(row_to_json(q)::jsonb order by q.name), '[]'::jsonb)
      into v_gyms
      from (
        select g.slug, g.name, g.city, g.state, g.gym_type
          from gyms g
         where g.owner_id = v_uid and g.status = 'claimed'
      ) q;
  else
    v_gyms := '[]'::jsonb;
  end if;

  return jsonb_build_object('home_gym', v_home, 'shows', v_shows, 'gyms', v_gyms);
end $$;
revoke all on function zt_profile_links(text) from public;
grant execute on function zt_profile_links(text) to anon, authenticated;
