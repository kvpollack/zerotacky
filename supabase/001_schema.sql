-- ZeroTacky Phase 1 schema. Paste into the Supabase SQL editor and run once (safe to re-run).
-- Mirrors lib/types.ts. Child rows keep the client's text ids, scoped per meet: PK (meet_id, id).
-- Results keep the client id `${eventId}_${athleteId}`.

create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists meets (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  date date,
  owner_id uuid references auth.users(id) on delete set null,
  join_code text unique not null,
  admin_pin text not null default '1050',
  run_order_method text not null default 'reverse_overall',
  tiebreaker_rule text not null default 'event_wins',
  available_plates numeric[] not null default '{100,55,45,35,25,15,10,5,2.5}',
  collar_weight_per_pair numeric not null default 0,
  stations jsonb not null default '[{"id":"A","label":"Station 1"},{"id":"B","label":"Station 2"}]',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists meet_members (
  meet_id uuid references meets(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin')),
  primary key (meet_id, user_id)
);

create table if not exists divisions (
  id text not null,                    -- client-generated ids (sf-g1, div-m105, ...)
  meet_id uuid not null references meets(id) on delete cascade,
  name text not null,
  flight text not null default 'A',    -- station id
  sort_order int not null default 0,
  primary key (meet_id, id)
);

create table if not exists events (
  id text not null,
  meet_id uuid not null references meets(id) on delete cascade,
  event_number int not null,
  name text not null,
  scoring_type text not null check (scoring_type in ('reps','max_weight','time_or_distance','time_or_implements')),
  time_cap_seconds numeric not null default 60,
  lanes int not null default 1,
  loading_points int not null default 0,
  weight_entry_mode text not null default 'total',
  implement_empty_weight numeric not null default 0,
  config jsonb not null default '{}',  -- divisionWeights, divisionLightWeights, risingBarWeights, maxFormat,
                                       -- hasTrumpWeight, hasHeightCallout, heightLabel, divisionDefaultHeights,
                                       -- pitCrewCallout, fixedImplementDescription, groundTouchWarning,
                                       -- weightIsAddedPlatesOnly, implementCount
  primary key (meet_id, id)
);

create table if not exists athletes (
  id text not null,
  meet_id uuid not null references meets(id) on delete cascade,
  division_id text not null,
  name text not null,
  bodyweight numeric,
  lot_number int not null default 0,
  status text not null default 'active' check (status in ('active','withdrawn')),
  rack_heights jsonb not null default '{}',
  primary key (meet_id, id),
  foreign key (meet_id, division_id) references divisions(meet_id, id) on delete cascade
);

create table if not exists results (
  id text not null,                    -- `${event_id}_${athlete_id}`
  meet_id uuid not null references meets(id) on delete cascade,
  event_id text not null,
  athlete_id text not null,
  payload jsonb not null default '{}', -- the Result object minus ids
  locked boolean not null default false,
  updated_at timestamptz not null default now(),   -- client clock; last-writer-wins only
  updated_by text,                     -- device id
  server_at timestamptz not null default now(),    -- database clock; the pull watermark
  primary key (meet_id, id),
  foreign key (meet_id, event_id) references events(meet_id, id) on delete cascade,
  foreign key (meet_id, athlete_id) references athletes(meet_id, id) on delete cascade
);

create table if not exists live_state (
  meet_id uuid not null references meets(id) on delete cascade,
  station text not null,
  current_event_id text,
  current_division_id text,
  current_athlete_id text,
  lane2_athlete_id text,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (meet_id, station)
);

create index if not exists results_meet_server_at on results (meet_id, server_at);

-- ---------- last writer wins ----------
-- An offline phone flushing an old score must never overwrite a newer one. Skips the update
-- when the incoming updated_at is older than the stored one.
create or replace function zt_lww() returns trigger language plpgsql as $$
begin
  if new.updated_at < old.updated_at then return null; end if;
  return new;
end $$;
-- results also get a server-side write stamp (phones filter their pulls on it; client clocks drift)
create or replace function zt_results_stamp() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then return null; end if;
  new.server_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists results_lww on results;
drop trigger if exists results_stamp on results;
create trigger results_stamp before insert or update on results for each row execute function zt_results_stamp();
drop trigger if exists live_state_lww on live_state;
create trigger live_state_lww before update on live_state for each row execute function zt_lww();

-- ---------- join code helpers ----------
create or replace function gen_join_code() returns text language sql volatile as $$
  -- 6 chars, no 0/O/1/I
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random()*32)::int, 1), '')
  from generate_series(1,6);
$$;

alter table meets alter column join_code set default gen_join_code();

-- Device sessions: a judge/pit-crew phone trades a join code for a meet_id. The join code is
-- passed per request as a header (x-zt-join) and checked in RLS below; nothing is stored client
-- side except the code itself.
create or replace function zt_join_code() returns text language sql stable as $$
  select coalesce(current_setting('request.headers', true)::jsonb ->> 'x-zt-join', '');
$$;

create or replace function zt_has_join(m uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from meets where id = m and join_code = zt_join_code());
$$;

create or replace function zt_is_member(m uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from meet_members where meet_id = m and user_id = auth.uid());
$$;

-- Trade a join code for the full meet row (incl. join_code and admin_pin). The only way for the API to read
-- those two columns; see the column grants under RLS.
create or replace function zt_meet_by_join_code(p_code text) returns meets language sql stable security definer set search_path = public as $$
  select * from meets where join_code = upper(trim(p_code)) limit 1;
$$;
grant execute on function zt_meet_by_join_code(text) to anon, authenticated;

-- ---------- Phase 1 publishing (no accounts yet) ----------
-- The promoter/admin phone holds a publish key, entered once in Setup. Keys live in a table with
-- RLS on and no policies, so the API can never read them; only this security-definer RPC checks them.
-- Add a key in the SQL editor:  insert into publish_keys (key, label) values ('long-random-string', 'Kurt');
create table if not exists publish_keys (
  key text primary key,
  label text,
  created_at timestamptz not null default now()
);
alter table publish_keys enable row level security;
revoke all on publish_keys from anon, authenticated;

-- Full publish: meet row + divisions + events + athletes are authoritative (stale children removed);
-- results are merged last-writer-wins. Returns {id, join_code}.
create or replace function zt_publish_meet(
  p_key text, p_meet jsonb,
  p_divisions jsonb default '[]', p_events jsonb default '[]', p_athletes jsonb default '[]', p_results jsonb default '[]'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text; m meets%rowtype;
begin
  if p_key is null or not exists (select 1 from publish_keys where key = p_key) then
    raise exception 'invalid publish key' using errcode = '42501';
  end if;

  select * into m from jsonb_populate_record(null::meets, p_meet);
  -- same slug = same meet: a phone that left and re-publishes, or a second admin phone, updates in place
  v_id := coalesce((select id from meets where slug = m.slug), m.id, gen_random_uuid());

  insert into meets (id, slug, name, date, admin_pin, run_order_method, tiebreaker_rule,
                     available_plates, collar_weight_per_pair, stations, is_demo)
  values (v_id, m.slug, m.name, m.date, coalesce(m.admin_pin, '1050'),
          coalesce(m.run_order_method, 'reverse_overall'), coalesce(m.tiebreaker_rule, 'event_wins'),
          coalesce(m.available_plates, '{100,55,45,35,25,15,10,5,2.5}'), coalesce(m.collar_weight_per_pair, 0),
          coalesce(m.stations, '[{"id":"A","label":"Station 1"},{"id":"B","label":"Station 2"}]'), coalesce(m.is_demo, false))
  on conflict (id) do update set
    slug = excluded.slug, name = excluded.name, date = excluded.date, admin_pin = excluded.admin_pin,
    run_order_method = excluded.run_order_method, tiebreaker_rule = excluded.tiebreaker_rule,
    available_plates = excluded.available_plates, collar_weight_per_pair = excluded.collar_weight_per_pair,
    stations = excluded.stations, is_demo = excluded.is_demo, updated_at = now()
  returning id, join_code into v_id, v_code;

  insert into divisions (id, meet_id, name, flight, sort_order)
  select d.id, v_id, d.name, coalesce(d.flight, 'A'), coalesce(d.sort_order, 0)
  from jsonb_populate_recordset(null::divisions, p_divisions) d
  on conflict (meet_id, id) do update set name = excluded.name, flight = excluded.flight, sort_order = excluded.sort_order;

  insert into events (id, meet_id, event_number, name, scoring_type, time_cap_seconds, lanes, loading_points,
                      weight_entry_mode, implement_empty_weight, config)
  select e.id, v_id, e.event_number, e.name, e.scoring_type, coalesce(e.time_cap_seconds, 60), coalesce(e.lanes, 1),
         coalesce(e.loading_points, 0), coalesce(e.weight_entry_mode, 'total'), coalesce(e.implement_empty_weight, 0),
         coalesce(e.config, '{}')
  from jsonb_populate_recordset(null::events, p_events) e
  on conflict (meet_id, id) do update set
    event_number = excluded.event_number, name = excluded.name, scoring_type = excluded.scoring_type,
    time_cap_seconds = excluded.time_cap_seconds, lanes = excluded.lanes, loading_points = excluded.loading_points,
    weight_entry_mode = excluded.weight_entry_mode, implement_empty_weight = excluded.implement_empty_weight,
    config = excluded.config;

  insert into athletes (id, meet_id, division_id, name, bodyweight, lot_number, status, rack_heights)
  select a.id, v_id, a.division_id, a.name, a.bodyweight, coalesce(a.lot_number, 0), coalesce(a.status, 'active'),
         coalesce(a.rack_heights, '{}')
  from jsonb_populate_recordset(null::athletes, p_athletes) a
  on conflict (meet_id, id) do update set
    division_id = excluded.division_id, name = excluded.name, bodyweight = excluded.bodyweight,
    lot_number = excluded.lot_number, status = excluded.status, rack_heights = excluded.rack_heights;

  -- stale children (removed on the admin phone) go away; cascades clean results
  delete from athletes  where meet_id = v_id and id not in (select id from jsonb_populate_recordset(null::athletes,  p_athletes));
  delete from events    where meet_id = v_id and id not in (select id from jsonb_populate_recordset(null::events,    p_events));
  delete from divisions where meet_id = v_id and id not in (select id from jsonb_populate_recordset(null::divisions, p_divisions));

  insert into results (id, meet_id, event_id, athlete_id, payload, locked, updated_at, updated_by)
  select r.id, v_id, r.event_id, r.athlete_id, coalesce(r.payload, '{}'), coalesce(r.locked, false),
         coalesce(r.updated_at, now()), r.updated_by
  from jsonb_populate_recordset(null::results, p_results) r
  on conflict (meet_id, id) do update set
    payload = excluded.payload, locked = excluded.locked, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
    -- results_stamp trigger drops the update when excluded.updated_at is older, else sets server_at

  return jsonb_build_object('id', v_id, 'join_code', v_code);
end $$;
grant execute on function zt_publish_meet(text, jsonb, jsonb, jsonb, jsonb, jsonb) to anon, authenticated;

-- ---------- RLS ----------
alter table meets enable row level security;
alter table meet_members enable row level security;
alter table divisions enable row level security;
alter table events enable row level security;
alter table athletes enable row level security;
alter table results enable row level security;
alter table live_state enable row level security;

-- meets: anyone can read the public columns (spectator by slug); join_code and admin_pin are reachable only
-- through zt_meet_by_join_code / zt_publish_meet. Members update; authed users create (Phase 2).
revoke select on meets from anon, authenticated;
grant select (id, slug, name, date, run_order_method, tiebreaker_rule, available_plates, collar_weight_per_pair,
              stations, is_demo, created_at, updated_at) on meets to anon, authenticated;
drop policy if exists meets_read on meets;
create policy meets_read on meets for select using (true);
drop policy if exists meets_insert on meets;
create policy meets_insert on meets for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists meets_update on meets;
create policy meets_update on meets for update using (zt_is_member(id));

drop policy if exists members_read on meet_members;
create policy members_read on meet_members for select using (user_id = auth.uid() or zt_is_member(meet_id));
drop policy if exists members_write on meet_members;
create policy members_write on meet_members for all using (zt_is_member(meet_id)) with check (zt_is_member(meet_id));

-- roster/events: public read, member write (Phase 1 admin writes go through zt_publish_meet)
do $$ declare t text; begin
  foreach t in array array['divisions','events','athletes'] loop
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format('create policy %1$s_read on %1$s for select using (true)', t);
    execute format('drop policy if exists %1$s_write on %1$s', t);
    execute format('create policy %1$s_write on %1$s for all using (zt_is_member(meet_id)) with check (zt_is_member(meet_id))', t);
  end loop;
end $$;

-- athletes also writable by join-code devices (walk-ons, scratch, rack pins from the floor)
drop policy if exists athletes_join_write on athletes;
create policy athletes_join_write on athletes for all using (zt_has_join(meet_id)) with check (zt_has_join(meet_id));

-- results + live_state: public read; member or join-code write
do $$ declare t text; begin
  foreach t in array array['results','live_state'] loop
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format('create policy %1$s_read on %1$s for select using (true)', t);
    execute format('drop policy if exists %1$s_write on %1$s', t);
    execute format('create policy %1$s_write on %1$s for all using (zt_is_member(meet_id) or zt_has_join(meet_id)) with check (zt_is_member(meet_id) or zt_has_join(meet_id))', t);
  end loop;
end $$;

-- ---------- auto-add owner as member (Phase 2) ----------
create or replace function meets_add_owner() returns trigger language plpgsql security definer as $$
begin
  if new.owner_id is not null then
    insert into meet_members (meet_id, user_id, role) values (new.id, new.owner_id, 'owner')
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists meets_add_owner_t on meets;
create trigger meets_add_owner_t after insert on meets for each row execute function meets_add_owner();

-- ---------- realtime (optional; the app polls, this just enables websockets later) ----------
do $$ declare t text; begin
  foreach t in array array['results','live_state','athletes'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
