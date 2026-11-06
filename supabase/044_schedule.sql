-- 044_schedule.sql (11/6, feature gaps #7a "meet-day timeline"): a show carries a structured meet-day schedule.
--
-- `schedule jsonb` on meets: {"timezone": IANA?, "eveWeighInStart"?, "eveWeighInEnd"?, "checkIn"?, "weighInStart"?,
-- "weighInEnd"?, "rulesMeeting"?, "start"?, "estimatedEnd"? (all "HH:MM" 24-hour, local to the venue), "notes"? (<= 200)}
-- or null. The show page prints it as a timeline, /shows/<slug>/calendar.ics is built from it, the reminder emails
-- (042/043) quote it, and the meet-day board (#7b) reads the first-event time. lib/website/schedule.ts mirrors this check.
--
-- Changes: column + check constraint via zt_schedule_ok; public column grant gains `schedule` (additive, 037 pattern);
-- zt_my_meets / zt_get_my_meet return it; zt_update_listing accepts `schedule` in the patch (jsonb null clears);
-- zt_broadcast_payload (043 body) carries it so reminders can print check-in and start times. zt_public_meet_by_slug
-- (registration page) is unchanged. zt_public_meets (030 view) is unchanged: the site reads `meets` directly.
--
-- Verify after apply:
--   select column_name from information_schema.columns where table_name = 'meets' and column_name = 'schedule';
--   select zt_schedule_ok('{"start":"09:00","timezone":"America/Chicago"}'), zt_schedule_ok('{"start":"9am"}');  -- t, f

create or replace function zt_schedule_ok(p jsonb) returns boolean
language sql immutable as $$
  select p is null
      or (
        jsonb_typeof(p) = 'object'
        and pg_column_size(p) <= 700
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

alter table meets add column if not exists schedule jsonb;
alter table meets drop constraint if exists meets_schedule_chk;
alter table meets add constraint meets_schedule_chk check (zt_schedule_ok(schedule));
grant select (schedule) on meets to anon, authenticated;

-- ---------- zt_my_meets: 032 body + results_submitted_at (037 added it only to zt_get_my_meet) + schedule ----------
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

-- ---------- zt_get_my_meet: 037 body + schedule ----------
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
      (select count(*)::int from divisions d where d.meet_id = m.id) as division_count,
      (select count(*)::int from athletes a where a.meet_id = m.id) as athlete_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status in ('pending', 'waitlist')) as pending_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status = 'accepted') as registration_count
    from meets m
    where m.id = p_meet_id
  ) q;

  return v_out;
end $$;

-- ---------- zt_update_listing: 032 body + schedule. Grants from 018 (authenticated, service_role) carry over. ----------
create or replace function zt_update_listing(p_meet_id uuid, p_patch jsonb, p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cur meets%rowtype;
  v_reg text; v_comp text; v_res text; v_cap int; v_deadline date; v_contact text; v_listed boolean; v_venue jsonb;
  v_gym uuid; v_theme jsonb; v_auto boolean; v_sched jsonb;
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
      -- drop blank values the form sends for untouched fields, then an empty object means "no schedule"
      select nullif(jsonb_object_agg(kv.key, kv.value), '{}'::jsonb) into v_sched
        from jsonb_each(v_sched) kv where jsonb_typeof(kv.value) = 'string' and trim(kv.value #>> '{}') <> '';
    end if;
    if not zt_schedule_ok(v_sched) then
      raise exception 'Schedule times must be HH:MM (24-hour), the time zone a known zone name, and the note 200 characters or fewer.' using errcode = 'P0001';
    end if;
  else
    v_sched := cur.schedule;
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
    updated_at = now()
  where id = p_meet_id
  returning * into cur;

  return row_to_json(cur)::jsonb;
end $$;

-- ---------- zt_broadcast_payload: 043 body + 'schedule' in both return objects ----------
create or replace function zt_broadcast_payload(p_broadcast uuid, p_key text, p_server boolean default false, p_limit int default 100) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b meet_broadcasts%rowtype; m meets%rowtype; v_prom_email text; v_prom_name text; v_recips jsonb; v_remaining int; v_today date;
begin
  if not zt_mail_key_ok(p_key) then raise exception 'Server key required.' using errcode = 'P0001'; end if;
  select * into b from meet_broadcasts where id = p_broadcast for update;
  if not found then raise exception 'unknown broadcast' using errcode = 'P0001'; end if;
  perform zt_broadcast_caller_ok(b.meet_id, p_server);
  select * into m from meets where id = b.meet_id;
  if not found then raise exception 'meet no longer exists' using errcode = 'P0001'; end if;
  v_today := (now() at time zone 'America/New_York')::date;

  -- BC-06: a reminder whose meet is no longer eligible is closed, not sent
  if b.kind <> 'broadcast' and not zt_reminder_meet_ok(m, v_today) then
    update meet_broadcast_recipients set status = 'skipped', error = 'meet no longer eligible for reminders'
      where broadcast_id = b.id and status = 'queued';
    perform zt_broadcast_rollup(b.id);
    return jsonb_build_object('id', b.id, 'kind', b.kind, 'audience', b.audience, 'subject', b.subject, 'body', b.body, 'test_only', b.test_only,
      'meet_id', m.id, 'meet_name', m.name, 'meet_date', m.date, 'meet_slug', m.slug, 'venue', m.venue, 'schedule', m.schedule,
      'promoter_email', null, 'promoter_name', '', 'promoter_contact', m.promoter_contact, 'recipients', '[]'::jsonb, 'remaining', 0, 'closed', 'ineligible');
  end if;

  -- BC-03/BC-04: rows whose registration opted out, changed status, or whose address is suppressed show-wide are skipped
  update meet_broadcast_recipients rc set status = 'skipped', error = 'no longer eligible'
    from registrations r
   where rc.broadcast_id = b.id and rc.status = 'queued' and rc.registration_id = r.id
     and (r.mail_opt_out
          or not (r.status = 'accepted' or (b.kind = 'broadcast' and b.audience = 'all_active' and r.status in ('pending', 'waitlist')))
          or zt_mail_suppressed(b.meet_id, rc.email));
  update meet_broadcast_recipients rc set status = 'skipped', error = 'registration removed'
   where rc.broadcast_id = b.id and rc.status = 'queued' and rc.registration_id is null and not b.test_only;
  -- BC-07: five attempts, then it is a failure
  update meet_broadcast_recipients set status = 'failed', error = coalesce(error, 'gave up after 5 attempts')
   where broadcast_id = b.id and status = 'queued' and attempts >= 5;

  if m.owner_id is not null then
    select case when u.email_confirmed_at is not null then u.email end, p.display_name
      into v_prom_email, v_prom_name from auth.users u left join profiles p on p.id = u.id where u.id = m.owner_id;
  end if;

  -- BC-02/BC-08: claim one chunk, in id order, so a retry of the same chunk has the same members
  with pick as (
    select id from meet_broadcast_recipients
     where broadcast_id = b.id and status = 'queued'
       and (attempt_at is null or attempt_at < now() - interval '2 minutes')
     order by id limit greatest(1, least(coalesce(p_limit, 100), 100))
     for update skip locked
  ), claimed as (
    update meet_broadcast_recipients rc set attempt_at = now(), attempts = rc.attempts + 1
      from pick where rc.id = pick.id
    returning rc.id, rc.registration_id, rc.email, rc.athlete_name, rc.division_name, rc.mail_token
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'registration_id', c.registration_id, 'email', c.email, 'athlete_name', c.athlete_name,
      'division_name', c.division_name, 'division_id', r.division_id, 'mail_token', c.mail_token) order by c.id), '[]'::jsonb)
    into v_recips from claimed c left join registrations r on r.id = c.registration_id;
  select count(*) into v_remaining from meet_broadcast_recipients
   where broadcast_id = b.id and status = 'queued' and (attempt_at is null or attempt_at < now() - interval '2 minutes');
  perform zt_broadcast_rollup(b.id);

  return jsonb_build_object(
    'id', b.id, 'kind', b.kind, 'audience', b.audience, 'subject', b.subject, 'body', b.body, 'test_only', b.test_only,
    'meet_id', m.id, 'meet_name', m.name, 'meet_date', m.date, 'meet_slug', m.slug, 'venue', m.venue, 'schedule', m.schedule,
    'promoter_email', nullif(trim(v_prom_email), ''), 'promoter_name', coalesce(nullif(trim(v_prom_name), ''), ''),
    'promoter_contact', m.promoter_contact,
    'recipients', v_recips, 'remaining', v_remaining
  );
end $$;
