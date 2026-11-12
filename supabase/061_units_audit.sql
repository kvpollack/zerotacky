-- 061: kg / m audit fixes (Astra 11/12, KM-02 / KM-03 / KM-07 / KM-08).
--
-- KM-03  results carry the unit system they were entered under (`payload.units`, stamped by the phone). A trigger refuses a
--        row whose stamp differs from the meet's units, so a score queued offline in lb cannot land as kg after a legal
--        pre-score flip. The phone keeps such rows in its queue and shows the message (never drops or relabels them).
--        The trigger takes `for share` on the meet row and the two config writers take `for update`, so a unit change and
--        a first result serialise instead of racing past the "no results yet" check.
-- KM-02  zt_publish_meet accepts the `updated_at` the phone last applied and refuses the publish when the server row has
--        moved on (STALE_CONFIG), and returns the stamp it produced so the phone can record it.
-- KM-07  the event spec guard takes the meet's units: course distance 1..1610 m (half-meter steps) on a metric meet,
--        1..5280 ft as before; error text names the unit.
-- KM-08  default plate inventory follows the unit in zt_publish_meet and in zt_adopt_archive_competition.
-- Bodies copied from 059 (publish, save config), 060 (adopt) and 041 (spec guard) with the marked changes.

-- ---------- KM-03: result unit provenance ----------
-- security definer: judge phones write results as anon + grant, which may read meets but holds no UPDATE privilege, and
-- `for share` needs one (found in the 11/12 staging re-probe: the phone saw 42501 and reported a code/PIN refusal).
create or replace function zt_results_check_units() returns trigger language plpgsql security definer set search_path = public as $$
declare v_units text;
begin
  if new.payload is null or not (new.payload ? 'units') then return new; end if;   -- older phones: no stamp, no check
  if new.payload->>'units' not in ('imperial', 'metric') then
    raise exception 'UNITS_MISMATCH: this score carries an unknown unit system.' using errcode = 'P0001';
  end if;
  select units into v_units from meets where id = new.meet_id for share;
  if coalesce(v_units, 'imperial') <> new.payload->>'units' then
    raise exception 'UNITS_MISMATCH: this score was entered in % but the meet is now in %. Switch the meet back, or clear and re-enter the score in the meet''s units.',
      case when new.payload->>'units' = 'metric' then 'kilograms and meters' else 'pounds and feet' end,
      case when coalesce(v_units, 'imperial') = 'metric' then 'kilograms and meters' else 'pounds and feet' end
      using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists results_check_units on results;
create trigger results_check_units before insert or update of payload on results
  for each row execute function zt_results_check_units();

-- ---------- KM-07: unit-aware spec guard ----------
create or replace function zt_check_event_spec(p_spec jsonb, p_units text) returns void
language plpgsql immutable as $$
declare
  k text; v jsonb; impl text; note text; feet numeric; url text; notes text;
  metric boolean := coalesce(p_units, 'imperial') = 'metric';
  course_max numeric := case when coalesce(p_units, 'imperial') = 'metric' then 1610 else 5280 end;
  course_unit text := case when coalesce(p_units, 'imperial') = 'metric' then 'meters' else 'feet' end;
  allowed text[] := '{}'; not_allowed text[] := '{}'; r text;
  implements text[] := array['log','axle','barbell','circus_dumbbell','viking_press','yoke','farmers','frame','husafell',
    'sandbag','keg','atlas_stones','natural_stone','loading_medley','car_deadlift','truck_pull','arm_over_arm','tire',
    'power_stairs','conans_wheel','duck_walk','other'];
  rules text[] := array['tacky','straps','belt','sleeves','wraps','chalk','suit'];
begin
  if p_spec is null or jsonb_typeof(p_spec) = 'null' then return; end if;
  if jsonb_typeof(p_spec) <> 'object' then
    raise exception 'Event spec must be an object.' using errcode = 'P0001';
  end if;
  for k, v in select * from jsonb_each(p_spec) loop
    if k not in ('implement','implementNote','courseFeet','allowed','notAllowed','videoUrl','notes') then
      raise exception 'Event spec has an unexpected field "%".', left(k, 40) using errcode = 'P0001';
    end if;
    if jsonb_typeof(v) = 'null' then continue; end if;
    if k in ('implement','implementNote','videoUrl','notes') and jsonb_typeof(v) <> 'string' then
      raise exception 'Event spec fields must be text.' using errcode = 'P0001';
    end if;
    if k = 'courseFeet' and jsonb_typeof(v) <> 'number' then
      raise exception 'Course distance is in %, between 1 and %.', course_unit, course_max using errcode = 'P0001';
    end if;
    if k in ('allowed','notAllowed') then
      if jsonb_typeof(v) <> 'array' then
        raise exception 'Equipment rules must be a list of rule names.' using errcode = 'P0001';
      end if;
      if exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string') then
        raise exception 'Equipment rules must be a list of rule names.' using errcode = 'P0001';
      end if;
    end if;
  end loop;
  impl := nullif(trim(p_spec->>'implement'), '');
  if impl is not null and not (impl = any(implements)) then
    raise exception 'Pick an implement from the list.' using errcode = 'P0001';
  end if;
  note := nullif(trim(coalesce(p_spec->>'implementNote', '')), '');
  if impl = 'other' and note is null then
    raise exception 'Describe the implement when you pick "Other".' using errcode = 'P0001';
  end if;
  if char_length(coalesce(note, '')) > 80 then
    raise exception 'Implement note is limited to 80 characters.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_spec->'courseFeet') = 'number' then
    feet := (p_spec->>'courseFeet')::numeric;
    if feet < 1 or feet > course_max then
      raise exception 'Course distance is in %, between 1 and %.', course_unit, course_max using errcode = 'P0001';
    end if;
    if feet * 2 <> round(feet * 2) then
      raise exception 'Course distance is in half-% steps (50 or 50.5).', case when metric then 'meter' else 'foot' end using errcode = 'P0001';
    end if;
  end if;
  if jsonb_typeof(p_spec->'allowed') = 'array' then
    select coalesce(array_agg(lower(trim(x))), '{}') into allowed from jsonb_array_elements_text(p_spec->'allowed') x;
  end if;
  if jsonb_typeof(p_spec->'notAllowed') = 'array' then
    select coalesce(array_agg(lower(trim(x))), '{}') into not_allowed from jsonb_array_elements_text(p_spec->'notAllowed') x;
  end if;
  foreach r in array allowed || not_allowed loop
    if r is null or not (r = any(rules)) then
      raise exception 'Unknown equipment rule "%".', left(coalesce(r, 'null'), 40) using errcode = 'P0001';
    end if;
  end loop;
  if allowed && not_allowed then
    select x into r from unnest(allowed) x where x = any(not_allowed) limit 1;
    raise exception '% cannot be both allowed and not allowed.', initcap(r) using errcode = 'P0001';
  end if;
  url := nullif(trim(coalesce(p_spec->>'videoUrl', '')), '');
  if url is not null then
    if char_length(url) > 500 then
      raise exception 'Video link is limited to 500 characters.' using errcode = 'P0001';
    end if;
    -- scheme, then a host of hostname characters (a bracketed IPv6 literal is not accepted; the client parser's edge cases
    -- like "https://[" are refused here too), optional port, optional path/query/fragment, no whitespace anywhere
    if url !~* '^https?://[a-z0-9]([a-z0-9._-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then
      raise exception 'Video link must start with http:// or https://.' using errcode = 'P0001';
    end if;
  end if;
  notes := coalesce(p_spec->>'notes', '');
  if char_length(trim(notes)) > 280 then
    raise exception 'Notes are limited to 280 characters.' using errcode = 'P0001';
  end if;
end $$;

-- one-arg form kept for any caller that has it (imperial limits), the trigger passes the meet's units
create or replace function zt_check_event_spec(p_spec jsonb) returns void language sql immutable as $$
  select zt_check_event_spec(p_spec, 'imperial')
$$;

create or replace function zt_events_check_spec() returns trigger language plpgsql security definer set search_path = public as $$
declare v_units text;
begin
  if new.config is not null and new.config ? 'spec' then
    select units into v_units from meets where id = new.meet_id;
    perform zt_check_event_spec(new.config->'spec', coalesce(v_units, 'imperial'));
  end if;
  return new;
end $$;
drop trigger if exists events_check_spec on events;
create trigger events_check_spec before insert or update of config on events
  for each row execute function zt_events_check_spec();

-- ---------- KM-02 / KM-03 / KM-08: publish ----------
create or replace function zt_publish_meet(
  p_meet jsonb,
  p_divisions jsonb default '[]', p_events jsonb default '[]', p_athletes jsonb default '[]', p_results jsonb default '[]'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text; m meets%rowtype; v_uid uuid; v_owner uuid; v_linked_name text; v_pin text; v_units text; v_stamp timestamptz;
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
  -- 061 (KM-03): lock the meet row for the rest of this transaction so a unit change and a first result admitted by
  -- the results trigger (which takes `for share` on the same row) serialise instead of racing.
  select units into v_units from meets where id = v_id for update;
  -- 061 (KM-02): a phone that says which setup stamp it last applied is refused when the server has moved on, so an admin
  -- phone holding stale units cannot overwrite the dashboard's newer choice. A phone that sends no stamp is trusted as before.
  if m.updated_at is not null and v_units is not null
     and exists (select 1 from meets x where x.id = v_id and x.updated_at <> m.updated_at) then
    raise exception 'STALE_CONFIG: the meet setup changed elsewhere since this phone last synced. Sync, review the setup, then publish again.' using errcode = 'P0001';
  end if;
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
          coalesce(m.available_plates, case when coalesce(m.units, 'imperial') = 'metric' then '{25,20,15,10,5,2.5,1.25}'::numeric[] else '{100,55,45,35,25,15,10,5,2.5}'::numeric[] end),   -- 061 (KM-08): default inventory follows the unit
          coalesce(m.collar_weight_per_pair, 0),
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
  returning id, join_code, updated_at into v_id, v_code, v_stamp;
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

  return jsonb_build_object('id', v_id, 'join_code', v_code, 'updated_at', v_stamp);   -- 061: the stamp this publish produced
end $$;
revoke execute on function zt_publish_meet(jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function zt_publish_meet(jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;

-- ---------- zt_save_meet_config: 055 body + units (locked once results exist) ----------

-- ---------- save config: unchanged from 059 apart from being re-stated here (already `for update`) ----------
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

-- ---------- KM-08: adopt ----------
create or replace function zt_adopt_archive_competition(p_slug text, p_host_gym_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c archive_competitions%rowtype;
  v_meet uuid := gen_random_uuid();
  v_slug text; v_base text; v_n int := 0;
  v_source_name text; v_credit text;
  v_units text := 'imperial';
begin
  if v_uid is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  select * into c from archive_competitions where slug = p_slug;
  if c.id is null then raise exception 'That archive show was not found.' using errcode = 'P0001'; end if;
  if exists (select 1 from meets where imported_slug = c.slug) then
    raise exception 'That show has already been imported. Ask its owner for a transfer if it should be yours.' using errcode = 'P0001';
  end if;
  if p_host_gym_id is not null and not exists (select 1 from gyms g where g.id = p_host_gym_id and g.status <> 'removed') then
    raise exception 'That gym listing is gone.' using errcode = 'P0001';
  end if;
  if (select count(*) from meets where owner_id = v_uid and imported_from is not null and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That is a lot of imports for one day. Try again tomorrow.' using errcode = 'P0001';
  end if;

  -- 060: an archive show whose results carry only kg / m (never lb / ft) is adopted as a metric meet and its numbers are
  -- kept as published; anything else is imperial and kg / m rows are converted as before. Mixed shows stay imperial.
  if exists (select 1 from archive_results r where r.competition_id = c.id and r.unit in ('kg', 'm'))
     and not exists (select 1 from archive_results r where r.competition_id = c.id and r.unit in ('lb', 'lbs', 'ft')) then
    v_units := 'metric';
  end if;

  v_source_name := case c.source when 'sr' then 'strongmanresults.com' when 'os' then 'openstrongman.org' else c.source end;
  v_credit := case c.source
    when 'sr' then 'Results imported from strongmanresults.com (CC BY 4.0); original scoring published on Iron Podium. Not scored live on ZeroTacky.'
    else 'Results imported from ' || v_source_name || '. Not scored live on ZeroTacky.' end;

  -- slug: name-year (year skipped when the name already carries it, e.g. "Boiling Point 2026"), numbered on collision
  v_base := left(trim(both '-' from regexp_replace(lower(c.name), '[^a-z0-9]+', '-', 'g')), 60);
  if c.name !~ ('\m' || extract(year from c.date)::int || '\M') then
    v_base := v_base || '-' || extract(year from c.date)::int;
  end if;
  v_slug := v_base;
  while exists (select 1 from meets where slug = v_slug) loop v_n := v_n + 1; v_slug := v_base || '-' || v_n; end loop;

  insert into meets (id, slug, name, date, owner_id, admin_pin, is_demo,
                     competition_status, registration_status, results_status, is_public_listed, units, available_plates,
                     venue, federation, host_gym_id, imported_from, imported_slug)
  values (v_meet, v_slug, c.name, c.date, v_uid, lpad((floor(random() * 10000))::int::text, 4, '0'), false,
          'completed', 'not_applicable', 'final', true, v_units,
          case when v_units = 'metric' then '{25,20,15,10,5,2.5,1.25}'::numeric[] else '{100,55,45,35,25,15,10,5,2.5}'::numeric[] end,   -- 061 (KM-08)
          case when c.city is not null or c.state is not null then jsonb_build_object('city', coalesce(c.city, ''), 'state', coalesce(c.state, ''), 'country', 'US') end,
          case c.sanction when 'sc' then 'Strongman Corporation' when 'uss' then 'United States Strongman' when 'psl' then 'PSL' else nullif(upper(c.sanction), '') end,
          p_host_gym_id,
          jsonb_build_object('source', c.source, 'sourceName', v_source_name, 'archiveSlug', c.slug, 'competitionId', c.id,
                             'credit', v_credit, 'importedAt', now(), 'importedBy', v_uid),
          c.slug);

  -- divisions, in the order the archive lists them (first appearance by best place)
  insert into divisions (id, meet_id, name, flight, sort_order)
  select 'imp-d' || row_number() over (order by d.min_id), v_meet, d.division, 'A', row_number() over (order by d.min_id) - 1
  from (select division, min(id) min_id from archive_placements where competition_id = c.id group by division) d;

  -- events: one per (event_num, name); scoring type is a best fit for display, the engine does not rescore imports
  insert into events (id, meet_id, event_number, name, scoring_type, time_cap_seconds, lanes, loading_points, weight_entry_mode, implement_empty_weight, config)
  select 'imp-e' || e.min_id, v_meet, row_number() over (order by e.event_num, e.min_id), e.event,
         zt_scoring_type_for(e.event_type, e.unit), 60, 1, 0, 'total', 0,
         jsonb_build_object('imported', true, 'importedUnit', e.unit, 'importedType', e.event_type, 'divisionWeights', '{}'::jsonb)
  from (select event_num, event, min(id) min_id, min(event_type) event_type, min(unit) unit
        from archive_results where competition_id = c.id group by event_num, event) e;
  -- (event ids are 'imp-e' || the smallest archive_results id in the group, so the results insert below can join on it)

  -- athletes: one per placement row, lot order = published place
  insert into athletes (id, meet_id, division_id, name, lot_number, status)
  select 'imp-a' || p.id, v_meet, d.id, p.athlete, coalesce(p.place, 999), 'active'
  from archive_placements p
  join divisions d on d.meet_id = v_meet and d.name = p.division
  where p.competition_id = c.id;

  insert into meet_imported_placings (meet_id, athlete_id, place, points, is_tied)
  select v_meet, 'imp-a' || p.id, coalesce(p.place, 999), p.points,
         count(*) over (partition by p.division, p.place) > 1 and p.place is not null
  from archive_placements p where p.competition_id = c.id;

  -- results: one per archive event row, matched to the athlete by name key + division; locked
  insert into results (id, meet_id, event_id, athlete_id, payload, locked)
  select distinct on (ev.id, a.id)
         ev.id || '_' || a.id, v_meet, ev.id, a.id,
         jsonb_strip_nulls(jsonb_build_object(
           'importedPoints', r.points,
           'importedDisplay', nullif(trim(concat_ws(' ', r.raw_value, case when r.raw_value ~ '[a-z]' then null else r.unit end)), ''),
           'reps', case when r.event_type in ('reps', 'medley') and r.unit = 'reps' then r.value end,
           'timeSeconds', case when r.unit = 'sec' then r.value end,
           'distanceFeet', case when r.unit = 'ft' then r.value
                                when r.unit = 'm' then case when v_units = 'metric' then r.value else round(r.value * 3.28084, 1) end end,
           'maxWeightLbs', case when r.event_type = 'max_weight' then
                                case when r.unit = 'kg' and v_units <> 'metric' then round(r.value * 2.20462, 1) else r.value end end)),
         true
  from archive_results r
  join archive_placements p on p.competition_id = r.competition_id and p.athlete_key = r.athlete_key and p.division = r.division
  join athletes a on a.meet_id = v_meet and a.id = 'imp-a' || p.id
  join (select event_num, event, min(id) min_id from archive_results where competition_id = c.id group by event_num, event) eg
    on eg.event_num is not distinct from r.event_num and eg.event = r.event
  join events ev on ev.meet_id = v_meet and ev.id = 'imp-e' || eg.min_id
  where r.competition_id = c.id
  order by ev.id, a.id, r.id;

  return jsonb_build_object('meetId', v_meet, 'slug', v_slug,
    'athletes', (select count(*) from athletes where meet_id = v_meet),
    'events', (select count(*) from events where meet_id = v_meet),
    'results', (select count(*) from results where meet_id = v_meet));
end $$;
revoke all on function zt_adopt_archive_competition(text, uuid) from public, anon;
grant execute on function zt_adopt_archive_competition(text, uuid) to authenticated;
