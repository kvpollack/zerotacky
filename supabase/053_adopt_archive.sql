-- 053: adopt an archived show as a completed ZeroTacky meet (Kurt 11/9: "built out like it's a completed meet for us,
-- with a disclaimer that the results were imported from Iron Podium or elsewhere"). A signed-in promoter (or gym
-- owner) picks an archive competition (050) and gets a real meet: divisions from the archive divisions, events from the
-- archive events, athletes from the placements, one locked result per archive event row carrying the published points
-- and the raw mark, plus the published overall place per athlete. The engine never rescores an imported meet: events
-- carry config.imported, results carry importedPoints / importedDisplay, overall places come from
-- meet_imported_placings. One adoption per archive competition (meets.imported_slug unique); the owner can transfer or
-- invite like any meet. The show page shows the disclaimer whenever meets.imported_from is set.
-- Verify: select count(*) from pg_proc where proname in ('zt_archive_competition_search','zt_adopt_archive_competition','zt_scoring_type_for'); -- 3

alter table meets add column if not exists imported_from jsonb;
alter table meets add column if not exists imported_slug text;
create unique index if not exists meets_imported_slug_uq on meets (imported_slug) where imported_slug is not null;

create table if not exists meet_imported_placings (
  meet_id uuid not null references meets(id) on delete cascade,
  athlete_id text not null,
  place int not null,
  points numeric,
  is_tied boolean not null default false,
  primary key (meet_id, athlete_id),
  foreign key (meet_id, athlete_id) references athletes(meet_id, id) on delete cascade
);
alter table meet_imported_placings enable row level security;
drop policy if exists meet_imported_placings_read on meet_imported_placings;
create policy meet_imported_placings_read on meet_imported_placings for select using (true);
grant select on meet_imported_placings to anon, authenticated;


-- ---------- public read of the import marker (meets has column-level grants, 046 pattern) ----------
grant select (imported_from, imported_slug) on meets to anon, authenticated;

-- ---------- zt_my_meets: 046 body + imported_from ----------
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
      m.sponsors, m.livestream_url, m.staff, m.imported_from,
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

-- ---------- zt_get_my_meet: 046 body + imported_from ----------
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
      m.sponsors, m.livestream_url, m.staff, m.imported_from,
      (select count(*)::int from divisions d where d.meet_id = m.id) as division_count,
      (select count(*)::int from athletes a where a.meet_id = m.id) as athlete_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status in ('pending', 'waitlist')) as pending_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status = 'accepted') as registration_count
    from meets m
    where m.id = p_meet_id
  ) q;

  return v_out;
end $$;

create or replace function zt_scoring_type_for(p_event_type text, p_unit text) returns text language sql immutable as $$
  select case
    when p_event_type = 'max_weight' then 'max_weight'
    when p_event_type in ('time', 'distance') then 'time_or_distance'
    when p_event_type = 'medley' then case when p_unit = 'reps' then 'reps' else 'time_or_implements' end
    else 'reps' end
$$;

-- Promoter search box: archive competitions by name / city / state, newest first, with the adopting meet if any.
create or replace function zt_archive_competition_search(p_q text, p_limit int default 20) returns jsonb
language sql stable security definer set search_path = public as $$
  with q as (select nullif(trim(coalesce(p_q, '')), '') q),
  hits as (
    select c.id, c.slug, c.name, c.date, c.sanction, c.city, c.state,
           (select count(*) from archive_placements p where p.competition_id = c.id) athletes,
           (select count(distinct p.division) from archive_placements p where p.competition_id = c.id) divisions,
           (select count(distinct r.event) from archive_results r where r.competition_id = c.id) events,
           (select jsonb_build_object('slug', m.slug, 'id', m.id, 'mine', m.owner_id = auth.uid()) from meets m where m.imported_slug = c.slug) adopted
    from archive_competitions c, q
    where q.q is null or c.name ilike '%' || q.q || '%' or c.city ilike '%' || q.q || '%' or c.state ilike q.q
       or (q.q ~ '^\d{4}$' and extract(year from c.date)::text = q.q)
    order by c.date desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', h.slug, 'name', h.name, 'date', h.date, 'sanction', h.sanction, 'city', h.city, 'state', h.state,
    'athletes', h.athletes, 'divisions', h.divisions, 'events', h.events, 'adopted', h.adopted) order by h.date desc), '[]'::jsonb)
  from hits h
$$;
revoke all on function zt_archive_competition_search(text, int) from public, anon;
grant execute on function zt_archive_competition_search(text, int) to authenticated;

create or replace function zt_adopt_archive_competition(p_slug text, p_host_gym_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c archive_competitions%rowtype;
  v_meet uuid := gen_random_uuid();
  v_slug text; v_base text; v_n int := 0;
  v_source_name text; v_credit text;
begin
  if v_uid is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  select * into c from archive_competitions where slug = p_slug;
  if c.id is null then raise exception 'That archive show was not found.' using errcode = 'P0001'; end if;
  if exists (select 1 from meets where imported_slug = c.slug) then
    raise exception 'That show has already been imported. Ask its owner for a transfer if it should be yours.' using errcode = 'P0001';
  end if;
  if p_host_gym_id is not null and not exists (select 1 from gyms g where g.id = p_host_gym_id and g.status <> 'removed') then
    raise exception 'That gym listing is gone.' using errcode = 'P0001';
  end if;
  if (select count(*) from meets where owner_id = v_uid and imported_from is not null and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That is a lot of imports for one day. Try again tomorrow.' using errcode = 'P0001';
  end if;

  v_source_name := case c.source when 'sr' then 'strongmanresults.com' when 'os' then 'openstrongman.org' else c.source end;
  v_credit := case c.source
    when 'sr' then 'Results imported from strongmanresults.com (CC BY 4.0); original scoring published on Iron Podium. Not scored live on ZeroTacky.'
    else 'Results imported from ' || v_source_name || '. Not scored live on ZeroTacky.' end;

  -- slug: name-year (year skipped when the name already carries it, e.g. "Boiling Point 2026"), numbered on collision
  v_base := left(trim(both '-' from regexp_replace(lower(c.name), '[^a-z0-9]+', '-', 'g')), 60);
  if c.name !~ ('\m' || extract(year from c.date)::int || '\M') then
    v_base := v_base || '-' || extract(year from c.date)::int;
  end if;
  v_slug := v_base;
  while exists (select 1 from meets where slug = v_slug) loop v_n := v_n + 1; v_slug := v_base || '-' || v_n; end loop;

  insert into meets (id, slug, name, date, owner_id, admin_pin, is_demo,
                     competition_status, registration_status, results_status, is_public_listed,
                     venue, federation, host_gym_id, imported_from, imported_slug)
  values (v_meet, v_slug, c.name, c.date, v_uid, lpad((floor(random() * 10000))::int::text, 4, '0'), false,
          'completed', 'not_applicable', 'final', true,
          case when c.city is not null or c.state is not null then jsonb_build_object('city', coalesce(c.city, ''), 'state', coalesce(c.state, ''), 'country', 'US') end,
          case c.sanction when 'sc' then 'Strongman Corporation' when 'uss' then 'United States Strongman' when 'psl' then 'PSL' else nullif(upper(c.sanction), '') end,
          p_host_gym_id,
          jsonb_build_object('source', c.source, 'sourceName', v_source_name, 'archiveSlug', c.slug, 'competitionId', c.id,
                             'credit', v_credit, 'importedAt', now(), 'importedBy', v_uid),
          c.slug);

  -- divisions, in the order the archive lists them (first appearance by best place)
  insert into divisions (id, meet_id, name, flight, sort_order)
  select 'imp-d' || row_number() over (order by d.min_id), v_meet, d.division, 'A', row_number() over (order by d.min_id) - 1
  from (select division, min(id) min_id from archive_placements where competition_id = c.id group by division) d;

  -- events: one per (event_num, name); scoring type is a best fit for display, the engine does not rescore imports
  insert into events (id, meet_id, event_number, name, scoring_type, time_cap_seconds, lanes, loading_points, weight_entry_mode, implement_empty_weight, config)
  select 'imp-e' || e.min_id, v_meet, row_number() over (order by e.event_num, e.min_id), e.event,
         zt_scoring_type_for(e.event_type, e.unit), 60, 1, 0, 'total', 0,
         jsonb_build_object('imported', true, 'importedUnit', e.unit, 'importedType', e.event_type, 'divisionWeights', '{}'::jsonb)
  from (select event_num, event, min(id) min_id, min(event_type) event_type, min(unit) unit
        from archive_results where competition_id = c.id group by event_num, event) e;
  -- (event ids are 'imp-e' || the smallest archive_results id in the group, so the results insert below can join on it)

  -- athletes: one per placement row, lot order = published place
  insert into athletes (id, meet_id, division_id, name, lot_number, status)
  select 'imp-a' || p.id, v_meet, d.id, p.athlete, coalesce(p.place, 999), 'active'
  from archive_placements p
  join divisions d on d.meet_id = v_meet and d.name = p.division
  where p.competition_id = c.id;

  insert into meet_imported_placings (meet_id, athlete_id, place, points, is_tied)
  select v_meet, 'imp-a' || p.id, coalesce(p.place, 999), p.points,
         count(*) over (partition by p.division, p.place) > 1 and p.place is not null
  from archive_placements p where p.competition_id = c.id;

  -- results: one per archive event row, matched to the athlete by name key + division; locked
  insert into results (id, meet_id, event_id, athlete_id, payload, locked)
  select distinct on (ev.id, a.id)
         ev.id || '_' || a.id, v_meet, ev.id, a.id,
         jsonb_strip_nulls(jsonb_build_object(
           'importedPoints', r.points,
           'importedDisplay', nullif(trim(concat_ws(' ', r.raw_value, case when r.raw_value ~ '[a-z]' then null else r.unit end)), ''),
           'reps', case when r.event_type in ('reps', 'medley') and r.unit = 'reps' then r.value end,
           'timeSeconds', case when r.unit = 'sec' then r.value end,
           'distanceFeet', case when r.unit = 'ft' then r.value end,
           'maxWeightLbs', case when r.event_type = 'max_weight' then case when r.unit = 'kg' then round(r.value * 2.20462, 1) else r.value end end)),
         true
  from archive_results r
  join archive_placements p on p.competition_id = r.competition_id and p.athlete_key = r.athlete_key and p.division = r.division
  join athletes a on a.meet_id = v_meet and a.id = 'imp-a' || p.id
  join (select event_num, event, min(id) min_id from archive_results where competition_id = c.id group by event_num, event) eg
    on eg.event_num is not distinct from r.event_num and eg.event = r.event
  join events ev on ev.meet_id = v_meet and ev.id = 'imp-e' || eg.min_id
  where r.competition_id = c.id
  order by ev.id, a.id, r.id;

  return jsonb_build_object('meetId', v_meet, 'slug', v_slug,
    'athletes', (select count(*) from athletes where meet_id = v_meet),
    'events', (select count(*) from events where meet_id = v_meet),
    'results', (select count(*) from results where meet_id = v_meet));
end $$;
revoke all on function zt_adopt_archive_competition(text, uuid) from public, anon;
grant execute on function zt_adopt_archive_competition(text, uuid) to authenticated;
