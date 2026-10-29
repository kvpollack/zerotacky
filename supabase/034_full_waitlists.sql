-- 034_full_waitlists.sql (10/29, Astra AA-01, Kurt's call): an OPEN meet whose roster has reached athlete_cap no longer
-- refuses a submission with "<meet> is full". The entry is stored as a waitlist request (status 'waitlist',
-- waitlisted true), the same path registration_status 'waitlist' already used, and zt_submit_registration returns
-- 'waitlist'. Auto-accept (032) only applies to the 'pending' outcome, so a waitlisted entry never jumps the cap. The
-- deadline refusal is unchanged. Body only: 032's zt_submit_registration_body with the cap branch rewritten; the 021
-- wrapper, zt_my_meets, zt_get_my_meet and zt_update_listing stay as in 032. Client: decideRegistrationOutcome in
-- lib/promoter/rules.ts mirrors this (reason 'full') and the register page says so before and after submitting.

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
    -- 034 (Astra AA-01, Kurt 10/29): an open meet at its cap takes the entry onto the waitlist instead of refusing it.
    -- Under the meet lock, so two late entries racing for the last seat get one pending (or accepted) and one waitlist.
    if m.athlete_cap is not null and v_accepted_count >= m.athlete_cap then
      v_outcome := 'waitlist';
      v_waitlisted := true;
    else
      v_outcome := 'pending';
      v_waitlisted := false;
    end if;
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
