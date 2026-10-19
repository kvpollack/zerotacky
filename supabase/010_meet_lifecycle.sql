-- 010_meet_lifecycle.sql (10/19 night; after the v2 -> main merge). Apply on staging, test, then prod with Kurt's go.
--
-- 1. zt_publish_meet: is_demo can only go demo -> real through a publish, never real -> demo. Background: the real
--    Strongfest on prod was built on the phone from the Strongfest demo preset, so every publish carried is_demo = true
--    and the meet was hidden from /shows with DEMO on its scoreboard. The phone gains a "this is a real meet" switch
--    (components/setup/builder/MeetSection.jsx); one publish after flipping it fixes the server row. Body otherwise
--    identical to 008.
-- 2. zt_delete_meet(p_meet_id, p_confirm_name): owner-only hard delete. Refused for live or completed meets (archive
--    instead). When the meet has any divisions, events, athletes, results or registrations the caller must send the
--    meet name exactly (the dashboard shows "THIS MEET HAS DATA ASSOCIATED WITH IT" and asks for it); an empty draft
--    deletes on a plain confirm. Children go with the meets row through the 001/005 cascades; 004's result guard is
--    switched off for the transaction (it already returns early once the meets row is gone, this is belt and braces).
--    Table-level delete on meets stays revoked (008); this RPC is the only way.
--
-- Verify after applying (compare with prod_check.sql counts; functions +1, policies unchanged):
--   select proname from pg_proc where proname in ('zt_publish_meet','zt_delete_meet');

-- ---------- 1. publish: demo flag is one-way (demo -> real) on existing meets ----------
create or replace function zt_publish_meet(
  p_key text, p_meet jsonb,
  p_divisions jsonb default '[]', p_events jsonb default '[]', p_athletes jsonb default '[]', p_results jsonb default '[]'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text; m meets%rowtype; v_uid uuid; v_keyed boolean; v_owner uuid; v_linked_name text; v_pin text;
begin
  -- Two ways in: a signed-in promoter (v2) or a legacy publish key (meet-day phones before accounts).
  v_uid := auth.uid();
  v_keyed := p_key is not null and exists (select 1 from publish_keys where key = p_key);
  if v_uid is null and not v_keyed then
    raise exception 'sign in or provide a valid publish key' using errcode = '42501';
  end if;

  select * into m from jsonb_populate_record(null::meets, p_meet);
  -- same slug = same meet: a phone that left and re-publishes, or a second admin phone, updates in place
  v_id := coalesce((select id from meets where slug = m.slug), m.id, gen_random_uuid());

  -- Existing meet: a signed-in user must be a member (owner/admin) unless the meet has no owner yet, in which case
  -- the first signed-in publisher claims it. Publish-key callers keep today's behaviour (slug = meet).
  select owner_id into v_owner from meets where id = v_id;
  if found and v_uid is not null and not v_keyed then
    if v_owner is not null and not exists (select 1 from meet_members where meet_id = v_id and user_id = v_uid) then
      raise exception 'this meet belongs to another promoter' using errcode = '42501';
    end if;
    -- 006 (Astra A1): an ownerless meet (published from a phone with a key) is claimed only by presenting that key
    if v_owner is null then
      raise exception 'this meet was published with a publish key; enter the key once to claim it for your account' using errcode = '42501';
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
  -- 006 (Astra A1/A2): membership is written only when this call made the caller the owner (new meet, or a claim
  -- with the key). A keyed publish by a signed-in non-member of an already-owned meet publishes but gains nothing.
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
grant execute on function zt_publish_meet(text, jsonb, jsonb, jsonb, jsonb, jsonb) to anon, authenticated;

-- ---------- 2. delete meet (owner only, name-confirmed when it holds data) ----------
create or replace function zt_delete_meet(p_meet_id uuid, p_confirm_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m meets%rowtype; v_uid uuid; v_div int; v_ev int; v_ath int; v_res int; v_reg int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'sign in to delete a meet' using errcode = '42501';
  end if;
  select * into m from meets where id = p_meet_id for update;
  if not found then
    raise exception 'meet not found' using errcode = 'P0002';
  end if;
  if m.owner_id is distinct from v_uid then
    raise exception 'only the promoter who owns this meet can delete it' using errcode = '42501';
  end if;
  if m.competition_status in ('live', 'completed') then
    raise exception 'a % meet cannot be deleted. Set it to cancelled on the Listing tab first, or leave it as a record.',
      m.competition_status using errcode = 'P0001';
  end if;

  select count(*) into v_div from divisions     where meet_id = p_meet_id;
  select count(*) into v_ev  from events        where meet_id = p_meet_id;
  select count(*) into v_ath from athletes      where meet_id = p_meet_id;
  select count(*) into v_res from results       where meet_id = p_meet_id;
  select count(*) into v_reg from registrations where meet_id = p_meet_id;

  if (v_div + v_ev + v_ath + v_res + v_reg) > 0
     and lower(trim(coalesce(p_confirm_name, ''))) <> lower(trim(m.name)) then
    raise exception 'this meet has data associated with it. Type the meet name exactly to confirm deletion.'
      using errcode = 'P0001';
  end if;

  perform set_config('zt.allow_result_delete', 'on', true);   -- transaction-local; 004 guard stands down
  delete from meets where id = p_meet_id;                      -- cascades: meet_members, divisions, events, athletes, results, live_state, registrations

  return jsonb_build_object('id', p_meet_id, 'name', m.name,
    'deleted', jsonb_build_object('divisions', v_div, 'events', v_ev, 'athletes', v_ath, 'results', v_res, 'registrations', v_reg));
end $$;
revoke all on function zt_delete_meet(uuid, text) from public, anon;
grant execute on function zt_delete_meet(uuid, text) to authenticated;
