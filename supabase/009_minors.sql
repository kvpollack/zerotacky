-- 009_minors.sql: athletes under 18 (Kurt 10/19, after the legal pass; industry norm from Strongman Corporation's
-- athlete rules: minimum age 12, under 18 registered by a parent or guardian who signs the waiver).
-- Depends on 005 (registrations), 007 (zt_submit_registration, zt_waiver_versions). v2 only until the merge, like 007/008.
--
-- 1. registrations gains guardian_name / guardian_contact (null = athlete 18 or older). Owner-only: not in the
--    column-level self-select grant from 005, returned only by zt_list_meet_registrations. Never on a public page.
-- 2. zt_submit_registration requires athleteAge 'adult' | 'minor' and, for a minor, guardian {name, contact}.
-- 3. zt_list_meet_registrations returns the two new columns.
-- 4. New approved waiver version: legal/WAIVER.md rewritten 10/19 (minors section 7, indemnity, software clause,
--    copies). The old hash stays listed so rows that accepted it remain valid.

alter table registrations add column if not exists guardian_name text null;
alter table registrations add column if not exists guardian_contact text null;
alter table registrations drop constraint if exists registrations_guardian_pair;
alter table registrations add constraint registrations_guardian_pair
  check ((guardian_name is null) = (guardian_contact is null));
revoke select (guardian_name, guardian_contact) on registrations from anon, authenticated;

insert into zt_waiver_versions (version, note) values ('3d524437e38f', 'legal/WAIVER.md rewritten 10/19 (minors, indemnity, software, copies); draft pending legal review')
on conflict (version) do nothing;

-- ---------- zt_submit_registration (replaces 007's) ----------
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
  v_age text;
  v_guardian jsonb;
  v_g_name text;
  v_g_contact text;
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

  -- 009: athletes under 18 are registered by a parent or legal guardian (legal/WAIVER.md section 7). The client
  -- sends athleteAge 'adult' | 'minor'; a minor needs guardian {name, contact}. Both are owner-only columns.
  v_age := lower(trim(coalesce(p_input->>'athleteAge', '')));
  if v_age not in ('adult', 'minor') then
    raise exception 'Tell us whether the athlete is 18 or older.' using errcode = 'P0001';
  end if;
  if v_age = 'minor' then
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
      emergency_contact, status, waitlisted, paid, waiver_accepted_at, waiver_version, guardian_name, guardian_contact
    )
    values (
      m.id, auth.uid(), null, v_div_id, v_name, v_email, v_bodyweight,
      v_emergency, 'pending', v_waitlisted, false, now(), v_waiver_version, v_g_name, v_g_contact
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

-- ---------- zt_list_meet_registrations (replaces 005's) ----------
create or replace function zt_list_meet_registrations(p_meet_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid; v_out jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sign in required to view registrations.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from meets where id = p_meet_id) then
    raise exception 'No meet found with serverId "%".', p_meet_id using errcode = 'P0001';
  end if;
  if not zt_is_owner_or_member(p_meet_id) then
    raise exception 'You do not have permission to view registrations for this meet.' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(row_to_json(r)::jsonb order by r.created_at desc), '[]'::jsonb)
  into v_out
  from (
    select
      id, meet_id, user_id, athlete_id, division_id, name, email, bodyweight,
      emergency_contact, status, waitlisted, paid, waiver_accepted_at, waiver_version, created_at, updated_at,
      guardian_name, guardian_contact
    from registrations
    where meet_id = p_meet_id
  ) r;

  return v_out;
end $$;
grant execute on function zt_list_meet_registrations(uuid) to authenticated;
