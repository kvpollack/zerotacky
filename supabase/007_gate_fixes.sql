-- 007_gate_fixes.sql (10/17 pm) [Slate]: fixes from the Astra gate audit (`audits/astra-2026-10-17-gate.md`).
-- Runs after 006 on staging; on prod it is pasted after 003, 005, 006 at the v2 merge. Safe to re-run.
--
-- !! v2 ONLY until the merge: section 6 stops `zt_meet_by_join_code` from returning `admin_pin`. main's phones compare
-- the PIN locally against that column, so applying this to prod while main is live would make every joined phone
-- unlock with the default PIN. The v2 client (useRoleLock + zt_check_admin_pin) must ship in the same deploy.
--
-- 1. HIGH  registrations_athlete_fk nulled both FK columns on athlete delete; meet_id is NOT NULL, so withdrawing an
--          accepted, unscored athlete failed with 23502 (reproduced on staging 10/17). Column-list SET NULL (PG 15+)
--          and the status RPC unlinks before it deletes.
-- 2. MED   zt_submit_registration: length bounds, approved waiver versions, unique active (meet, division, email),
--          per-IP and per-meet throttles, deadline applies to waitlist too, inbox cap per meet.
-- 3. MED   zt_save_meet_config: roster cannot exceed athlete_cap; an accepted registration's athlete keeps its division.
-- 4. MED   zt_update_listing RPC with the C3 expected-revision check (the client used a bare PATCH).
-- 5. MED   zt_meet_by_join_code no longer returns admin_pin; zt_check_admin_pin verifies a PIN server-side (throttled).

-- ---------- 1. FK + unlink-before-delete ----------
alter table registrations drop constraint if exists registrations_athlete_fk;
alter table registrations add constraint registrations_athlete_fk
  foreign key (meet_id, athlete_id) references athletes(meet_id, id) on delete set null (athlete_id);

-- ---------- 2a. approved waiver versions (C6) ----------
-- `lib/promoter/waiverVersion.ts` hashes legal/WAIVER.md at render time; the RPC accepts only versions listed here.
-- Changing the waiver text = a new migration row (test/waiver.test.mjs checks the current file hash is listed).
create table if not exists zt_waiver_versions (
  version text primary key check (version ~ '^[0-9a-f]{12}$'),
  approved_at timestamptz not null default now(),
  note text
);
revoke all on zt_waiver_versions from anon, authenticated;
insert into zt_waiver_versions (version, note) values ('a995ce0eab26', 'legal/WAIVER.md as of 10/17; draft pending legal review')
on conflict (version) do nothing;

-- ---------- 2b. one active registration per meet, division and email ----------
create unique index if not exists registrations_active_unique
  on registrations (meet_id, division_id, lower(email)) where status not in ('withdrawn', 'declined');

-- ---------- 2c. throttle buckets (submit per IP, PIN checks per join code) ----------
create table if not exists zt_rate_limits (
  bucket text primary key,
  window_start timestamptz not null,
  n int not null
);
revoke all on zt_rate_limits from anon, authenticated;

-- Counts a hit in `p_bucket`; raises once more than `p_limit` hits land inside `p_window`. The raise rolls the
-- increment back, so a blocked caller does not extend its own window. Called only from security-definer RPCs.
create or replace function zt_rate_check(p_bucket text, p_limit int, p_window interval)
returns void language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if p_bucket is null or p_bucket = '' then return; end if;
  insert into zt_rate_limits (bucket, window_start, n) values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    n = case when zt_rate_limits.window_start < now() - p_window then 1 else zt_rate_limits.n + 1 end,
    window_start = case when zt_rate_limits.window_start < now() - p_window then now() else zt_rate_limits.window_start end
  returning n into v_n;
  if v_n > p_limit then
    raise exception 'Too many attempts from this device. Wait a few minutes and try again.' using errcode = 'P0001';
  end if;
  if random() < 0.02 then delete from zt_rate_limits where window_start < now() - interval '1 day'; end if;
end $$;
revoke all on function zt_rate_check(text, int, interval) from public, anon, authenticated;

-- Best-effort caller IP from PostgREST's forwarded headers; '' when unavailable (then the bucket is skipped).
create or replace function zt_client_ip() returns text language plpgsql stable as $$
declare v text;
begin
  begin
    v := split_part(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''), ',', 1);
  exception when others then
    v := '';
  end;
  return trim(coalesce(v, ''));
end $$;

-- ---------- 2d. zt_submit_registration (replaces 005's) ----------
create or replace function zt_submit_registration(p_slug text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clean_slug text;
  m meets%rowtype;
  v_div_id text;
  v_name text;
  v_email text;
  v_emergency text;
  v_bodyweight numeric;
  v_waiver boolean;
  v_waiver_version text;
  v_digits int;
  v_letters int;
  v_accepted_count int;
  v_pending_count int;
  v_outcome text;
  v_waitlisted boolean;
  v_reg_id uuid;
  v_ip text;
begin
  v_ip := zt_client_ip();
  if v_ip <> '' then perform zt_rate_check('submit:ip:' || v_ip, 10, interval '10 minutes'); end if;

  v_clean_slug := lower(trim(coalesce(p_slug, p_input->>'slug', '')));
  if char_length(v_clean_slug) > 120 then
    raise exception 'No competition found at "%".', left(coalesce(p_slug, ''), 40) using errcode = 'P0001';
  end if;
  select * into m from meets where lower(slug) = v_clean_slug and is_demo = false for share;
  if not found then
    raise exception 'No competition found at "%".', coalesce(p_slug, '') using errcode = 'P0001';
  end if;
  perform zt_rate_check('submit:meet:' || m.id::text, 60, interval '10 minutes');

  if m.registration_status not in ('open', 'waitlist') then
    raise exception 'Registration for % is currently closed (%).',
      m.name, replace(m.registration_status, '_', ' ') using errcode = 'P0001';
  end if;
  -- The deadline closes the waitlist as well as the open list.
  if m.registration_deadline is not null and current_date > m.registration_deadline then
    raise exception 'Registration for % closed on %. Contact the promoter about late entries.',
      m.name, to_char(m.registration_deadline, 'YYYY-MM-DD') using errcode = 'P0001';
  end if;

  v_name := trim(coalesce(p_input->>'athleteName', p_input->>'name', ''));
  if char_length(v_name) < 2 then
    raise exception 'Please enter the athlete full name.' using errcode = 'P0001';
  end if;
  if char_length(v_name) > 80 then
    raise exception 'Athlete name is too long (80 characters max).' using errcode = 'P0001';
  end if;

  v_email := lower(trim(coalesce(p_input->>'email', '')));
  if char_length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Please enter a valid email address.' using errcode = 'P0001';
  end if;

  v_emergency := trim(coalesce(p_input->>'emergencyContact', p_input->>'emergency_contact', ''));
  if char_length(v_emergency) > 160 then
    raise exception 'Emergency contact is too long (160 characters max).' using errcode = 'P0001';
  end if;
  v_digits := char_length(regexp_replace(v_emergency, '[^0-9]', '', 'g'));
  v_letters := char_length(regexp_replace(v_emergency, '[^A-Za-z]', '', 'g'));
  if v_digits < 7 or v_letters < 2 then
    raise exception 'Emergency contact needs a name and a phone number with at least 7 digits (for example "Sam Lee 717-555-0100").'
      using errcode = 'P0001';
  end if;

  v_div_id := trim(coalesce(p_input->>'divisionId', p_input->>'division_id', ''));
  if char_length(v_div_id) > 80 or not exists (select 1 from divisions d where d.meet_id = m.id and d.id = v_div_id) then
    raise exception 'Please select a valid division for this meet.' using errcode = 'P0001';
  end if;

  v_waiver := coalesce((p_input->>'waiverAccepted')::boolean, false);
  if not v_waiver then
    raise exception 'You must read and accept the competition waiver before submitting.' using errcode = 'P0001';
  end if;
  v_waiver_version := lower(trim(coalesce(p_input->>'waiverVersion', '')));
  if v_waiver_version = '' then
    raise exception 'The waiver version is missing. Reload the page and try again.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from zt_waiver_versions w where w.version = v_waiver_version) then
    raise exception 'The waiver text has changed since this page loaded. Reload the page and read the current waiver.' using errcode = 'P0001';
  end if;

  select count(*)::int into v_accepted_count from athletes a where a.meet_id = m.id;
  if m.registration_status = 'waitlist' then
    v_outcome := 'waitlist';
    v_waitlisted := true;
  else
    if m.athlete_cap is not null and v_accepted_count >= m.athlete_cap then
      raise exception '% is full (% of % spots taken). Contact the promoter to ask about a waitlist.',
        m.name, v_accepted_count, m.athlete_cap using errcode = 'P0001';
    end if;
    v_outcome := 'pending';
    v_waitlisted := false;
  end if;

  -- Inbox cap: pending + waitlist requests per meet, so a hostile client cannot fill the dashboard without limit.
  select count(*)::int into v_pending_count from registrations r where r.meet_id = m.id and r.status = 'pending';
  if v_pending_count >= greatest(coalesce(m.athlete_cap, 0) * 3, 200) then
    raise exception 'The promoter has more requests for % than they can review right now. Contact them directly.', m.name
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from registrations r
    where r.meet_id = m.id and r.division_id = v_div_id and lower(trim(r.email)) = v_email
      and r.status not in ('withdrawn', 'declined')
  ) then
    raise exception 'An active or pending registration already exists for this email in the selected division.'
      using errcode = 'P0001';
  end if;

  if p_input ? 'bodyweight' and p_input->>'bodyweight' is not null and trim(p_input->>'bodyweight') <> '' then
    begin
      v_bodyweight := (p_input->>'bodyweight')::numeric;
    exception when others then
      raise exception 'Bodyweight must be a number.' using errcode = 'P0001';
    end;
    if v_bodyweight <= 0 or v_bodyweight > 1000 then
      raise exception 'Bodyweight must be between 1 and 1000.' using errcode = 'P0001';
    end if;
  else
    v_bodyweight := null;
  end if;

  begin
    insert into registrations (
      meet_id, user_id, athlete_id, division_id, name, email, bodyweight,
      emergency_contact, status, waitlisted, paid, waiver_accepted_at, waiver_version
    )
    values (
      m.id, auth.uid(), null, v_div_id, v_name, v_email, v_bodyweight,
      v_emergency, 'pending', v_waitlisted, false, now(), v_waiver_version
    )
    returning id into v_reg_id;
  exception when unique_violation then
    -- two submissions raced past the select above; the partial unique index settles it
    raise exception 'An active or pending registration already exists for this email in the selected division.'
      using errcode = 'P0001';
  end;

  return jsonb_build_object('id', v_reg_id, 'status', v_outcome);
end $$;
grant execute on function zt_submit_registration(text, jsonb) to anon, authenticated;

-- ---------- 1b. zt_set_registration_status (replaces 005's): unlink, then delete ----------
create or replace function zt_set_registration_status(p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  r registrations%rowtype;
  m meets%rowtype;
  v_ath_id text;
  v_next_lot int;
  v_event_names text;
  v_verb text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sign in required to update registration status.' using errcode = 'P0001';
  end if;

  if p_status not in ('pending', 'accepted', 'declined', 'withdrawn') then
    raise exception 'Invalid registration status "%".', coalesce(p_status, '') using errcode = 'P0001';
  end if;

  select * into r from registrations where id = p_id for update;
  if not found then
    raise exception 'No registration found with id "%".', p_id using errcode = 'P0001';
  end if;

  select * into m from meets where id = r.meet_id for update;
  if not found then
    raise exception 'Associated meet no longer exists.' using errcode = 'P0001';
  end if;

  if not zt_is_owner_or_member(r.meet_id) then
    raise exception 'You do not have permission to update registrations for this meet.' using errcode = 'P0001';
  end if;

  if r.status = p_status then
    return row_to_json(r)::jsonb;
  end if;

  if p_status = 'accepted' then
    if not exists (select 1 from divisions d where d.meet_id = r.meet_id and d.id = r.division_id) then
      raise exception '% registered for a division that no longer exists on %. Decline the request or restore the division before accepting.',
        r.name, m.name using errcode = 'P0001';
    end if;

    if m.athlete_cap is not null and (select count(*) from athletes a where a.meet_id = r.meet_id) >= m.athlete_cap then
      raise exception '% is at its athlete cap (%). Raise the cap in Listing before accepting %.',
        m.name, m.athlete_cap, r.name using errcode = 'P0001';
    end if;

    v_ath_id := coalesce(r.athlete_id, 'reg-ath-' || left(r.id::text, 8));

    if not exists (select 1 from athletes a where a.meet_id = r.meet_id and a.id = v_ath_id) then
      select coalesce(max(lot_number), 0) + 1 into v_next_lot
      from athletes a where a.meet_id = r.meet_id and a.division_id = r.division_id;

      insert into athletes (id, meet_id, division_id, name, bodyweight, lot_number, status, rack_heights)
      values (v_ath_id, r.meet_id, r.division_id, r.name, r.bodyweight, v_next_lot, 'active', '{}'::jsonb);
    end if;

    update registrations
    set status = 'accepted', athlete_id = v_ath_id, updated_at = now()
    where id = r.id
    returning * into r;
  else
    if r.athlete_id is not null then
      select string_agg(coalesce(e.name, res.event_id), ', ' order by e.event_number nulls last)
      into v_event_names
      from results res
      left join events e on e.meet_id = res.meet_id and e.id = res.event_id
      where res.meet_id = r.meet_id and res.athlete_id = r.athlete_id;

      if v_event_names is not null then
        v_verb := case
          when p_status = 'declined' then 'declined'
          when p_status = 'withdrawn' then 'withdrawn'
          else 'reopened'
        end;
        raise exception '% has recorded results (%), so the request cannot be %. Results are read-only here; mark the athlete withdrawn on meet day instead.',
          r.name, v_event_names, v_verb using errcode = 'P0001';
      end if;

      v_ath_id := r.athlete_id;
      -- Unlink first (the FK's SET NULL would do it too, but this does not depend on the constraint's shape).
      update registrations set status = p_status, athlete_id = null, updated_at = now() where id = r.id returning * into r;
      delete from athletes where meet_id = r.meet_id and id = v_ath_id;
    else
      update registrations set status = p_status, updated_at = now() where id = r.id returning * into r;
    end if;
  end if;

  update meets set updated_at = now() where id = r.meet_id;

  return row_to_json(r)::jsonb;
end $$;
grant execute on function zt_set_registration_status(uuid, text) to authenticated;

-- ---------- 3. zt_save_meet_config (replaces 005's): cap on the roster, accepted division immutable ----------
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

  -- M9 (gate): the athlete keeps the division they registered for. Changing it means declining and re-accepting
  -- in Registrations, so the request and the roster never disagree. Name and bodyweight corrections are allowed.
  select r.name into v_linked_name
  from registrations r
  join jsonb_populate_recordset(null::athletes, coalesce(p_athletes, '[]'::jsonb)) a on a.id = r.athlete_id
  where r.meet_id = p_meet_id and r.status = 'accepted' and r.athlete_id is not null and a.division_id <> r.division_id
  limit 1;
  if v_linked_name is not null then
    raise exception '% registered for a specific division. To move them, decline or withdraw the registration and accept it again under the new division.',
      v_linked_name using errcode = 'P0001';
  end if;

  -- C4 (gate): the roster cannot be saved above the listing cap; raise the cap in Listing first.
  select count(*)::int into v_roster_count from jsonb_populate_recordset(null::athletes, coalesce(p_athletes, '[]'::jsonb));
  if cur.athlete_cap is not null and v_roster_count > cur.athlete_cap then
    raise exception 'The roster has % athletes but the listing cap is %. Raise the cap in Listing or remove athletes before saving.',
      v_roster_count, cur.athlete_cap using errcode = 'P0001';
  end if;

  select * into inc from jsonb_populate_record(null::meets, p_meet);

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
    tiebreaker_rule = coalesce(inc.tiebreaker_rule, cur.tiebreaker_rule, 'event_wins'),
    available_plates = coalesce(inc.available_plates, cur.available_plates, '{100,55,45,35,25,15,10,5,2.5}'),
    collar_weight_per_pair = coalesce(inc.collar_weight_per_pair, cur.collar_weight_per_pair, 0),
    stations = coalesce(inc.stations, cur.stations, '[{"id":"A","label":"Station 1"},{"id":"B","label":"Station 2"}]'::jsonb),
    is_demo = false,
    updated_at = now()
  where id = p_meet_id;

  insert into divisions (id, meet_id, name, flight, sort_order)
  select d.id, p_meet_id, d.name, coalesce(d.flight, 'A'), coalesce(d.sort_order, 0)
  from jsonb_populate_recordset(null::divisions, coalesce(p_divisions, '[]'::jsonb)) d
  on conflict (meet_id, id) do update set
    name = excluded.name, flight = excluded.flight, sort_order = excluded.sort_order;

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

-- ---------- 4. zt_update_listing: listing writes go through an RPC with the C3 check ----------
-- p_patch keys are the `meets` listing column names (competition_status, registration_status, results_status,
-- is_public_listed, venue, federation, entry_fee_display, registration_deadline, athlete_cap, promoter_contact).
-- Unknown keys are ignored; a key present with JSON null clears the column. Returns the updated meets row.
create or replace function zt_update_listing(p_meet_id uuid, p_patch jsonb, p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cur meets%rowtype;
  v_reg text; v_comp text; v_res text; v_cap int; v_deadline date; v_contact text;
  v_roster int;
begin
  if auth.uid() is null then
    raise exception 'Sign in required to update listing.' using errcode = 'P0001';
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

  v_comp := case when p_patch ? 'competition_status' then p_patch->>'competition_status' else cur.competition_status end;
  v_reg := case when p_patch ? 'registration_status' then p_patch->>'registration_status' else cur.registration_status end;
  v_res := case when p_patch ? 'results_status' then p_patch->>'results_status' else cur.results_status end;
  if v_comp not in ('upcoming', 'live', 'completed', 'postponed', 'cancelled') then
    raise exception 'Invalid competition status "%".', coalesce(v_comp, '') using errcode = 'P0001';
  end if;
  if v_reg not in ('open', 'closed', 'waitlist', 'day_of_only', 'not_applicable', 'not_provided') then
    raise exception 'Invalid registration status "%".', coalesce(v_reg, '') using errcode = 'P0001';
  end if;
  if v_res not in ('not_started', 'in_progress', 'provisional', 'final') then
    raise exception 'Invalid results status "%".', coalesce(v_res, '') using errcode = 'P0001';
  end if;

  if p_patch ? 'athlete_cap' then
    begin
      v_cap := nullif(trim(coalesce(p_patch->>'athlete_cap', '')), '')::int;
    exception when others then
      raise exception 'Athlete cap must be a whole number.' using errcode = 'P0001';
    end;
  else
    v_cap := cur.athlete_cap;
  end if;
  if v_cap is not null and v_cap < 1 then
    raise exception 'Athlete cap must be at least 1 (leave it blank for no cap).' using errcode = 'P0001';
  end if;
  select count(*)::int into v_roster from athletes a where a.meet_id = p_meet_id;
  if v_cap is not null and v_roster > v_cap then
    raise exception 'The roster already has % athletes; the cap cannot be lower than that.', v_roster using errcode = 'P0001';
  end if;

  if p_patch ? 'registration_deadline' then
    begin
      v_deadline := nullif(trim(coalesce(p_patch->>'registration_deadline', '')), '')::date;
    exception when others then
      raise exception 'Registration deadline must be a date (YYYY-MM-DD).' using errcode = 'P0001';
    end;
  else
    v_deadline := cur.registration_deadline;
  end if;
  if v_deadline is not null and cur.date is not null and v_deadline > cur.date then
    raise exception 'Registration deadline (%) is after the meet date (%).', to_char(v_deadline, 'YYYY-MM-DD'), to_char(cur.date, 'YYYY-MM-DD')
      using errcode = 'P0001';
  end if;

  v_contact := case when p_patch ? 'promoter_contact' then nullif(trim(coalesce(p_patch->>'promoter_contact', '')), '') else cur.promoter_contact end;
  if v_contact is not null and char_length(v_contact) > 160 then
    raise exception 'Promoter contact is too long (160 characters max).' using errcode = 'P0001';
  end if;

  update meets set
    competition_status = v_comp,
    registration_status = v_reg,
    results_status = v_res,
    is_public_listed = case when p_patch ? 'is_public_listed' then coalesce((p_patch->>'is_public_listed')::boolean, false) else is_public_listed end,
    venue = case when p_patch ? 'venue' then nullif(p_patch->'venue', 'null'::jsonb) else venue end,
    federation = case when p_patch ? 'federation' then left(nullif(trim(coalesce(p_patch->>'federation', '')), ''), 120) else federation end,
    entry_fee_display = case when p_patch ? 'entry_fee_display' then left(nullif(trim(coalesce(p_patch->>'entry_fee_display', '')), ''), 80) else entry_fee_display end,
    registration_deadline = v_deadline,
    athlete_cap = v_cap,
    promoter_contact = v_contact,
    updated_at = now()
  where id = p_meet_id
  returning * into cur;

  return row_to_json(cur)::jsonb;
end $$;
grant execute on function zt_update_listing(uuid, jsonb, timestamptz) to authenticated;

-- ---------- 5. join code no longer reveals the admin PIN; PIN checks happen server-side ----------
create or replace function zt_meet_by_join_code(p_code text) returns meets language plpgsql stable security definer set search_path = public as $$
declare r meets%rowtype;
begin
  select * into r from meets where join_code = upper(trim(p_code)) limit 1;
  if not found then return null; end if;
  r.admin_pin := null;   -- a volunteer code is not admin authority; see zt_check_admin_pin
  return r;
end $$;
grant execute on function zt_meet_by_join_code(text) to anon, authenticated;

-- A joined phone proves the PIN here instead of comparing locally. 10 tries per join code per 10 minutes.
create or replace function zt_check_admin_pin(p_code text, p_pin text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_pin text; v_code text;
begin
  v_code := upper(trim(coalesce(p_code, '')));
  if v_code = '' or p_pin is null then return false; end if;
  perform zt_rate_check('pin:' || v_code, 10, interval '10 minutes');
  select admin_pin into v_pin from meets where join_code = v_code limit 1;
  return v_pin is not null and v_pin = trim(p_pin);
end $$;
grant execute on function zt_check_admin_pin(text, text) to anon, authenticated;
