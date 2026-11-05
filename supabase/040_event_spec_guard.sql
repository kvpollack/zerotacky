-- 040: the event spec is checked at the database (Astra BR-05, audits/astra-2026-11-05-builds-and-redraws.md).
-- The promoter form validates with lib/events/spec.ts, but zt_save_meet_config stores events.config as given, so a direct
-- RPC call could save a spec the editor refuses (a rule in both columns, a javascript: video link). This trigger mirrors
-- validateEventSpec: same fields, same limits, same refusals, plus "no unknown keys" and "half-foot course steps"
-- (BR-08). Fires on every insert/update of events, whatever the write path. Safe to re-run.
create or replace function zt_check_event_spec(p_spec jsonb) returns void
language plpgsql immutable as $$
declare
  k text; v jsonb; impl text; note text; feet numeric; url text; notes text;
  allowed text[]; not_allowed text[]; r text;
  implements text[] := array['log','axle','barbell','circus_dumbbell','viking_press','yoke','farmers','frame','husafell',
    'sandbag','keg','atlas_stones','natural_stone','loading_medley','car_deadlift','truck_pull','arm_over_arm','tire',
    'power_stairs','conans_wheel','duck_walk','other'];
  rules text[] := array['tacky','straps','belt','sleeves','wraps','chalk','suit'];
begin
  if p_spec is null or jsonb_typeof(p_spec) = 'null' then return; end if;
  if jsonb_typeof(p_spec) <> 'object' then
    raise exception 'Event spec must be an object.' using errcode = 'P0001';
  end if;
  for k, v in select * from jsonb_each(p_spec) loop
    if k not in ('implement','implementNote','courseFeet','allowed','notAllowed','videoUrl','notes') then
      raise exception 'Event spec has an unexpected field "%".', left(k, 40) using errcode = 'P0001';
    end if;
  end loop;
  impl := nullif(trim(p_spec->>'implement'), '');
  if impl is not null and not (impl = any(implements)) then
    raise exception 'Pick an implement from the list.' using errcode = 'P0001';
  end if;
  note := nullif(trim(coalesce(p_spec->>'implementNote', '')), '');
  if impl = 'other' and note is null then
    raise exception 'Describe the implement when you pick "Other".' using errcode = 'P0001';
  end if;
  if char_length(coalesce(note, '')) > 80 then
    raise exception 'Implement note is limited to 80 characters.' using errcode = 'P0001';
  end if;
  if p_spec ? 'courseFeet' and jsonb_typeof(p_spec->'courseFeet') <> 'null' then
    if jsonb_typeof(p_spec->'courseFeet') <> 'number' then
      raise exception 'Course distance is in feet, between 1 and 5280.' using errcode = 'P0001';
    end if;
    feet := (p_spec->>'courseFeet')::numeric;
    if feet < 1 or feet > 5280 then
      raise exception 'Course distance is in feet, between 1 and 5280.' using errcode = 'P0001';
    end if;
    if feet * 2 <> round(feet * 2) then
      raise exception 'Course distance is in half-foot steps (50 or 50.5).' using errcode = 'P0001';
    end if;
  end if;
  if p_spec ? 'allowed' and jsonb_typeof(p_spec->'allowed') <> 'null' then
    if jsonb_typeof(p_spec->'allowed') <> 'array' then raise exception 'Equipment rules must be a list.' using errcode = 'P0001'; end if;
    select coalesce(array_agg(lower(trim(x))), '{}') into allowed from jsonb_array_elements_text(p_spec->'allowed') x;
  end if;
  if p_spec ? 'notAllowed' and jsonb_typeof(p_spec->'notAllowed') <> 'null' then
    if jsonb_typeof(p_spec->'notAllowed') <> 'array' then raise exception 'Equipment rules must be a list.' using errcode = 'P0001'; end if;
    select coalesce(array_agg(lower(trim(x))), '{}') into not_allowed from jsonb_array_elements_text(p_spec->'notAllowed') x;
  end if;
  foreach r in array coalesce(allowed, '{}') || coalesce(not_allowed, '{}') loop
    if not (r = any(rules)) then
      raise exception 'Unknown equipment rule "%".', left(r, 40) using errcode = 'P0001';
    end if;
  end loop;
  if allowed is not null and not_allowed is not null and allowed && not_allowed then
    select x into r from unnest(allowed) x where x = any(not_allowed) limit 1;
    raise exception '% cannot be both allowed and not allowed.', initcap(r) using errcode = 'P0001';
  end if;
  url := nullif(trim(coalesce(p_spec->>'videoUrl', '')), '');
  if url is not null then
    if char_length(url) > 500 then
      raise exception 'Video link is limited to 500 characters.' using errcode = 'P0001';
    end if;
    if url !~* '^https?://[^[:space:]]+$' then
      raise exception 'Video link must start with http:// or https://.' using errcode = 'P0001';
    end if;
  end if;
  notes := coalesce(p_spec->>'notes', '');
  if char_length(trim(notes)) > 280 then
    raise exception 'Notes are limited to 280 characters.' using errcode = 'P0001';
  end if;
end $$;

create or replace function zt_events_check_spec() returns trigger language plpgsql as $$
begin
  if new.config is not null and new.config ? 'spec' then
    perform zt_check_event_spec(new.config->'spec');
  end if;
  return new;
end $$;
drop trigger if exists events_check_spec on events;
create trigger events_check_spec before insert or update of config on events
  for each row execute function zt_events_check_spec();
