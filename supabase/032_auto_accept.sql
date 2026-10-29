-- 032_auto_accept.sql (10/29, Kurt): most promoters take every entry, so the queue is opt-in.
--
-- `meets.auto_accept` (default true, existing meets included: no live customers mid-registration on 10/29). When on,
-- zt_submit_registration accepts an entry on the spot, exactly as the promoter's Accept button would: roster row with
-- the next lot number, registration -> accepted + athlete_id, 023's trigger links the account. The waitlist path is
-- unchanged (registration_status 'waitlist' still parks the entry), the cap still refuses, and Decline / Withdraw on
-- the Registrations tab work as before. The RPC returns status 'accepted' so the register page and the 031 emails can
-- say "you are on the roster" instead of "received".
--
-- Changes: column; zt_submit_registration_body (009 body + the accept branch; the 021 wrapper is untouched);
-- zt_my_meets / zt_get_my_meet / zt_update_listing (030 bodies + auto_accept). Not in the public column grant: the
-- public /register page learns the outcome from the RPC result, not from the column.

alter table meets add column if not exists auto_accept boolean not null default true;

create or replace function zt_submit_registration_body(p_slug text, p_input jsonb)
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
  v_dob_text text;
  v_dob date;
  v_age_years int;
  v_guardian jsonb;
  v_g_name text;
  v_g_contact text;
  v_ath_id text;
  v_next_lot int;
begin
  v_ip := zt_client_ip();
  if v_ip <> '' then perform zt_rate_check('submit:ip:' || v_ip, 10, interval '10 minutes'); end if;

  v_clean_slug := lower(trim(coalesce(p_slug, p_input->>'slug', '')));
  if char_length(v_clean_slug) > 120 then
    raise exception 'No competition found at "%".', left(coalesce(p_slug, ''), 40) using errcode = 'P0001';
  end if;
  select * into m from meets where lower(slug) = v_clean_slug and is_demo = false for update;
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

  -- 009: date of birth, judged on the meet date (today when the meet has none). Under 12 refused (Strongman Corp
  -- minimum); under 18 registered by a parent or legal guardian (legal/WAIVER.md section 7) who signs at check-in.
  -- Messages match lib/promoter/rules.ts validateAthleteAge. All three columns are owner-only.
  v_dob_text := trim(coalesce(p_input->>'dateOfBirth', ''));
  if v_dob_text !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Enter the athlete date of birth.' using errcode = 'P0001';
  end if;
  begin
    v_dob := v_dob_text::date;
  exception when others then
    raise exception 'Enter the athlete date of birth.' using errcode = 'P0001';
  end;
  if v_dob > current_date then
    raise exception 'Date of birth cannot be in the future.' using errcode = 'P0001';
  end if;
  v_age_years := extract(year from age(coalesce(m.date, current_date)::timestamp, v_dob::timestamp))::int;
  if v_age_years > 100 then
    raise exception 'Check the date of birth.' using errcode = 'P0001';
  end if;
  if v_age_years < 12 then
    raise exception 'Athletes must be at least 12 on competition day. Contact the promoter about younger athletes.' using errcode = 'P0001';
  end if;
  if v_age_years < 18 then
    v_guardian := case when jsonb_typeof(p_input->'guardian') = 'object' then p_input->'guardian' else '{}'::jsonb end;
    v_g_name := trim(coalesce(v_guardian->>'name', ''));
    v_g_contact := trim(coalesce(v_guardian->>'contact', ''));
    if char_length(v_g_name) < 2 then
      raise exception 'An athlete under 18 must be registered by a parent or legal guardian. Enter the guardian full name.' using errcode = 'P0001';
    end if;
    if char_length(v_g_name) > 80 then
      raise exception 'Guardian name is too long (80 characters max).' using errcode = 'P0001';
    end if;
    if char_length(v_g_contact) > 160 then
      raise exception 'Guardian contact is too long (160 characters max).' using errcode = 'P0001';
    end if;
    if char_length(regexp_replace(v_g_contact, '[^0-9]', '', 'g')) < 7 and v_g_contact !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
      raise exception 'Guardian contact needs a phone number with at least 7 digits or an email address.' using errcode = 'P0001';
    end if;
  else
    v_g_name := null;
    v_g_contact := null;
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
    if v_bodyweight < 1 or v_bodyweight > 1000 then   -- R7 (rehearsal): matches the message; 0.5 used to pass
      raise exception 'Bodyweight must be between 1 and 1000.' using errcode = 'P0001';
    end if;
  else
    v_bodyweight := null;
  end if;

  begin
    insert into registrations (
      meet_id, user_id, athlete_id, division_id, name, email, bodyweight,
      emergency_contact, status, waitlisted, paid, waiver_accepted_at, waiver_version,
      date_of_birth, guardian_name, guardian_contact
    )
    values (
      m.id, auth.uid(), null, v_div_id, v_name, v_email, v_bodyweight,
      v_emergency, 'pending', v_waitlisted, false, now(), v_waiver_version,
      v_dob, v_g_name, v_g_contact
    )
    returning id into v_reg_id;
  exception when unique_violation then
    -- two submissions raced past the select above; the partial unique index settles it
    raise exception 'An active or pending registration already exists for this email in the selected division.'
      using errcode = 'P0001';
  end;

  -- 032: accept on the spot when the promoter asked for it. Same steps as zt_set_registration_status 'accepted':
  -- roster row with the next lot number in the division, then the registration points at it (023's trigger links the
  -- account). The cap was checked above under the row lock, so this cannot overfill the roster.
  if v_outcome = 'pending' and m.auto_accept then
    v_ath_id := 'reg-ath-' || left(v_reg_id::text, 8);
    select coalesce(max(lot_number), 0) + 1 into v_next_lot
      from athletes a where a.meet_id = m.id and a.division_id = v_div_id;
    insert into athletes (id, meet_id, division_id, name, bodyweight, lot_number, status, rack_heights)
    values (v_ath_id, m.id, v_div_id, v_name, v_bodyweight, v_next_lot, 'active', '{}'::jsonb);
    update registrations set status = 'accepted', athlete_id = v_ath_id, updated_at = now() where id = v_reg_id;
    update meets set updated_at = now() where id = m.id;
    v_outcome := 'accepted';
  end if;

  return jsonb_build_object('id', v_reg_id, 'status', v_outcome);
end $$;

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
      m.host_gym_id, m.theme, m.auto_accept,
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
      m.host_gym_id, m.theme, m.auto_accept,
      (select count(*)::int from divisions d where d.meet_id = m.id) as division_count,
      (select count(*)::int from athletes a where a.meet_id = m.id) as athlete_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status in ('pending', 'waitlist')) as pending_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status = 'accepted') as registration_count
    from meets m
    where m.id = p_meet_id
  ) q;

  return v_out;
end $$;

-- zt_update_listing: 030 body + auto_accept. Grants from 018 (authenticated, service_role) carry over.
create or replace function zt_update_listing(p_meet_id uuid, p_patch jsonb, p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cur meets%rowtype;
  v_reg text; v_comp text; v_res text; v_cap int; v_deadline date; v_contact text; v_listed boolean; v_venue jsonb;
  v_gym uuid; v_theme jsonb; v_auto boolean;
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
    updated_at = now()
  where id = p_meet_id
  returning * into cur;

  return row_to_json(cur)::jsonb;
end $$;
