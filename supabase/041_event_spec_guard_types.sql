-- 041: zt_check_event_spec with strict field types (Astra recheck 11/5, BR-05 residual). 040 coerced values through
-- text: a JSON null inside a rule list became SQL NULL, `r = any(rules)` was NULL rather than false, and the spec saved,
-- then crashed the public show page. Now every field must be the type the EventSpec carries: text fields are JSON
-- strings, courseFeet is a JSON number, rule lists are arrays of JSON strings that name a known rule, and the video link
-- needs a real host after the scheme. Same messages as lib/events/spec.ts. The trigger from 040 is unchanged. Safe to re-run.
create or replace function zt_check_event_spec(p_spec jsonb) returns void
language plpgsql immutable as $$
declare
  k text; v jsonb; impl text; note text; feet numeric; url text; notes text;
  allowed text[] := '{}'; not_allowed text[] := '{}'; r text;
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
    if jsonb_typeof(v) = 'null' then continue; end if;
    if k in ('implement','implementNote','videoUrl','notes') and jsonb_typeof(v) <> 'string' then
      raise exception 'Event spec fields must be text.' using errcode = 'P0001';
    end if;
    if k = 'courseFeet' and jsonb_typeof(v) <> 'number' then
      raise exception 'Course distance is in feet, between 1 and 5280.' using errcode = 'P0001';
    end if;
    if k in ('allowed','notAllowed') then
      if jsonb_typeof(v) <> 'array' then
        raise exception 'Equipment rules must be a list of rule names.' using errcode = 'P0001';
      end if;
      if exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string') then
        raise exception 'Equipment rules must be a list of rule names.' using errcode = 'P0001';
      end if;
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
  if jsonb_typeof(p_spec->'courseFeet') = 'number' then
    feet := (p_spec->>'courseFeet')::numeric;
    if feet < 1 or feet > 5280 then
      raise exception 'Course distance is in feet, between 1 and 5280.' using errcode = 'P0001';
    end if;
    if feet * 2 <> round(feet * 2) then
      raise exception 'Course distance is in half-foot steps (50 or 50.5).' using errcode = 'P0001';
    end if;
  end if;
  if jsonb_typeof(p_spec->'allowed') = 'array' then
    select coalesce(array_agg(lower(trim(x))), '{}') into allowed from jsonb_array_elements_text(p_spec->'allowed') x;
  end if;
  if jsonb_typeof(p_spec->'notAllowed') = 'array' then
    select coalesce(array_agg(lower(trim(x))), '{}') into not_allowed from jsonb_array_elements_text(p_spec->'notAllowed') x;
  end if;
  foreach r in array allowed || not_allowed loop
    if r is null or not (r = any(rules)) then
      raise exception 'Unknown equipment rule "%".', left(coalesce(r, 'null'), 40) using errcode = 'P0001';
    end if;
  end loop;
  if allowed && not_allowed then
    select x into r from unnest(allowed) x where x = any(not_allowed) limit 1;
    raise exception '% cannot be both allowed and not allowed.', initcap(r) using errcode = 'P0001';
  end if;
  url := nullif(trim(coalesce(p_spec->>'videoUrl', '')), '');
  if url is not null then
    if char_length(url) > 500 then
      raise exception 'Video link is limited to 500 characters.' using errcode = 'P0001';
    end if;
    -- scheme, then a host of hostname characters (a bracketed IPv6 literal is not accepted; the client parser's edge cases
    -- like "https://[" are refused here too), optional port, optional path/query/fragment, no whitespace anywhere
    if url !~* '^https?://[a-z0-9]([a-z0-9._-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then
      raise exception 'Video link must start with http:// or https://.' using errcode = 'P0001';
    end if;
  end if;
  notes := coalesce(p_spec->>'notes', '');
  if char_length(trim(notes)) > 280 then
    raise exception 'Notes are limited to 280 characters.' using errcode = 'P0001';
  end if;
end $$;
