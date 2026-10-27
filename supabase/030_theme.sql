-- 030_theme.sql (10/27, ROADMAP 6.5 "colour ways"): a gym or a show can carry its own colours.
--
-- `theme jsonb` on gyms and meets: {"primary": "#rrggbb", "background": "#rrggbb", "secondary": "#rrggbb"?} or null
-- (ZeroTacky default). The public gym page, the public show page and the /m/<slug> board paint themselves in these
-- colours; everything else (scorer phones, the directory, the account pages) keeps the viewer's own theme. The client
-- derives the rest of the palette (surfaces, borders, text on the accent) from these three, so the server stores only
-- what the owner chose. Hex is lower-case six-digit by contract; the client normalises before saving.
--
-- Changes: columns + check constraints via zt_theme_ok; gyms owner UPDATE grant gains `theme`; the public column grant
-- on gyms gains `theme`; meets public grant, zt_public_meets, zt_my_meets, zt_get_my_meet return it; zt_update_listing
-- accepts `theme` in the patch (jsonb null clears). zt_public_meet_by_slug (registration page) is unchanged.

create or replace function zt_theme_ok(p jsonb) returns boolean
language sql immutable as $$
  select p is null
      or (
        jsonb_typeof(p) = 'object'
        and pg_column_size(p) <= 200
        and p ? 'primary' and p ? 'background'
        and not exists (
          select 1 from jsonb_each(p) kv
          where kv.key not in ('primary', 'background', 'secondary')
             or jsonb_typeof(kv.value) <> 'string'
             or (kv.value #>> '{}') !~ '^#[0-9a-f]{6}$'
        )
      );
$$;

alter table gyms add column if not exists theme jsonb;
alter table gyms drop constraint if exists gyms_theme_chk;
alter table gyms add constraint gyms_theme_chk check (zt_theme_ok(theme));

alter table meets add column if not exists theme jsonb;
alter table meets drop constraint if exists meets_theme_chk;
alter table meets add constraint meets_theme_chk check (zt_theme_ok(theme));

-- gyms: public read (015 list + theme) and owner write (016 list + theme). Column grants are additive; revoke first.
revoke select on gyms from anon, authenticated;
grant select (id, slug, name, status, gym_type, street_address, city, state, zip, lat, lng, website_url, phone, instagram, contact,
  day_pass_availability, day_pass_price, day_pass_url, drop_in_policy, drop_in_hours, equipment, equipment_notes, socials,
  source_url, source_evidence, confidence, last_verified, created_at, updated_at, theme) on gyms to anon, authenticated;
revoke update on gyms from authenticated;
grant update (name, gym_type, street_address, city, state, zip, lat, lng, website_url, phone, instagram, contact,
  day_pass_availability, day_pass_price, day_pass_url, drop_in_policy, drop_in_hours, equipment, equipment_notes, socials, theme)
  on gyms to authenticated;

-- meets: public column grant (026 list + theme).
revoke select on meets from anon, authenticated;
grant select (
  id, slug, name, date, run_order_method, tiebreaker_rule, available_plates, collar_weight_per_pair,
  stations, is_demo, created_at, updated_at,
  competition_status, registration_status, results_status, is_public_listed,
  venue, federation, entry_fee_display, registration_deadline, athlete_cap, promoter_contact,
  host_gym_id, theme
) on meets to anon, authenticated;

create or replace view zt_public_meets with (security_invoker = true) as
  select
    id, slug, name, date, run_order_method, tiebreaker_rule, available_plates, collar_weight_per_pair,
    stations, is_demo, created_at, updated_at,
    competition_status, registration_status, results_status, is_public_listed,
    venue, federation, entry_fee_display, registration_deadline, athlete_cap, promoter_contact,
    host_gym_id, theme
  from meets
  where (is_public_listed = true and is_demo = false)
     or zt_is_owner_or_member(id);
grant select on zt_public_meets to anon, authenticated;

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
      m.host_gym_id, m.theme,
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
      m.host_gym_id, m.theme,
      (select count(*)::int from divisions d where d.meet_id = m.id) as division_count,
      (select count(*)::int from athletes a where a.meet_id = m.id) as athlete_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status in ('pending', 'waitlist')) as pending_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status = 'accepted') as registration_count
    from meets m
    where m.id = p_meet_id
  ) q;

  return v_out;
end $$;

-- zt_update_listing: 026 body + theme. Grants from 018 (authenticated, service_role) carry over.
create or replace function zt_update_listing(p_meet_id uuid, p_patch jsonb, p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cur meets%rowtype;
  v_reg text; v_comp text; v_res text; v_cap int; v_deadline date; v_contact text; v_listed boolean; v_venue jsonb;
  v_gym uuid; v_theme jsonb;
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
    updated_at = now()
  where id = p_meet_id
  returning * into cur;

  return row_to_json(cur)::jsonb;
end $$;
