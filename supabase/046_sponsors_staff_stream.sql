-- 046_sponsors_staff_stream.sql (11/6, feature gaps #12 staff roster, #14 sponsor blocks, #17 livestream link).
--
-- `sponsors jsonb` on meets: array (<= 6) of {"name": <= 60, "url"?: https, "logoPath"?: "<uid>/<file>" in the public
-- `sponsor-logos` bucket} or null. Public (show page, phone board, TV idle strip).
-- `livestream_url text`: https link (<= 300) or null. Public (show page Key, phone board footer).
-- `staff jsonb`: array (<= 40) of {"name": <= 60, "role": judge | head_judge | state_rep | volunteer | loader | scorer |
-- emcee | medic | other, "station"?: <= 40, "contact"?: <= 80, "note"?: <= 160} or null. PRIVATE: no anon column grant;
-- only zt_my_meets / zt_get_my_meet (owner or member) return it. The editor prints briefing cards from it.
-- lib/promoter/rules.ts (validateListingPatch) mirrors these checks for the form.
--
-- Changes: three columns + check constraints via zt_sponsors_ok / zt_https_url_ok / zt_staff_ok; public column grant gains
-- sponsors + livestream_url (additive, 037 pattern); zt_my_meets / zt_get_my_meet return all three; zt_update_listing
-- accepts them in the patch (jsonb null / blank clears); `sponsor-logos` storage bucket (013 avatars pattern, owner
-- folder <uid>/...). zt_public_meet_by_slug and zt_broadcast_payload are unchanged.
--
-- Verify after apply:
--   select column_name from information_schema.columns where table_name = 'meets'
--     and column_name in ('sponsors', 'livestream_url', 'staff');                              -- 3 rows
--   select zt_sponsors_ok('[{"name":"Iron Gym","url":"https://irongym.com"}]'), zt_sponsors_ok('[{"url":"https://x.y"}]');  -- t, f
--   select zt_staff_ok('[{"name":"Pat","role":"judge","station":"A"}]'), zt_staff_ok('[{"name":"Pat","role":"boss"}]');     -- t, f
--   select id, public, file_size_limit from storage.buckets where id = 'sponsor-logos';

create or replace function zt_https_url_ok(p text, p_max int default 300) returns boolean
language sql immutable as $$
  select p is null or (char_length(p) <= p_max and p ~ '^https://[^[:space:]]+$');
$$;

create or replace function zt_sponsors_ok(p jsonb) returns boolean
language sql immutable as $$
  select p is null
      or (
        jsonb_typeof(p) = 'array'
        and jsonb_array_length(p) between 1 and 6
        and pg_column_size(p) <= 4000
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
        and pg_column_size(p) <= 12000
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

alter table meets add column if not exists sponsors jsonb;
alter table meets add column if not exists livestream_url text;
alter table meets add column if not exists staff jsonb;
alter table meets drop constraint if exists meets_sponsors_chk;
alter table meets add constraint meets_sponsors_chk check (zt_sponsors_ok(sponsors));
alter table meets drop constraint if exists meets_livestream_url_chk;
alter table meets add constraint meets_livestream_url_chk check (zt_https_url_ok(livestream_url, 300));
alter table meets drop constraint if exists meets_staff_chk;
alter table meets add constraint meets_staff_chk check (zt_staff_ok(staff));
grant select (sponsors, livestream_url) on meets to anon, authenticated;

-- ---------- sponsor-logos bucket (013 avatars pattern): public read, writes only inside <uid>/... ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sponsor-logos', 'sponsor-logos', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists sponsor_logos_read on storage.objects;
create policy sponsor_logos_read on storage.objects for select to public using (bucket_id = 'sponsor-logos');
drop policy if exists sponsor_logos_insert_own on storage.objects;
create policy sponsor_logos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'sponsor-logos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists sponsor_logos_update_own on storage.objects;
create policy sponsor_logos_update_own on storage.objects for update to authenticated
  using (bucket_id = 'sponsor-logos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'sponsor-logos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists sponsor_logos_delete_own on storage.objects;
create policy sponsor_logos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'sponsor-logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- zt_my_meets: 044 body + sponsors, livestream_url, staff ----------
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
      m.sponsors, m.livestream_url, m.staff,
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

-- ---------- zt_get_my_meet: 044 body + sponsors, livestream_url, staff ----------
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
      m.sponsors, m.livestream_url, m.staff,
      (select count(*)::int from divisions d where d.meet_id = m.id) as division_count,
      (select count(*)::int from athletes a where a.meet_id = m.id) as athlete_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status in ('pending', 'waitlist')) as pending_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status = 'accepted') as registration_count
    from meets m
    where m.id = p_meet_id
  ) q;

  return v_out;
end $$;

-- ---------- zt_update_listing: 044 body + sponsors, livestream_url, staff. Grants from 018 (authenticated, service_role) carry over. ----------
create or replace function zt_update_listing(p_meet_id uuid, p_patch jsonb, p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cur meets%rowtype;
  v_reg text; v_comp text; v_res text; v_cap int; v_deadline date; v_contact text; v_listed boolean; v_venue jsonb;
  v_gym uuid; v_theme jsonb; v_auto boolean; v_sched jsonb;
  v_sponsors jsonb; v_stream text; v_staff jsonb;
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

