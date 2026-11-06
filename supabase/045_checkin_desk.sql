-- 045_checkin_desk.sql (11/6, feature gaps #8 "weigh-in / check-in desk"): meet-morning bookkeeping for the roster.
--
-- The desk records, per athlete: checked in, bodyweight in kilograms as the scale reads it (no rounding on the way in;
-- Strongman Corporation weighs in kg), paper waiver signed (for walk-ups and anyone whose online waiver is missing),
-- membership card seen, a short note, and a reclass (move to another division, before any result exists). Divisions
-- gain an optional weight cap in kg so the desk can flag an athlete over class; combined classes weigh under the heavier
-- class, so the cap is whatever the promoter sets. Everything lives beside the roster, not in it: `meet_checkins` is a
-- side table keyed by (meet_id, athlete_id) and `divisions.weight_cap_kg` is a column the config save never writes, so
-- the meet-day phones and the builder's save path are untouched. Owner or member only, through the three RPCs below;
-- no direct table grants. zt_desk_athlete also mirrors a kg weigh-in into athletes.bodyweight (lb, one decimal) so the
-- existing displays and the federation export show the weighed value.
--
-- Verify after apply:
--   select proname from pg_proc where proname in ('zt_desk_state', 'zt_desk_athlete', 'zt_desk_division_cap');
--   select column_name from information_schema.columns where table_name = 'divisions' and column_name = 'weight_cap_kg';

alter table divisions add column if not exists weight_cap_kg numeric(6,2);
alter table divisions drop constraint if exists divisions_weight_cap_chk;
alter table divisions add constraint divisions_weight_cap_chk check (weight_cap_kg is null or (weight_cap_kg >= 20 and weight_cap_kg <= 300));

create table if not exists meet_checkins (
  meet_id uuid not null references meets(id) on delete cascade,
  athlete_id text not null,
  checked_in_at timestamptz,
  weighed_kg numeric(6,2) check (weighed_kg is null or (weighed_kg >= 20 and weighed_kg <= 300)),
  weighed_at timestamptz,
  paper_waiver_at timestamptz,
  card_verified_at timestamptz,
  note text check (note is null or char_length(note) <= 120),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (meet_id, athlete_id),
  foreign key (meet_id, athlete_id) references athletes(meet_id, id) on delete cascade
);
alter table meet_checkins enable row level security;
revoke all on meet_checkins from public, anon, authenticated;

create or replace function zt_desk_caller_ok(p_meet_id uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required for the check-in desk.' using errcode = 'P0001';
  end if;
  if not zt_is_owner_or_member(p_meet_id) then
    raise exception 'You do not have permission to run the desk for this meet.' using errcode = 'P0001';
  end if;
end $$;
revoke all on function zt_desk_caller_ok(uuid) from public, anon, authenticated;

-- ---------- read: caps + check-in rows ----------
create or replace function zt_desk_state(p_meet_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform zt_desk_caller_ok(p_meet_id);
  return jsonb_build_object(
    'caps', coalesce((select jsonb_agg(jsonb_build_object('division_id', d.id, 'weight_cap_kg', d.weight_cap_kg) order by d.sort_order)
                        from divisions d where d.meet_id = p_meet_id and d.weight_cap_kg is not null), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(row_to_json(c)::jsonb order by c.updated_at) from meet_checkins c where c.meet_id = p_meet_id), '[]'::jsonb)
  );
end $$;
revoke all on function zt_desk_state(uuid) from public, anon;
grant execute on function zt_desk_state(uuid) to authenticated;

-- ---------- write: one athlete ----------
-- p_patch keys (all optional): checked_in bool, weighed_kg numeric|null (null clears), paper_waiver bool,
-- card_verified bool, note text|null, division_id text (reclass). Returns the check-in row plus the athlete's division.
create or replace function zt_desk_athlete(p_meet_id uuid, p_athlete_id text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a athletes%rowtype; c meet_checkins%rowtype; v_kg numeric; v_div text; v_lot int; v_note text;
begin
  perform zt_desk_caller_ok(p_meet_id);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Nothing to change.' using errcode = 'P0001';
  end if;
  select * into a from athletes where meet_id = p_meet_id and id = p_athlete_id for update;
  if not found then
    raise exception 'That athlete is not on the roster any more. Reload the meet.' using errcode = 'P0001';
  end if;

  insert into meet_checkins (meet_id, athlete_id) values (p_meet_id, p_athlete_id) on conflict do nothing;
  select * into c from meet_checkins where meet_id = p_meet_id and athlete_id = p_athlete_id for update;

  if p_patch ? 'checked_in' then
    c.checked_in_at := case when coalesce((p_patch->>'checked_in')::boolean, false) then coalesce(c.checked_in_at, now()) else null end;
  end if;
  if p_patch ? 'paper_waiver' then
    c.paper_waiver_at := case when coalesce((p_patch->>'paper_waiver')::boolean, false) then coalesce(c.paper_waiver_at, now()) else null end;
  end if;
  if p_patch ? 'card_verified' then
    c.card_verified_at := case when coalesce((p_patch->>'card_verified')::boolean, false) then coalesce(c.card_verified_at, now()) else null end;
  end if;
  if p_patch ? 'note' then
    v_note := nullif(trim(coalesce(p_patch->>'note', '')), '');
    if v_note is not null and char_length(v_note) > 120 then
      raise exception 'Desk note is too long (120 characters max).' using errcode = 'P0001';
    end if;
    c.note := v_note;
  end if;
  if p_patch ? 'weighed_kg' then
    if jsonb_typeof(p_patch->'weighed_kg') = 'null' or trim(coalesce(p_patch->>'weighed_kg', '')) = '' then
      c.weighed_kg := null; c.weighed_at := null;
    else
      begin
        v_kg := round((p_patch->>'weighed_kg')::numeric, 2);
      exception when others then
        raise exception 'Bodyweight must be a number in kilograms (like 92.4).' using errcode = 'P0001';
      end;
      if v_kg < 20 or v_kg > 300 then
        raise exception 'Bodyweight % kg is outside 20 to 300. Check the scale reading.', v_kg using errcode = 'P0001';
      end if;
      c.weighed_kg := v_kg; c.weighed_at := now();
      update athletes set bodyweight = round(v_kg * 2.2046226218, 1) where meet_id = p_meet_id and id = p_athlete_id;
    end if;
  end if;

  if p_patch ? 'division_id' then
    v_div := nullif(trim(coalesce(p_patch->>'division_id', '')), '');
    if v_div is not null and v_div <> a.division_id then
      if not exists (select 1 from divisions d where d.meet_id = p_meet_id and d.id = v_div) then
        raise exception 'That division is not on this meet.' using errcode = 'P0001';
      end if;
      if exists (select 1 from results r where r.meet_id = p_meet_id and r.athlete_id = p_athlete_id) then
        raise exception 'This athlete already has a result; a reclass would orphan it. Clear the result on the scoring phone first.' using errcode = 'P0001';
      end if;
      select coalesce(max(lot_number), 0) + 1 into v_lot from athletes x where x.meet_id = p_meet_id and x.division_id = v_div;
      update athletes set division_id = v_div, lot_number = v_lot where meet_id = p_meet_id and id = p_athlete_id;
      update registrations set division_id = v_div, updated_at = now() where meet_id = p_meet_id and athlete_id = p_athlete_id;
    end if;
  end if;

  c.updated_at := now(); c.updated_by := auth.uid();
  update meet_checkins set checked_in_at = c.checked_in_at, weighed_kg = c.weighed_kg, weighed_at = c.weighed_at,
    paper_waiver_at = c.paper_waiver_at, card_verified_at = c.card_verified_at, note = c.note,
    updated_at = c.updated_at, updated_by = c.updated_by
   where meet_id = p_meet_id and athlete_id = p_athlete_id;
  update meets set updated_at = now() where id = p_meet_id;

  select * into a from athletes where meet_id = p_meet_id and id = p_athlete_id;
  return row_to_json(c)::jsonb || jsonb_build_object('division_id', a.division_id, 'bodyweight', a.bodyweight, 'lot_number', a.lot_number);
end $$;
revoke all on function zt_desk_athlete(uuid, text, jsonb) from public, anon;
grant execute on function zt_desk_athlete(uuid, text, jsonb) to authenticated;

-- ---------- write: a division's weight cap (kg; null clears) ----------
create or replace function zt_desk_division_cap(p_meet_id uuid, p_division_id text, p_cap_kg numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d divisions%rowtype;
begin
  perform zt_desk_caller_ok(p_meet_id);
  if p_cap_kg is not null and (p_cap_kg < 20 or p_cap_kg > 300) then
    raise exception 'Weight cap must be between 20 and 300 kg (leave it blank for no cap).' using errcode = 'P0001';
  end if;
  update divisions set weight_cap_kg = case when p_cap_kg is null then null else round(p_cap_kg, 2) end
   where meet_id = p_meet_id and id = p_division_id returning * into d;
  if not found then
    raise exception 'That division is not on this meet.' using errcode = 'P0001';
  end if;
  update meets set updated_at = now() where id = p_meet_id;
  return jsonb_build_object('division_id', d.id, 'weight_cap_kg', d.weight_cap_kg);
end $$;
revoke all on function zt_desk_division_cap(uuid, text, numeric) from public, anon;
grant execute on function zt_desk_division_cap(uuid, text, numeric) to authenticated;
