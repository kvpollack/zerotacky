-- 006_ownership.sql (v2, 10/17): ownership and membership hardening from Astra's 2026-10-17 audit (A1, A2) plus the
-- profile column grants from Part 3. Staging only until v2 becomes main. Safe to re-run. Depends on 003 and 005.
--
-- A1  Keyless signed-in publish could claim any ownerless meet by slug. Now an ownerless meet is claimed only by a
--     signed-in caller who also presents the legacy publish key (the key is the proof of authority); keyless
--     publish of an ownerless slug is refused with a message that says so.
-- A2  Members could change meets.owner_id and manage meet_members freely. Now owner_id, join_code and admin_pin are
--     not updatable through the table at all (column grants); owner changes go through zt_transfer_ownership (owner
--     only); only the owner adds/removes members, members are 'admin', and the owner row cannot be deleted directly.
-- P3  profiles: only display_name and the three role flags are updatable; email/id/timestamps are not.
--
-- Verify after applying:
--   select grantee, column_name from information_schema.column_privileges
--     where table_name = 'meets' and privilege_type = 'UPDATE' order by 1, 2;            -- no owner_id/join_code/admin_pin
--   select policyname, cmd from pg_policies where tablename = 'meet_members';             -- read, insert_owner, delete_owner
--   select grantee, column_name from information_schema.column_privileges
--     where table_name = 'profiles' and privilege_type = 'UPDATE';                          -- display_name + 3 flags

-- ---------- meets: column-level UPDATE ----------
revoke update on meets from anon, authenticated;
grant update (slug, name, date, run_order_method, tiebreaker_rule, available_plates, collar_weight_per_pair, stations,
              is_demo, updated_at, competition_status, registration_status, results_status, is_public_listed, venue,
              federation, entry_fee_display, registration_deadline, athlete_cap, promoter_contact)
  on meets to authenticated;
-- (meets_update policy from 005 still gates the rows: owner or member)

-- ---------- meet_members: owner manages, members read ----------
drop policy if exists members_write on meet_members;
drop policy if exists members_insert_owner on meet_members;
create policy members_insert_owner on meet_members for insert to authenticated
  with check (exists (select 1 from meets where id = meet_id and owner_id = auth.uid()) and role = 'admin' and user_id <> auth.uid());
drop policy if exists members_delete_owner on meet_members;
create policy members_delete_owner on meet_members for delete to authenticated
  using (exists (select 1 from meets where id = meet_id and owner_id = auth.uid()) and role <> 'owner');
-- no update policy: a membership row is added or removed, never edited

create or replace function zt_transfer_ownership(p_meet_id uuid, p_new_owner uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in required' using errcode = '42501'; end if;
  if not exists (select 1 from meets where id = p_meet_id and owner_id = v_uid) then
    raise exception 'only the meet owner can transfer ownership' using errcode = '42501';
  end if;
  if not exists (select 1 from profiles where id = p_new_owner) then
    raise exception 'new owner has no account' using errcode = 'P0001';
  end if;
  update meets set owner_id = p_new_owner, updated_at = now() where id = p_meet_id;
  insert into meet_members (meet_id, user_id, role) values (p_meet_id, p_new_owner, 'owner')
    on conflict (meet_id, user_id) do update set role = 'owner';
  update meet_members set role = 'admin' where meet_id = p_meet_id and user_id = v_uid;
  return jsonb_build_object('id', p_meet_id, 'owner_id', p_new_owner);
end $$;
grant execute on function zt_transfer_ownership(uuid, uuid) to authenticated;

-- ---------- profiles: column-level UPDATE ----------
revoke update on profiles from anon, authenticated;
grant update (display_name, is_athlete, is_promoter, is_gym_owner) on profiles to authenticated;

-- ---------- publish: claim needs the key (A1), membership only for the owner (A2) ----------
create or replace function zt_publish_meet(
  p_key text, p_meet jsonb,
  p_divisions jsonb default '[]', p_events jsonb default '[]', p_athletes jsonb default '[]', p_results jsonb default '[]'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text; m meets%rowtype; v_uid uuid; v_keyed boolean; v_owner uuid;
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

  insert into meets (id, slug, name, date, owner_id, admin_pin, run_order_method, tiebreaker_rule,
                     available_plates, collar_weight_per_pair, stations, is_demo)
  values (v_id, m.slug, m.name, m.date, v_uid, coalesce(m.admin_pin, '1050'),
          coalesce(m.run_order_method, 'reverse_overall'), coalesce(m.tiebreaker_rule, 'event_wins'),
          coalesce(m.available_plates, '{100,55,45,35,25,15,10,5,2.5}'), coalesce(m.collar_weight_per_pair, 0),
          coalesce(m.stations, '[{"id":"A","label":"Station 1"},{"id":"B","label":"Station 2"}]'), coalesce(m.is_demo, false))
  on conflict (id) do update set
    slug = excluded.slug, name = excluded.name, date = excluded.date, admin_pin = excluded.admin_pin,
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

  -- stale children (removed on the admin phone) go away; cascades clean results
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
