-- 060: adopted archive shows keep their unit (kg / m session 2, 11/12).
-- 053 converted every archive kg figure to pounds because a meet had no unit. Since 059 a meet carries `units`; an archive
-- competition published only in kg / m is now adopted as a metric meet with its numbers kept as published, so the show
-- page, PR board and group picker label them kg / m and normalise only where shows are compared. Shows with lb / ft
-- rows (including mixed ones) are adopted imperial as before, with kg / m rows converted. `importedDisplay` is untouched.
-- Body copied from 053 with the five marked changes (v_units, the exists test, `units` on the insert, the two payload cases).

create or replace function zt_adopt_archive_competition(p_slug text, p_host_gym_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c archive_competitions%rowtype;
  v_meet uuid := gen_random_uuid();
  v_slug text; v_base text; v_n int := 0;
  v_source_name text; v_credit text;
  v_units text := 'imperial';
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

  -- 060: an archive show whose results carry only kg / m (never lb / ft) is adopted as a metric meet and its numbers are
  -- kept as published; anything else is imperial and kg / m rows are converted as before. Mixed shows stay imperial.
  if exists (select 1 from archive_results r where r.competition_id = c.id and r.unit in ('kg', 'm'))
     and not exists (select 1 from archive_results r where r.competition_id = c.id and r.unit in ('lb', 'lbs', 'ft')) then
    v_units := 'metric';
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
                     competition_status, registration_status, results_status, is_public_listed, units,
                     venue, federation, host_gym_id, imported_from, imported_slug)
  values (v_meet, v_slug, c.name, c.date, v_uid, lpad((floor(random() * 10000))::int::text, 4, '0'), false,
          'completed', 'not_applicable', 'final', true, v_units,
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
           'distanceFeet', case when r.unit = 'ft' then r.value
                                when r.unit = 'm' then case when v_units = 'metric' then r.value else round(r.value * 3.28084, 1) end end,
           'maxWeightLbs', case when r.event_type = 'max_weight' then
                                case when r.unit = 'kg' and v_units <> 'metric' then round(r.value * 2.20462, 1) else r.value end end)),
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
