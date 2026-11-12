-- 059_meet_units.sql (11/12): a meet is run in pounds and feet or in kilograms and meters (kg/m build, session 1).
-- Every stored weight / distance number in a meet (division weights, rising bar, tare, collars, plates, course, judged
-- marks in results.payload maxWeightLbs / distanceFeet) is in the meet's unit; nothing is converted. The engine is
-- arithmetic and never reads the unit; the app labels from it.
--
-- 1. meets.units text not null default 'imperial' ('imperial' | 'metric'), select to anon + authenticated.
-- 2. zt_publish_meet (057 body) and zt_save_meet_config (055 body) persist units; both refuse a change once the meet has
--    results. save's tiebreaker fallback literal becomes 'lookback' (matches the 057 default; it was unreachable).
-- 3. zt_my_meets / zt_get_my_meet / zt_public_meet_by_slug (054 bodies) return units.
-- Not changed: zt_event_spec_guard (041) still caps courseFeet at 5280 for every meet; the app caps a metric course at
-- 1610 before it gets here, so the guard is a backstop only.
--
-- Verify:
--   select column_name, column_default from information_schema.columns where table_name = 'meets' and column_name = 'units';
--   select grantee from information_schema.column_privileges where table_name = 'meets' and column_name = 'units' order by 1;
--   select units, count(*) from meets group by 1;   -- all imperial right after the migration
--   select pg_get_functiondef('zt_save_meet_config(uuid,jsonb,jsonb,jsonb,jsonb,timestamptz)'::regprocedure) like '%units%';

alter table meets add column if not exists units text not null default 'imperial';
alter table meets drop constraint if exists meets_units_chk;
alter table meets add constraint meets_units_chk check (units in ('imperial', 'metric'));
grant select (units) on meets to anon, authenticated;

-- ---------- zt_publish_meet: 057 body + units (locked once results exist) ----------
create or replace function zt_publish_meet(
  p_meet jsonb,
  p_divisions jsonb default '[]', p_events jsonb default '[]', p_athletes jsonb default '[]', p_results jsonb default '[]'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text; m meets%rowtype; v_uid uuid; v_owner uuid; v_linked_name text; v_pin text; v_units text;
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

  -- 059: units are set before the first result and never converted. A publish that would flip them on a meet with
  -- results is refused; a phone that sends none keeps the server's value.
  if m.units is not null and m.units not in ('imperial', 'metric') then
    raise exception 'Units must be imperial or metric.' using errcode = 'P0001';
  end if;
  select units into v_units from meets where id = v_id;
  if v_units is not null and m.units is not null and m.units <> v_units
     and exists (select 1 from results r where r.meet_id = v_id) then
    raise exception 'This meet has results in %; units cannot change now.', case when v_units = 'metric' then 'kilograms and meters' else 'pounds and feet' end using errcode = 'P0001';
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
                     available_plates, collar_weight_per_pair, stations, is_demo, division_format, units)
  values (v_id, m.slug, m.name, m.date, v_uid, coalesce(v_pin, '1050'),
          coalesce(m.run_order_method, 'reverse_overall'), coalesce(m.tiebreaker_rule, 'lookback'),
          coalesce(m.available_plates, '{100,55,45,35,25,15,10,5,2.5}'), coalesce(m.collar_weight_per_pair, 0),
          coalesce(m.stations, '[{"id":"A","label":"Station 1"},{"id":"B","label":"Station 2"}]'), coalesce(m.is_demo, false), m.division_format,
          coalesce(m.units, 'imperial'))
  on conflict (id) do update set
    slug = excluded.slug, name = excluded.name, date = excluded.date,
    admin_pin = coalesce(v_pin, meets.admin_pin, '1050'),   -- 008 (R1, G2-H1): null keeps the server's PIN
    run_order_method = excluded.run_order_method, tiebreaker_rule = excluded.tiebreaker_rule,
    available_plates = excluded.available_plates, collar_weight_per_pair = excluded.collar_weight_per_pair,
    stations = excluded.stations,
    division_format = coalesce(meets.division_format, excluded.division_format),   -- 056 (Astra GP-01): once the promoter has chosen, the phone cannot change it; a never-chosen meet takes the phone's value
    is_demo = (meets.is_demo and excluded.is_demo),   -- 010: a real meet stays real; only a demo can be re-published as demo
    units = coalesce(m.units, meets.units, 'imperial'),   -- 059: a phone that sends none keeps the server's units
    updated_at = now(),
    owner_id = coalesce(meets.owner_id, excluded.owner_id)
  returning id, join_code into v_id, v_code;
  -- 006 (Astra A1/A2), 024: membership is written only when this call made the caller the owner (new meet, or a
  -- remaining member taking over an ownerless meet). A member publishing an owned meet gains nothing.
  if v_uid is not null and (select owner_id from meets where id = v_id) = v_uid then
    insert into meet_members (meet_id, user_id, role) values (v_id, v_uid, 'owner') on conflict do nothing;
  end if;

  insert into divisions (id, meet_id, name, flight, sort_order, weight_cap_kg, team_size)
  select d.id, v_id, d.name, coalesce(d.flight, 'A'), coalesce(d.sort_order, 0), d.weight_cap_kg, coalesce(d.team_size, 1)
  from jsonb_populate_recordset(null::divisions, p_divisions) d
  on conflict (meet_id, id) do update set name = excluded.name, flight = excluded.flight, sort_order = excluded.sort_order,
    weight_cap_kg = coalesce(divisions.weight_cap_kg, excluded.weight_cap_kg),   -- 056 (Astra GP-03): the desk / dashboard cap wins over a stale phone; a division with no cap yet takes the phone's
    team_size = divisions.team_size;   -- 056: team size is set in the dashboard (zt_save_meet_config); the phone keeps the server's for an existing division

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

-- ---------- zt_save_meet_config: 055 body + units (locked once results exist) ----------
create or replace function zt_save_meet_config(
  p_meet_id uuid,
  p_meet jsonb,
  p_divisions jsonb default '[]'::jsonb,
  p_events jsonb default '[]'::jsonb,
  p_athletes jsonb default '[]'::jsonb,
  p_expected_updated_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  cur meets%rowtype;
  inc meets%rowtype;
  v_name text;
  v_slug text;
  v_orphan_ath_name text;
  v_orphan_ev_name text;
  v_linked_name text;
  v_roster_count int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sign in required to save meet changes.' using errcode = 'P0001';
  end if;

  select * into cur from meets where id = p_meet_id for update;
  if not found then
    raise exception 'No meet found with serverId "%".', p_meet_id using errcode = 'P0001';
  end if;

  if not zt_is_owner_or_member(p_meet_id) then
    raise exception 'You do not have permission to edit this meet.' using errcode = 'P0001';
  end if;

  if p_expected_updated_at is not null and cur.updated_at <> p_expected_updated_at then
    raise exception 'This meet changed since you opened it (saved %). Reload to see the latest version, then redo your edits.',
      to_char(cur.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') using errcode = 'P0001';
  end if;

  -- M9: an accepted registration's roster row is removed through the registration, not the roster
  select r.name into v_linked_name
  from registrations r
  where r.meet_id = p_meet_id and r.status = 'accepted' and r.athlete_id is not null
    and r.athlete_id not in (select id from jsonb_populate_recordset(null::athletes, coalesce(p_athletes, '[]'::jsonb)))
  limit 1;
  if v_linked_name is not null then
    raise exception '% is on the roster through an accepted registration. Decline or withdraw that registration instead of deleting the athlete.',
      v_linked_name using errcode = 'P0001';
  end if;

  -- Division (M9 gate, revised 10/17 night, Astra gate 2 G2-M1): the registration keeps the division the athlete
  -- SUBMITTED (evidence); the roster row is the division they COMPETE in. Meet day moves athletes on the floor
  -- (weigh-in) through the athletes upsert, which has no such check, so refusing the same move here only left the
  -- dashboard unable to save anything afterwards. The Registrations table shows "competing in X" when they differ.

  -- Cap (C4 gate, revised 10/17 night, G2-M1): the cap is an intake limit (zt_submit_registration, accept). A roster
  -- that is already over it (floor walk-ons) saves fine; what is refused is this save ADDING athletes beyond the cap.
  select count(*)::int into v_roster_count from jsonb_populate_recordset(null::athletes, coalesce(p_athletes, '[]'::jsonb));
  if cur.athlete_cap is not null and v_roster_count > cur.athlete_cap
     and v_roster_count > (select count(*) from athletes a where a.meet_id = p_meet_id) then
    raise exception 'The roster has % athletes but the listing cap is %. Raise the cap in Listing or remove athletes before saving.',
      v_roster_count, cur.athlete_cap using errcode = 'P0001';
  end if;

  -- 055: shrinking a division's team size under an existing team's active members would strand that team
  select format('%s has %s active members; set the team size to at least that, or ask them to leave first.', t.name, zt_team_active_count(t.id))
  into v_orphan_ev_name
  from teams t join jsonb_populate_recordset(null::divisions, coalesce(p_divisions, '[]'::jsonb)) d on d.id = t.division_id
  where t.meet_id = p_meet_id and coalesce(d.team_size, 1) < zt_team_active_count(t.id)
  limit 1;
  if v_orphan_ev_name is not null then raise exception '%', v_orphan_ev_name using errcode = 'P0001'; end if;

  select * into inc from jsonb_populate_record(null::meets, p_meet);

  -- 059: units lock once a result exists (see zt_publish_meet)
  if inc.units is not null and inc.units not in ('imperial', 'metric') then
    raise exception 'Units must be imperial or metric.' using errcode = 'P0001';
  end if;
  if inc.units is not null and inc.units <> cur.units and exists (select 1 from results r where r.meet_id = p_meet_id) then
    raise exception 'This meet has results in %; units cannot change now.', case when cur.units = 'metric' then 'kilograms and meters' else 'pounds and feet' end using errcode = 'P0001';
  end if;

  v_name := trim(coalesce(inc.name, ''));
  if v_name = '' then
    raise exception 'Meet name cannot be empty.' using errcode = 'P0001';
  end if;

  v_slug := lower(trim(coalesce(inc.slug, '')));
  if v_slug = '' then
    v_slug := regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g');
    v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
    if v_slug = '' then v_slug := 'meet'; end if;
  end if;

  if exists (select 1 from meets where id <> p_meet_id and lower(slug) = v_slug) then
    raise exception 'Another meet already uses the slug "%". Pick a unique slug.', v_slug using errcode = 'P0001';
  end if;

  if cur.registration_deadline is not null and inc.date is not null and inc.date < cur.registration_deadline then
    raise exception 'Meet date (%) is earlier than the registration deadline (%). Move the deadline first.',
      to_char(inc.date, 'YYYY-MM-DD'), to_char(cur.registration_deadline, 'YYYY-MM-DD') using errcode = 'P0001';
  end if;

  select coalesce(a.name, r.athlete_id), coalesce(e.name, r.event_id)
  into v_orphan_ath_name, v_orphan_ev_name
  from results r
  left join athletes a on a.meet_id = r.meet_id and a.id = r.athlete_id
  left join events e on e.meet_id = r.meet_id and e.id = r.event_id
  where r.meet_id = p_meet_id
    and (
      r.athlete_id not in (select id from jsonb_populate_recordset(null::athletes, coalesce(p_athletes, '[]'::jsonb)))
      or coalesce(a.division_id, '') not in (select id from jsonb_populate_recordset(null::divisions, coalesce(p_divisions, '[]'::jsonb)))
    )
  limit 1;
  if v_orphan_ath_name is not null then
    raise exception '% has a recorded result in "%" and cannot be removed from the roster. Mark the athlete withdrawn on meet day instead.',
      v_orphan_ath_name, v_orphan_ev_name using errcode = 'P0001';
  end if;

  select coalesce(e.name, r.event_id) into v_orphan_ev_name
  from results r
  left join events e on e.meet_id = r.meet_id and e.id = r.event_id
  where r.meet_id = p_meet_id
    and r.event_id not in (select id from jsonb_populate_recordset(null::events, coalesce(p_events, '[]'::jsonb)))
  limit 1;
  if v_orphan_ev_name is not null then
    raise exception 'Event "%" has recorded results and cannot be removed.', v_orphan_ev_name using errcode = 'P0001';
  end if;

  update meets set
    slug = v_slug,
    name = v_name,
    date = inc.date,
    admin_pin = coalesce(nullif(trim(inc.admin_pin), ''), cur.admin_pin, '1050'),
    run_order_method = coalesce(inc.run_order_method, cur.run_order_method, 'reverse_overall'),
    tiebreaker_rule = coalesce(inc.tiebreaker_rule, cur.tiebreaker_rule, 'lookback'),   -- 059: fallback matches the 057 column default
    available_plates = coalesce(inc.available_plates, cur.available_plates, '{100,55,45,35,25,15,10,5,2.5}'),
    collar_weight_per_pair = coalesce(inc.collar_weight_per_pair, cur.collar_weight_per_pair, 0),
    stations = coalesce(inc.stations, cur.stations, '[{"id":"A","label":"Station 1"},{"id":"B","label":"Station 2"}]'::jsonb),
    division_format = coalesce(inc.division_format, cur.division_format),   -- 054: promoter's choice; once set it stays set
    units = coalesce(inc.units, cur.units, 'imperial'),   -- 059
    is_demo = false,
    updated_at = now()
  where id = p_meet_id;

  insert into divisions (id, meet_id, name, flight, sort_order, weight_cap_kg, team_size)
  select d.id, p_meet_id, d.name, coalesce(d.flight, 'A'), coalesce(d.sort_order, 0), d.weight_cap_kg, coalesce(d.team_size, 1)
  from jsonb_populate_recordset(null::divisions, coalesce(p_divisions, '[]'::jsonb)) d
  on conflict (meet_id, id) do update set
    name = excluded.name, flight = excluded.flight, sort_order = excluded.sort_order,
    weight_cap_kg = excluded.weight_cap_kg,   -- 054: the dashboard is authoritative for caps (null clears)
    team_size = excluded.team_size;   -- 055: the dashboard is authoritative for team size too

  insert into events (id, meet_id, event_number, name, scoring_type, time_cap_seconds, lanes, loading_points,
                      weight_entry_mode, implement_empty_weight, config)
  select e.id, p_meet_id, e.event_number, e.name, e.scoring_type, coalesce(e.time_cap_seconds, 60), coalesce(e.lanes, 1),
         coalesce(e.loading_points, 0), coalesce(e.weight_entry_mode, 'total'), coalesce(e.implement_empty_weight, 0),
         coalesce(e.config, '{}'::jsonb)
  from jsonb_populate_recordset(null::events, coalesce(p_events, '[]'::jsonb)) e
  on conflict (meet_id, id) do update set
    event_number = excluded.event_number, name = excluded.name, scoring_type = excluded.scoring_type,
    time_cap_seconds = excluded.time_cap_seconds, lanes = excluded.lanes, loading_points = excluded.loading_points,
    weight_entry_mode = excluded.weight_entry_mode, implement_empty_weight = excluded.implement_empty_weight,
    config = excluded.config;

  insert into athletes (id, meet_id, division_id, name, bodyweight, lot_number, status, rack_heights)
  select a.id, p_meet_id, a.division_id, a.name, a.bodyweight, coalesce(a.lot_number, 0), coalesce(a.status, 'active'),
         coalesce(a.rack_heights, '{}'::jsonb)
  from jsonb_populate_recordset(null::athletes, coalesce(p_athletes, '[]'::jsonb)) a
  on conflict (meet_id, id) do update set
    division_id = excluded.division_id, name = excluded.name, bodyweight = excluded.bodyweight,
    lot_number = excluded.lot_number, status = excluded.status, rack_heights = excluded.rack_heights;

  delete from athletes
  where meet_id = p_meet_id
    and id not in (select id from jsonb_populate_recordset(null::athletes, coalesce(p_athletes, '[]'::jsonb)));
  delete from events
  where meet_id = p_meet_id
    and id not in (select id from jsonb_populate_recordset(null::events, coalesce(p_events, '[]'::jsonb)));
  delete from divisions
  where meet_id = p_meet_id
    and id not in (select id from jsonb_populate_recordset(null::divisions, coalesce(p_divisions, '[]'::jsonb)));

  return jsonb_build_object('id', p_meet_id);
end $$;
grant execute on function zt_save_meet_config(uuid, jsonb, jsonb, jsonb, jsonb, timestamptz) to authenticated;

-- ---------- zt_my_meets / zt_get_my_meet: 054 bodies + units ----------
create or replace function zt_my_meets()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid; v_out jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sign in required to list your meets.' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(row_to_json(q)::jsonb order by q.created_at desc), '[]'::jsonb)
  into v_out
  from (
    select
      m.id, m.slug, m.name, m.date, m.owner_id, m.join_code, m.admin_pin,
      m.run_order_method, m.tiebreaker_rule, m.available_plates, m.collar_weight_per_pair,
      m.stations, m.is_demo, m.created_at, m.updated_at,
      m.competition_status, m.registration_status, m.results_status, m.is_public_listed,
      m.venue, m.federation, m.entry_fee_display, m.registration_deadline, m.athlete_cap, m.promoter_contact,
      m.host_gym_id, m.theme, m.auto_accept, m.results_submitted_at, m.schedule,
      m.sponsors, m.livestream_url, m.staff, m.imported_from, m.division_format, m.units,
      (select count(*)::int from divisions d where d.meet_id = m.id) as division_count,
      (select count(*)::int from athletes a where a.meet_id = m.id) as athlete_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status in ('pending', 'waitlist')) as pending_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status = 'accepted') as registration_count
    from meets m
    where m.owner_id = v_uid
       or exists (select 1 from meet_members mm where mm.meet_id = m.id and mm.user_id = v_uid)
  ) q;

  return v_out;
end $$;

create or replace function zt_get_my_meet(p_meet_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid; v_out jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sign in required to view meet configuration.' using errcode = 'P0001';
  end if;
  if not zt_is_owner_or_member(p_meet_id) then
    return null;
  end if;

  select row_to_json(q)::jsonb into v_out
  from (
    select
      m.id, m.slug, m.name, m.date, m.owner_id, m.join_code, m.admin_pin,
      m.run_order_method, m.tiebreaker_rule, m.available_plates, m.collar_weight_per_pair,
      m.stations, m.is_demo, m.created_at, m.updated_at,
      m.competition_status, m.registration_status, m.results_status, m.is_public_listed,
      m.venue, m.federation, m.entry_fee_display, m.registration_deadline, m.athlete_cap, m.promoter_contact,
      m.host_gym_id, m.theme, m.auto_accept, m.results_submitted_at, m.schedule,
      m.sponsors, m.livestream_url, m.staff, m.imported_from, m.division_format, m.units,
      (select count(*)::int from divisions d where d.meet_id = m.id) as division_count,
      (select count(*)::int from athletes a where a.meet_id = m.id) as athlete_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status in ('pending', 'waitlist')) as pending_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status = 'accepted') as registration_count
    from meets m
    where m.id = p_meet_id
  ) q;

  return v_out;
end $$;

-- ---------- zt_public_meet_by_slug: 054 body + units ----------
create or replace function zt_public_meet_by_slug(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_clean text;
  m meets%rowtype;
  v_promoter_name text;
  v_divisions jsonb;
  v_events jsonb;
  v_accepted_count int;
begin
  v_clean := lower(trim(coalesce(p_slug, '')));
  if v_clean = '' then
    return null;
  end if;

  select * into m from meets where lower(slug) = v_clean and is_demo = false limit 1;
  if not found then
    return null;
  end if;

  if m.owner_id is not null then
    select coalesce(nullif(trim(p.display_name), ''), split_part(coalesce(p.email, ''), '@', 1))
    into v_promoter_name
    from profiles p where p.id = m.owner_id;
  end if;
  v_promoter_name := coalesce(nullif(trim(v_promoter_name), ''), 'Promoter');

  select coalesce(jsonb_agg(row_to_json(d)::jsonb order by d.sort_order asc), '[]'::jsonb)
  into v_divisions
  from divisions d where d.meet_id = m.id;

  select coalesce(jsonb_agg(row_to_json(e)::jsonb order by e.event_number asc), '[]'::jsonb)
  into v_events
  from events e where e.meet_id = m.id;

  select count(*)::int into v_accepted_count from athletes a where a.meet_id = m.id;

  return jsonb_build_object(
    'meet', jsonb_build_object(
      'id', m.id,
      'slug', m.slug,
      'name', m.name,
      'date', m.date,
      'run_order_method', m.run_order_method,
      'tiebreaker_rule', m.tiebreaker_rule,
      'available_plates', m.available_plates,
      'collar_weight_per_pair', m.collar_weight_per_pair,
      'stations', m.stations,
      'is_demo', m.is_demo,
      'competition_status', m.competition_status,
      'registration_status', m.registration_status,
      'results_status', m.results_status,
      'is_public_listed', m.is_public_listed,
      'venue', m.venue,
      'federation', m.federation,
      'entry_fee_display', m.entry_fee_display,
      'registration_deadline', m.registration_deadline,
      'athlete_cap', m.athlete_cap,
      'promoter_contact', m.promoter_contact,
      'division_format', m.division_format,
      'units', m.units,
      'updated_at', m.updated_at
    ),
    'promoter_display_name', v_promoter_name,
    'divisions', v_divisions,
    'events', v_events,
    'accepted_count', v_accepted_count
  );
end $$;
grant execute on function zt_public_meet_by_slug(text) to anon, authenticated;
