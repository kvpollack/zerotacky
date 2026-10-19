-- 008_publish_guards.sql (v2, 10/17 pm): Astra rehearsal findings R2 and R4, plus the PIN-keeping publish that R1 needs.
-- Staging only until v2 becomes main. Safe to re-run. Depends on 005, 006, 007.
--
-- !! v2 ONLY until the merge, like 007: the v2 client (lib/sync/mapping.ts) now sends admin_pin = null when the phone
--    holds no PIN; section 1 keeps the server's PIN in that case. main's client always sends a PIN, so main is
--    unaffected either way, but section 2 removes the direct UPDATE path that main's dashboard never had anyway.
--
-- R2 HIGH  zt_publish_meet deleted any athlete the admin phone no longer sent. 004 protects scored athletes; an
--          accepted, unscored registrant was deleted and the registration stayed `accepted` with athlete_id null
--          (reproduced on staging 10/17, registration ea4cd1c8). The publish now refuses to remove an athlete who is
--          on the roster through an accepted registration, with the same message zt_save_meet_config uses (M9).
--          Deliberately NOT added here, although zt_save_meet_config enforces both: the athlete cap and the accepted
--          athlete's division. On meet day the roster also changes through the athletes upsert (walk-ons, weigh-in
--          moves) which has neither check, so refusing them only at publish would block weight/event republishes
--          to the judge phones over a walk-on. The cap is a registration-time limit (zt_submit_registration,
--          zt_set_registration_status accept, zt_save_meet_config). The client side of R2 (abort a publish whose
--          pre-pull failed) is in lib/sync/controller.ts.
-- R1       admin_pin: null in the payload keeps the server's PIN (a phone that joined by code never holds it; before
--          this the client filled in '1050' and a keyed republish from such a phone would have reset the real PIN).
--          Revised 10/17 night (Astra gate 2, G2-H1): the first version defaulted the null in the INSERT values, so
--          the ON CONFLICT clause saw '1050' in `excluded` and reset the PIN anyway. Decided once, in a variable.
-- R4 MED   006 left column-level UPDATE on the listing columns of `meets`, so an owner could PATCH athlete_cap below
--          the roster (cap 1 with 6 athletes, reproduced on staging). Every client write to `meets` goes through a
--          security-definer RPC (zt_publish_meet, zt_create_meet, zt_save_meet_config, zt_update_listing,
--          zt_rotate_join_code, zt_transfer_ownership), so the table grant and the meets_update policy go.
--
-- Verify after applying:
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_name = 'meets' and grantee in ('anon', 'authenticated');                     -- SELECT/INSERT only
--   select count(*) from information_schema.column_privileges
--     where table_name = 'meets' and privilege_type = 'UPDATE' and grantee in ('anon', 'authenticated');   -- 0
--   select policyname from pg_policies where tablename = 'meets';                                 -- no meets_update
--   select table_name, string_agg(distinct privilege_type, ',') from information_schema.role_table_grants
--     where table_schema = 'public' and grantee in ('anon', 'authenticated') group by 1;          -- no TRUNCATE/REFERENCES/TRIGGER

-- ---------- 2. meets: no direct UPDATE at all (R4) ----------
revoke update on meets from anon, authenticated;
drop policy if exists meets_update on meets;

-- ---------- 3. table grants the API roles never need (found while verifying R4) ----------
-- Supabase's default privileges hand every new table ALL to anon/authenticated. RLS covers DELETE, but TRUNCATE,
-- REFERENCES and TRIGGER are not row-level operations (TRUNCATE ignores RLS). PostgREST exposes none of them, so
-- this closes a path that only a leaked database password could use; cheap, and it stops the question coming up.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke delete on meets, profiles from anon, authenticated;              -- no delete policy exists on either
revoke insert, update, delete on zt_public_meets from anon, authenticated;   -- read-only directory view
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from anon, authenticated;

-- ---------- 1. publish: accepted registrants stay (R2), null PIN keeps the server's (R1) ----------
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
    stations = excluded.stations, is_demo = excluded.is_demo, updated_at = now(),
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
