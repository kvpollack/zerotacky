-- 047_audit_md_fixes.sql (11/6 night): fixes from the Astra audit of #7/#8/#12/#14/#17
-- (~/Downloads/zerotacky_astra_audit_7_8_small_2026-11-06.md). SQL-side findings only; the client fixes ship in the same push.
--
--   MD-01 (P0)  zt_meet_by_join_code returned the whole meets row to anon with a volunteer code, so 046's private `staff`
--               column (judges' phone numbers) leaked past the missing column grant. The function now nulls staff as well as
--               admin_pin, and the comment below is the canary rule: every private meets column added later is nulled here.
--   MD-02 (P1)  zt_desk_athlete / zt_desk_division_cap lock the meet row FIRST (same order as zt_publish_meet / the builder
--               save), so two reclasses cannot read the same max(lot_number) and desk-vs-builder saves cannot deadlock.
--   MD-08 (P1)  clearing a weigh-in restores athletes.bodyweight from the linked registration (or null), instead of leaving
--               the invalidated lb mirror on the roster.
--   MD-09 (P1)  pg_column_size caps on schedule / sponsors / staff were reachable by field-valid payloads (40 staff with
--               full-length fields, CJK notes). Raised to pure DoS guards no field-valid payload can reach.
--   MD-10 (P1)  zt_update_listing refuses non-string schedule values, checks the zone against PostgreSQL's own zone table
--               and applies the same time-order rules as the client.
--   MD-16 (P2)  desk kg (weigh-in and cap) are checked on the raw value: two decimals max, 20 to 300, no rounding first.
--   MD-17 (P2)  zt_https_url_ok requires a real hostname (https://? no longer passes).
--
-- Verify after apply:
--   select (zt_meet_by_join_code(<a code>)).staff is null, (zt_meet_by_join_code(<a code>)).owner_id is null;   -- t, t
--   select zt_https_url_ok('https://?', 300), zt_https_url_ok('https://youtube.com/live/x', 300);   -- f, t

-- ---------- MD-01: join code -> meet row, minus everything a volunteer code is not entitled to ----------
-- Canary rule: every meets column outside the public column grant (except join_code, which the caller just proved
-- they hold) is nulled here. test/join_code_privacy.test.mjs recomputes that set from the migrations and fails the
-- build when a new private column is missing below.
create or replace function zt_meet_by_join_code(p_code text) returns meets language plpgsql stable security definer set search_path = public as $$
declare r meets%rowtype;
begin
  select * into r from meets where join_code = upper(trim(p_code)) limit 1;
  if not found then return null; end if;
  r.admin_pin := null;          -- a volunteer code is not admin authority; see zt_check_admin_pin
  r.staff := null;              -- 046: judges' contacts are the promoter's alone (MD-01)
  r.owner_id := null;           -- the promoter's auth uid is not the volunteers' business either
  r.auto_accept := null;        -- promoter-only settings (032 / 042); harmless but outside the public grant
  r.reminders_enabled := null;
  return r;
end $$;
grant execute on function zt_meet_by_join_code(text) to anon, authenticated;

-- ---------- MD-17: https with a hostname ----------
create or replace function zt_https_url_ok(p text, p_max int default 300) returns boolean
language sql immutable as $$
  select p is null or (
    char_length(p) <= p_max
    and p ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
  );
$$;

-- ---------- MD-09: size caps become DoS guards only (field limits already bound the payload) ----------
create or replace function zt_schedule_ok(p jsonb) returns boolean
language sql immutable as $$
  select p is null
      or (
        jsonb_typeof(p) = 'object'
        and pg_column_size(p) <= 4096
        and not exists (
          select 1 from jsonb_each(p) kv
          where kv.key not in ('timezone', 'eveWeighInStart', 'eveWeighInEnd', 'checkIn', 'weighInStart', 'weighInEnd',
                               'rulesMeeting', 'start', 'estimatedEnd', 'notes')
             or jsonb_typeof(kv.value) <> 'string'
             or (kv.key = 'timezone' and ((kv.value #>> '{}') !~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){1,2}$' or char_length(kv.value #>> '{}') > 40))
             or (kv.key = 'notes' and char_length(kv.value #>> '{}') > 200)
             or (kv.key not in ('timezone', 'notes') and (kv.value #>> '{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
        )
      );
$$;

create or replace function zt_sponsors_ok(p jsonb) returns boolean
language sql immutable as $$
  select p is null
      or (
        jsonb_typeof(p) = 'array'
        and jsonb_array_length(p) between 1 and 6
        and pg_column_size(p) <= 32768
        and not exists (
          select 1 from jsonb_array_elements(p) s
          where jsonb_typeof(s) <> 'object'
             or coalesce(jsonb_typeof(s->'name'), '') <> 'string'
             or char_length(trim(s->>'name')) < 1
             or char_length(s->>'name') > 60
             or exists (select 1 from jsonb_each(s) kv where kv.key not in ('name', 'url', 'logoPath') or jsonb_typeof(kv.value) <> 'string')
             or (s ? 'url' and not zt_https_url_ok(s->>'url', 300))
             or (s ? 'logoPath' and (s->>'logoPath') !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$')
        )
      );
$$;

create or replace function zt_staff_ok(p jsonb) returns boolean
language sql immutable as $$
  select p is null
      or (
        jsonb_typeof(p) = 'array'
        and jsonb_array_length(p) between 1 and 40
        and pg_column_size(p) <= 131072
        and not exists (
          select 1 from jsonb_array_elements(p) s
          where jsonb_typeof(s) <> 'object'
             or coalesce(jsonb_typeof(s->'name'), '') <> 'string'
             or char_length(trim(s->>'name')) < 1
             or char_length(s->>'name') > 60
             or coalesce(s->>'role', '') not in ('judge', 'head_judge', 'state_rep', 'volunteer', 'loader', 'scorer', 'emcee', 'medic', 'other')
             or exists (select 1 from jsonb_each(s) kv where kv.key not in ('name', 'role', 'station', 'contact', 'note') or jsonb_typeof(kv.value) <> 'string')
             or char_length(coalesce(s->>'station', '')) > 40
             or char_length(coalesce(s->>'contact', '')) > 80
             or char_length(coalesce(s->>'note', '')) > 160
        )
      );
$$;

-- ---------- MD-02 / MD-08 / MD-16: desk writes ----------
create or replace function zt_desk_athlete(p_meet_id uuid, p_athlete_id text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a athletes%rowtype; c meet_checkins%rowtype; v_kg numeric; v_div text; v_lot int; v_note text; v_reg_bw numeric;
begin
  perform zt_desk_caller_ok(p_meet_id);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Nothing to change.' using errcode = 'P0001';
  end if;
  -- MD-02: meet row first, same lock order as the builder save (zt_publish_meet) and the listing update
  perform 1 from meets where id = p_meet_id for update;
  select * into a from athletes where meet_id = p_meet_id and id = p_athlete_id for update;
  if not found then
    raise exception 'That athlete is not on the roster any more. Reload the meet.' using errcode = 'P0001';
  end if;

  insert into meet_checkins (meet_id, athlete_id) values (p_meet_id, p_athlete_id) on conflict do nothing;
  select * into c from meet_checkins where meet_id = p_meet_id and athlete_id = p_athlete_id for update;

  if p_patch ? 'checked_in' then
    c.checked_in_at := case when coalesce((p_patch->>'checked_in')::boolean, false) then coalesce(c.checked_in_at, now()) else null end;
  end if;
  if p_patch ? 'paper_waiver' then
    c.paper_waiver_at := case when coalesce((p_patch->>'paper_waiver')::boolean, false) then coalesce(c.paper_waiver_at, now()) else null end;
  end if;
  if p_patch ? 'card_verified' then
    c.card_verified_at := case when coalesce((p_patch->>'card_verified')::boolean, false) then coalesce(c.card_verified_at, now()) else null end;
  end if;
  if p_patch ? 'note' then
    v_note := nullif(trim(coalesce(p_patch->>'note', '')), '');
    if v_note is not null and char_length(v_note) > 120 then
      raise exception 'Desk note is too long (120 characters max).' using errcode = 'P0001';
    end if;
    c.note := v_note;
  end if;
  if p_patch ? 'weighed_kg' then
    if jsonb_typeof(p_patch->'weighed_kg') = 'null' or trim(coalesce(p_patch->>'weighed_kg', '')) = '' then
      -- MD-08: the roster mirror goes back to what the athlete declared at registration (or nothing)
      c.weighed_kg := null; c.weighed_at := null;
      select r.bodyweight into v_reg_bw from registrations r where r.meet_id = p_meet_id and r.athlete_id = p_athlete_id and r.status = 'accepted' limit 1;
      update athletes set bodyweight = v_reg_bw where meet_id = p_meet_id and id = p_athlete_id;
    else
      begin
        v_kg := (p_patch->>'weighed_kg')::numeric;
      exception when others then
        raise exception 'Bodyweight must be a number in kilograms (like 92.4).' using errcode = 'P0001';
      end;
      -- MD-16: raw value checked, no rounding first; the scale reads two decimals at most
      if v_kg <> round(v_kg, 2) then
        raise exception 'Bodyweight is read to two decimals at most (like 92.45).' using errcode = 'P0001';
      end if;
      if v_kg < 20 or v_kg > 300 then
        raise exception 'Bodyweight % kg is outside 20 to 300. Check the scale reading.', v_kg using errcode = 'P0001';
      end if;
      c.weighed_kg := v_kg; c.weighed_at := now();
      update athletes set bodyweight = round(v_kg * 2.2046226218, 1) where meet_id = p_meet_id and id = p_athlete_id;
    end if;
  end if;

  if p_patch ? 'division_id' then
    v_div := nullif(trim(coalesce(p_patch->>'division_id', '')), '');
    if v_div is not null and v_div <> a.division_id then
      if not exists (select 1 from divisions d where d.meet_id = p_meet_id and d.id = v_div) then
        raise exception 'That division is not on this meet.' using errcode = 'P0001';
      end if;
      if exists (select 1 from results r where r.meet_id = p_meet_id and r.athlete_id = p_athlete_id) then
        raise exception 'This athlete already has a result; a reclass would orphan it. Clear the result on the scoring phone first.' using errcode = 'P0001';
      end if;
      select coalesce(max(lot_number), 0) + 1 into v_lot from athletes x where x.meet_id = p_meet_id and x.division_id = v_div;
      update athletes set division_id = v_div, lot_number = v_lot where meet_id = p_meet_id and id = p_athlete_id;
      update registrations set division_id = v_div, updated_at = now() where meet_id = p_meet_id and athlete_id = p_athlete_id;
    end if;
  end if;

  c.updated_at := now(); c.updated_by := auth.uid();
  update meet_checkins set checked_in_at = c.checked_in_at, weighed_kg = c.weighed_kg, weighed_at = c.weighed_at,
    paper_waiver_at = c.paper_waiver_at, card_verified_at = c.card_verified_at, note = c.note,
    updated_at = c.updated_at, updated_by = c.updated_by
   where meet_id = p_meet_id and athlete_id = p_athlete_id;
  update meets set updated_at = now() where id = p_meet_id;

  select * into a from athletes where meet_id = p_meet_id and id = p_athlete_id;
  return row_to_json(c)::jsonb || jsonb_build_object('division_id', a.division_id, 'bodyweight', a.bodyweight, 'lot_number', a.lot_number);
end $$;
revoke all on function zt_desk_athlete(uuid, text, jsonb) from public, anon;
grant execute on function zt_desk_athlete(uuid, text, jsonb) to authenticated;

create or replace function zt_desk_division_cap(p_meet_id uuid, p_division_id text, p_cap_kg numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d divisions%rowtype;
begin
  perform zt_desk_caller_ok(p_meet_id);
  perform 1 from meets where id = p_meet_id for update;   -- MD-02
  if p_cap_kg is not null and p_cap_kg <> round(p_cap_kg, 2) then
    raise exception 'Weight cap is set to two decimals at most (like 90 or 82.5).' using errcode = 'P0001';   -- MD-16
  end if;
  if p_cap_kg is not null and (p_cap_kg < 20 or p_cap_kg > 300) then
    raise exception 'Weight cap must be between 20 and 300 kg (leave it blank for no cap).' using errcode = 'P0001';
  end if;
  update divisions set weight_cap_kg = p_cap_kg
   where meet_id = p_meet_id and id = p_division_id returning * into d;
  if not found then
    raise exception 'That division is not on this meet.' using errcode = 'P0001';
  end if;
  update meets set updated_at = now() where id = p_meet_id;
  return jsonb_build_object('division_id', d.id, 'weight_cap_kg', d.weight_cap_kg);
end $$;
revoke all on function zt_desk_division_cap(uuid, text, numeric) from public, anon;
grant execute on function zt_desk_division_cap(uuid, text, numeric) to authenticated;

-- ---------- zt_update_listing: 046 body + MD-10 schedule parity (non-string values refused, real zone, time order). Grants from 018 (authenticated, service_role) carry over. ----------
create or replace function zt_update_listing(p_meet_id uuid, p_patch jsonb, p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cur meets%rowtype;
  v_reg text; v_comp text; v_res text; v_cap int; v_deadline date; v_contact text; v_listed boolean; v_venue jsonb;
  v_gym uuid; v_theme jsonb; v_auto boolean; v_sched jsonb;
  v_sponsors jsonb; v_stream text; v_staff jsonb;
  v_tz text; v_ws text; v_we text; v_es text; v_ee text; v_st text; v_en text;
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

  v_listed := case when p_patch ? 'is_public_listed' then coalesce((p_patch->>'is_public_listed')::boolean, false) else cur.is_public_listed end;
  v_venue := zt_check_venue(case when p_patch ? 'venue' then p_patch->'venue' else cur.venue end, v_listed);

  if p_patch ? 'host_gym_id' then
    begin
      v_gym := nullif(trim(coalesce(p_patch->>'host_gym_id', '')), '')::uuid;
    exception when others then
      raise exception 'Host gym id is invalid.' using errcode = 'P0001';
    end;
    if v_gym is not null and not exists (select 1 from gyms g where g.id = v_gym and g.status in ('unclaimed', 'claimed')) then
      raise exception 'Host gym not found in the directory.' using errcode = 'P0001';
    end if;
  else
    v_gym := cur.host_gym_id;
  end if;

  if p_patch ? 'theme' then
    v_theme := case when jsonb_typeof(p_patch->'theme') = 'null' then null else p_patch->'theme' end;
    if not zt_theme_ok(v_theme) then
      raise exception 'Show colours must be six-digit hex values (like #e11d48) for primary, background and, optionally, secondary.' using errcode = 'P0001';
    end if;
  else
    v_theme := cur.theme;
  end if;

  v_auto := case when p_patch ? 'auto_accept' then coalesce((p_patch->>'auto_accept')::boolean, true) else cur.auto_accept end;

  if p_patch ? 'schedule' then
    v_sched := case when jsonb_typeof(p_patch->'schedule') = 'null' then null else p_patch->'schedule' end;
    if v_sched is not null then
      if jsonb_typeof(v_sched) <> 'object' then
        raise exception 'Schedule must be an object of HH:MM times.' using errcode = 'P0001';
      end if;
      -- MD-10: a non-string value is a bad request, not something to drop quietly
      if exists (select 1 from jsonb_each(v_sched) kv where jsonb_typeof(kv.value) not in ('string', 'null')) then
        raise exception 'Schedule times must be text in HH:MM (24-hour) form.' using errcode = 'P0001';
      end if;
      -- drop blank values the form sends for untouched fields, then an empty object means "no schedule"
      select nullif(jsonb_object_agg(kv.key, kv.value), '{}'::jsonb) into v_sched
        from jsonb_each(v_sched) kv where jsonb_typeof(kv.value) = 'string' and trim(kv.value #>> '{}') <> '';
    end if;
    if not zt_schedule_ok(v_sched) then
      raise exception 'Schedule times must be HH:MM (24-hour), the time zone a known zone name, and the note 200 characters or fewer.' using errcode = 'P0001';
    end if;
    if v_sched is not null then
      -- MD-10: the same order rules as cleanSchedule (lib/website/schedule.ts), and a zone PostgreSQL itself recognises
      v_tz := v_sched->>'timezone';
      if v_tz is not null then
        begin
          perform now() at time zone v_tz;
        exception when others then
          raise exception 'Time zone "%" is not a known zone name (like America/Chicago).', v_tz using errcode = 'P0001';
        end;
      end if;
      v_ws := v_sched->>'weighInStart'; v_we := v_sched->>'weighInEnd'; v_es := v_sched->>'eveWeighInStart'; v_ee := v_sched->>'eveWeighInEnd';
      v_st := v_sched->>'start'; v_en := v_sched->>'estimatedEnd';
      if v_ws is not null and v_we is not null and v_we <= v_ws then
        raise exception 'Weigh-in must end after it starts.' using errcode = 'P0001';
      end if;
      if v_es is not null and v_ee is not null and v_ee <= v_es then
        raise exception 'The day-before weigh-in must end after it starts.' using errcode = 'P0001';
      end if;
      if v_st is not null and v_en is not null and v_en <= v_st then
        raise exception 'Estimated finish must be after the first event.' using errcode = 'P0001';
      end if;
      if v_st is not null and v_we is not null and v_we > v_st then
        raise exception 'Weigh-in should close before the first event starts.' using errcode = 'P0001';
      end if;
    end if;
  else
    v_sched := cur.schedule;
  end if;

  if p_patch ? 'sponsors' then
    v_sponsors := case when jsonb_typeof(p_patch->'sponsors') = 'null' then null else p_patch->'sponsors' end;
    if v_sponsors is not null and jsonb_typeof(v_sponsors) = 'array' then
      -- trim names, drop blank optional fields and entries with no name; an empty list means "no sponsors"
      select nullif(coalesce(jsonb_agg(c.s), '[]'::jsonb), '[]'::jsonb) into v_sponsors
        from (
          select jsonb_strip_nulls(jsonb_build_object(
                   'name', nullif(trim(coalesce(e->>'name', '')), ''),
                   'url', nullif(trim(coalesce(e->>'url', '')), ''),
                   'logoPath', nullif(trim(coalesce(e->>'logoPath', '')), ''))) as s
            from jsonb_array_elements(v_sponsors) e where jsonb_typeof(e) = 'object'
        ) c where c.s ? 'name';
    end if;
    if not zt_sponsors_ok(v_sponsors) then
      raise exception 'Sponsors: up to 6, each with a name (60 characters max), an optional https:// link and an optional uploaded logo.' using errcode = 'P0001';
    end if;
  else
    v_sponsors := cur.sponsors;
  end if;

  v_stream := case when p_patch ? 'livestream_url' then nullif(trim(coalesce(p_patch->>'livestream_url', '')), '') else cur.livestream_url end;
  if not zt_https_url_ok(v_stream, 300) then
    raise exception 'Livestream link must start with https:// (300 characters max).' using errcode = 'P0001';
  end if;

  if p_patch ? 'staff' then
    v_staff := case when jsonb_typeof(p_patch->'staff') = 'null' then null else p_patch->'staff' end;
    if v_staff is not null and jsonb_typeof(v_staff) = 'array' then
      select nullif(coalesce(jsonb_agg(c.s), '[]'::jsonb), '[]'::jsonb) into v_staff
        from (
          select jsonb_strip_nulls(jsonb_build_object(
                   'name', nullif(trim(coalesce(e->>'name', '')), ''),
                   'role', nullif(trim(coalesce(e->>'role', '')), ''),
                   'station', nullif(trim(coalesce(e->>'station', '')), ''),
                   'contact', nullif(trim(coalesce(e->>'contact', '')), ''),
                   'note', nullif(trim(coalesce(e->>'note', '')), ''))) as s
            from jsonb_array_elements(v_staff) e where jsonb_typeof(e) = 'object'
        ) c where c.s ? 'name';
    end if;
    if not zt_staff_ok(v_staff) then
      raise exception 'Staff: up to 40 people, each with a name (60 characters max) and a role (judge, head judge, state rep, volunteer, loader, scorer, emcee, medic or other); station 40, contact 80 and note 160 characters max.' using errcode = 'P0001';
    end if;
  else
    v_staff := cur.staff;
  end if;

  update meets set
    competition_status = v_comp,
    registration_status = v_reg,
    results_status = v_res,
    is_public_listed = v_listed,
    venue = v_venue,
    federation = case when p_patch ? 'federation' then left(nullif(trim(coalesce(p_patch->>'federation', '')), ''), 120) else federation end,
    entry_fee_display = case when p_patch ? 'entry_fee_display' then left(nullif(trim(coalesce(p_patch->>'entry_fee_display', '')), ''), 80) else entry_fee_display end,
    registration_deadline = v_deadline,
    athlete_cap = v_cap,
    promoter_contact = v_contact,
    host_gym_id = v_gym,
    theme = v_theme,
    auto_accept = v_auto,
    schedule = v_sched,
    sponsors = v_sponsors,
    livestream_url = v_stream,
    staff = v_staff,
    updated_at = now()
  where id = p_meet_id
  returning * into cur;

  return row_to_json(cur)::jsonb;
end $$;

