-- 024_drop_publish_key.sql (10/26): retire the legacy publish key. Since 10/21 the UI publishes only from a signed-in
-- account (hooks/useMeetSync.js canPublish = signedIn); the key path in zt_publish_meet was the last way to write a meet
-- without an account, and the only way to create an ownerless meet. Prod and staging each had 1 key row and 0
-- ownerless meets on 10/26 (checked before writing this).
--
-- 1. zt_publish_meet(p_meet, p_divisions, p_events, p_athletes, p_results): same body as 010 minus p_key / v_keyed.
--    A null auth.uid() is refused. Existing meet: the caller must be a member (owner/admin). An ownerless meet (the
--    owner account was deleted: meets.owner_id is "on delete set null") can be taken over only by a remaining member;
--    anyone else is refused instead of claiming it (006 Astra A1 kept its teeth without the key).
-- 2. zt_publish_meet(p_key, p_meet, ...) stays as a thin shim for phones still running the previous build: it ignores
--    p_key and calls the new function. PostgREST picks the overload by the argument names it receives, so old and new
--    clients both resolve. Drop the shim in a later migration once every phone is past the 10/26 build.
-- 3. publish_keys is dropped. Grants: authenticated + service_role only (018 listed this RPC as "anon by design";
--    no longer).
--
-- Verify (staging, then prod with Kurt's go):
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname = 'zt_publish_meet';
--   select grantee, privilege_type from information_schema.routine_privileges where routine_name = 'zt_publish_meet';
--   select to_regclass('publish_keys');   -- null

drop function if exists zt_publish_meet(text, jsonb, jsonb, jsonb, jsonb, jsonb);

create or replace function zt_publish_meet(
  p_meet jsonb,
  p_divisions jsonb default '[]', p_events jsonb default '[]', p_athletes jsonb default '[]', p_results jsonb default '[]'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text; m meets%rowtype; v_uid uuid; v_owner uuid; v_linked_name text; v_pin text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'sign in to your ZeroTacky account to publish this meet' using errcode = '42501';
  end if;

  select * into m from jsonb_populate_record(null::meets, p_meet);
  -- same slug = same meet: a phone that left and re-publishes, or a second admin phone, updates in place
  v_id := coalesce((select id from meets where slug = m.slug), m.id, gen_random_uuid());

  -- Existing meet: the caller must be a member (owner/admin). 024: with the publish key gone there is no claim path for
  -- strangers; an ownerless meet goes to a remaining member or stays put.
  select owner_id into v_owner from meets where id = v_id;
  if found then
    if not exists (select 1 from meet_members where meet_id = v_id and user_id = v_uid) then
      if v_owner is null then
        raise exception 'this meet has no owner on file and your account is not one of its admins; contact ZeroTacky to recover it' using errcode = '42501';
      end if;
      raise exception 'this meet belongs to another promoter' using errcode = '42501';
    end if;
  end if;

  -- 008 (R2): an athlete on the roster through an accepted registration leaves through the registration, never
  -- through a publish that no longer lists them (a stale admin phone, or a deliberate delete on the phone).
  select r.name into v_linked_name
  from registrations r
  where r.meet_id = v_id and r.status = 'accepted' and r.athlete_id is not null
    and r.athlete_id not in (select a.id from jsonb_populate_recordset(null::athletes, coalesce(p_athletes, '[]'::jsonb)) a)
  limit 1;
  if v_linked_name is not null then
    raise exception '% is on the roster through an accepted registration. Decline or withdraw that registration in the promoter dashboard instead of deleting the athlete.',
      v_linked_name using errcode = 'P0001';
  end if;

  -- 010: the phone publishes is_demo from the preset flag. A new meet takes it as sent; an existing meet can be flipped
  -- demo -> real by any publisher (the promoter toggling "this is a real meet" on the phone) but never real -> demo,
  -- so a stale device still carrying the preset flag cannot pull a live meet off /shows or put DEMO on its scoreboard.
  -- G2-H1 (Astra gate 2): the PIN decision is made here, on the nullable input, not in the ON CONFLICT clause. There
  -- `excluded.admin_pin` is the VALUES expression, which had already been defaulted to '1050', so a null from a
  -- joined phone reset the real PIN to 1050 (reproduced live by Astra). New row: payload PIN or '1050'. Existing
  -- row: payload PIN when present, else the server's.
  v_pin := nullif(trim(m.admin_pin), '');
  insert into meets (id, slug, name, date, owner_id, admin_pin, run_order_method, tiebreaker_rule,
                     available_plates, collar_weight_per_pair, stations, is_demo)
  values (v_id, m.slug, m.name, m.date, v_uid, coalesce(v_pin, '1050'),
          coalesce(m.run_order_method, 'reverse_overall'), coalesce(m.tiebreaker_rule, 'event_wins'),
          coalesce(m.available_plates, '{100,55,45,35,25,15,10,5,2.5}'), coalesce(m.collar_weight_per_pair, 0),
          coalesce(m.stations, '[{"id":"A","label":"Station 1"},{"id":"B","label":"Station 2"}]'), coalesce(m.is_demo, false))
  on conflict (id) do update set
    slug = excluded.slug, name = excluded.name, date = excluded.date,
    admin_pin = coalesce(v_pin, meets.admin_pin, '1050'),   -- 008 (R1, G2-H1): null keeps the server's PIN
    run_order_method = excluded.run_order_method, tiebreaker_rule = excluded.tiebreaker_rule,
    available_plates = excluded.available_plates, collar_weight_per_pair = excluded.collar_weight_per_pair,
    stations = excluded.stations,
    is_demo = (meets.is_demo and excluded.is_demo),   -- 010: a real meet stays real; only a demo can be re-published as demo
    updated_at = now(),
    owner_id = coalesce(meets.owner_id, excluded.owner_id)
  returning id, join_code into v_id, v_code;
  -- 006 (Astra A1/A2), 024: membership is written only when this call made the caller the owner (new meet, or a
  -- remaining member taking over an ownerless meet). A member publishing an owned meet gains nothing.
  if v_uid is not null and (select owner_id from meets where id = v_id) = v_uid then
    insert into meet_members (meet_id, user_id, role) values (v_id, v_uid, 'owner') on conflict do nothing;
  end if;

  insert into divisions (id, meet_id, name, flight, sort_order)
  select d.id, v_id, d.name, coalesce(d.flight, 'A'), coalesce(d.sort_order, 0)
  from jsonb_populate_recordset(null::divisions, p_divisions) d
  on conflict (meet_id, id) do update set name = excluded.name, flight = excluded.flight, sort_order = excluded.sort_order;

  insert into events (id, meet_id, event_number, name, scoring_type, time_cap_seconds, lanes, loading_points,
                      weight_entry_mode, implement_empty_weight, config)
  select e.id, v_id, e.event_number, e.name, e.scoring_type, coalesce(e.time_cap_seconds, 60), coalesce(e.lanes, 1),
         coalesce(e.loading_points, 0), coalesce(e.weight_entry_mode, 'total'), coalesce(e.implement_empty_weight, 0),
         coalesce(e.config, '{}')
  from jsonb_populate_recordset(null::events, p_events) e
  on conflict (meet_id, id) do update set
    event_number = excluded.event_number, name = excluded.name, scoring_type = excluded.scoring_type,
    time_cap_seconds = excluded.time_cap_seconds, lanes = excluded.lanes, loading_points = excluded.loading_points,
    weight_entry_mode = excluded.weight_entry_mode, implement_empty_weight = excluded.implement_empty_weight,
    config = excluded.config;

  insert into athletes (id, meet_id, division_id, name, bodyweight, lot_number, status, rack_heights)
  select a.id, v_id, a.division_id, a.name, a.bodyweight, coalesce(a.lot_number, 0), coalesce(a.status, 'active'),
         coalesce(a.rack_heights, '{}')
  from jsonb_populate_recordset(null::athletes, p_athletes) a
  on conflict (meet_id, id) do update set
    division_id = excluded.division_id, name = excluded.name, bodyweight = excluded.bodyweight,
    lot_number = excluded.lot_number, status = excluded.status, rack_heights = excluded.rack_heights;

  -- stale children (removed on the admin phone) go away; 004 refuses scored rows, the R2 check above refused
  -- accepted registrants before anything was written
  delete from athletes  where meet_id = v_id and id not in (select id from jsonb_populate_recordset(null::athletes,  p_athletes));
  delete from events    where meet_id = v_id and id not in (select id from jsonb_populate_recordset(null::events,    p_events));
  delete from divisions where meet_id = v_id and id not in (select id from jsonb_populate_recordset(null::divisions, p_divisions));

  insert into results (id, meet_id, event_id, athlete_id, payload, locked, updated_at, updated_by)
  select r.id, v_id, r.event_id, r.athlete_id, coalesce(r.payload, '{}'), coalesce(r.locked, false),
         coalesce(r.updated_at, now()), r.updated_by
  from jsonb_populate_recordset(null::results, p_results) r
  on conflict (meet_id, id) do update set
    payload = excluded.payload, locked = excluded.locked, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
    -- results_stamp trigger drops the update when excluded.updated_at is older, else sets server_at

  return jsonb_build_object('id', v_id, 'join_code', v_code);
end $$;
revoke execute on function zt_publish_meet(jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function zt_publish_meet(jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;

-- 2. shim for the previous build (sends p_key). The key is ignored; auth.uid() decides, as above.
create or replace function zt_publish_meet(
  p_key text, p_meet jsonb,
  p_divisions jsonb default '[]', p_events jsonb default '[]', p_athletes jsonb default '[]', p_results jsonb default '[]'
) returns jsonb language sql security definer set search_path = public as $$
  select zt_publish_meet(p_meet, p_divisions, p_events, p_athletes, p_results);
$$;
revoke execute on function zt_publish_meet(text, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function zt_publish_meet(text, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;

-- 3. the key table
drop table if exists publish_keys;
