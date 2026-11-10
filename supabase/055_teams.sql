-- 055_teams.sql (11/10): team divisions (Kurt's newcomer strategy; the Catalina Strongman Mixer model). A division can
-- be a team of N (divisions.team_size, 1 = individual). Each teammate registers and pays separately, then the team forms
-- after registration: start one (name + 6-character join code + share link), join one by code, or opt into "find me a
-- partner" and team up with another opted-in solo athlete in the same division. A team competes as ONE roster row (name
-- = the team name, one lot number, one score sheet), so the scorer, boards, exports and results are unchanged; every
-- member's registration points at that shared athletes row.
--
-- 1. divisions.team_size (1..6). teams table: meet, division, name, join_code, captain, the shared athletes row.
--    registrations.team_id, registrations.looking_for_partner. Column grants widened for the athlete's own row.
-- 2. zt_team_create / zt_team_join / zt_team_leave / zt_team_rename / zt_set_partner_flag / zt_team_up /
--    zt_my_registration (the athlete's own entry + team + partner board for the /register page).
-- 3. zt_submit_registration_body (034 body) takes teamCode + lookingForPartner; auto-accept shares the team row.
--    zt_set_registration_status (007 body): accept reuses the team row; decline / withdraw of one member keeps the row
--    while another active member remains. zt_list_meet_registrations (009 body) adds team_id, team_name,
--    looking_for_partner. zt_publish_meet / zt_save_meet_config (054 bodies) carry team_size (the phone keeps the
--    server's value when its payload has none, same rule as weight_cap_kg).
-- Verify (staging, then prod with Kurt's go):
--   select count(*) from pg_proc where proname in ('zt_team_create','zt_team_join','zt_team_leave','zt_team_rename','zt_set_partner_flag','zt_team_up','zt_my_registration','zt_team_attach');  -- 8
--   select column_name from information_schema.columns where table_name='registrations' and column_name in ('team_id','looking_for_partner');

alter table divisions add column if not exists team_size int not null default 1;
alter table divisions drop constraint if exists divisions_team_size_chk;
alter table divisions add constraint divisions_team_size_chk check (team_size between 1 and 6);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  meet_id uuid not null references meets(id) on delete cascade,
  division_id text not null,
  name text not null,
  join_code text not null,
  captain_user_id uuid null references auth.users(id) on delete set null,
  athlete_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_division_fk foreign key (meet_id, division_id) references divisions(meet_id, id) on delete cascade,
  constraint teams_athlete_fk foreign key (meet_id, athlete_id) references athletes(meet_id, id) on delete set null,
  constraint teams_code_unique unique (meet_id, join_code),
  constraint teams_name_len check (char_length(name) between 2 and 60)
);
create index if not exists teams_meet_division_idx on teams (meet_id, division_id);
drop trigger if exists teams_touch on teams;
create trigger teams_touch before update on teams for each row execute function profiles_touch();
alter table teams enable row level security;

alter table registrations add column if not exists team_id uuid null references teams(id) on delete set null;
alter table registrations add column if not exists looking_for_partner boolean not null default false;
create index if not exists registrations_team_idx on registrations (team_id) where team_id is not null;
grant select (team_id, looking_for_partner) on registrations to authenticated;

revoke all on teams from public, anon, authenticated;
-- members of the meet staff read everything; an athlete reads the team they are on. Writes: RPCs only.
drop policy if exists teams_read on teams;
create policy teams_read on teams for select to authenticated
  using (zt_is_owner_or_member(meet_id) or exists (select 1 from registrations r where r.team_id = teams.id and r.user_id = auth.uid()));
grant select on teams to authenticated;

-- ---------- helpers ----------
create or replace function zt_team_code() returns text language sql volatile as $$
  -- 6 characters, no 0/O/1/I; ~1e9 combinations per meet
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6)
$$;

-- active members hold a spot: pending, waitlist or accepted
create or replace function zt_team_active_count(p_team_id uuid) returns int language sql stable as $$
  select count(*)::int from registrations r where r.team_id = p_team_id and r.status not in ('withdrawn', 'declined')
$$;

create or replace function zt_team_size_of(p_meet_id uuid, p_division_id text) returns int language sql stable as $$
  select coalesce((select d.team_size from divisions d where d.meet_id = p_meet_id and d.id = p_division_id), 1)
$$;

-- "Pat M." for the partner board; full names for teammates and the promoter
create or replace function zt_short_name(p_name text) returns text language sql immutable as $$
  select case when array_length(parts, 1) >= 2 then parts[1] || ' ' || left(parts[array_length(parts, 1)], 1) || '.' else parts[1] end
  from (select regexp_split_to_array(trim(p_name), '\s+') as parts) s
$$;

-- p_full: the caller is on the team or runs the meet (join code + full names); otherwise short names, no code
create or replace function zt_team_json(t teams, p_full boolean) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'meetId', t.meet_id, 'divisionId', t.division_id, 'name', t.name,
    'joinCode', case when p_full then t.join_code else null end,
    'captainUserId', case when p_full then t.captain_user_id else null end,
    'athleteId', t.athlete_id,
    'teamSize', zt_team_size_of(t.meet_id, t.division_id),
    'activeCount', zt_team_active_count(t.id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'registrationId', r.id,
        'name', case when p_full then r.name else zt_short_name(r.name) end,
        'status', case when r.status = 'waitlist' then 'pending' else r.status end,
        'isCaptain', (r.user_id is not null and r.user_id = t.captain_user_id)
      ) order by r.created_at)
      from registrations r where r.team_id = t.id and r.status not in ('withdrawn', 'declined')), '[]'::jsonb)
  )
$$;

-- Put one registration on a team's shared roster row. Called with the meet row locked. Rules:
--  * registration not accepted: nothing to do on the roster.
--  * accepted, team has no row yet: the registration's own row becomes the team's row (renamed, bodyweight cleared).
--  * accepted, team has a row: the registration's own row is dropped (refused when it holds results) and the
--    registration points at the team's row.
create or replace function zt_team_attach(p_reg_id uuid, p_team_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare r registrations%rowtype; t teams%rowtype; v_has_results boolean;
begin
  select * into r from registrations where id = p_reg_id for update;
  select * into t from teams where id = p_team_id for update;
  update registrations set team_id = t.id, updated_at = now() where id = r.id;
  if r.status <> 'accepted' then return; end if;
  if t.athlete_id is null or not exists (select 1 from athletes a where a.meet_id = t.meet_id and a.id = t.athlete_id) then
    if r.athlete_id is not null and exists (select 1 from athletes a where a.meet_id = r.meet_id and a.id = r.athlete_id) then
      update athletes set name = t.name, bodyweight = null where meet_id = r.meet_id and id = r.athlete_id;
      update teams set athlete_id = r.athlete_id where id = t.id;
    end if;
    return;
  end if;
  if r.athlete_id is not null and r.athlete_id <> t.athlete_id then
    select exists (select 1 from results x where x.meet_id = r.meet_id and x.athlete_id = r.athlete_id) into v_has_results;
    if v_has_results then
      raise exception '% already has recorded results as an individual, so they cannot be moved onto a team. Ask the promoter.', r.name using errcode = 'P0001';
    end if;
    update registrations set athlete_id = null where id = r.id;
    delete from athletes where meet_id = r.meet_id and id = r.athlete_id;
  end if;
  update registrations set athlete_id = t.athlete_id, updated_at = now() where id = r.id;
  update meets set updated_at = now() where id = r.meet_id;
end $$;
revoke all on function zt_team_attach(uuid, uuid) from public, anon, authenticated;

-- the caller's own, live registration, in a team division
create or replace function zt_team_my_reg(p_reg_id uuid) returns registrations language plpgsql stable security definer set search_path = public as $$
declare r registrations%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  select * into r from registrations where id = p_reg_id;
  if r.id is null or r.user_id is distinct from auth.uid() then raise exception 'That registration is not yours.' using errcode = 'P0001'; end if;
  if r.status in ('withdrawn', 'declined') then raise exception 'That registration is no longer active.' using errcode = 'P0001'; end if;
  if zt_team_size_of(r.meet_id, r.division_id) < 2 then raise exception 'That division is for individual athletes.' using errcode = 'P0001'; end if;
  return r;
end $$;
revoke all on function zt_team_my_reg(uuid) from public, anon, authenticated;

create or replace function zt_team_check_name(p_name text) returns text language plpgsql immutable as $$
declare v text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(v) < 2 then raise exception 'Give the team a name (2 to 60 characters).' using errcode = 'P0001'; end if;
  if char_length(v) > 60 then raise exception 'Team name is too long (60 characters max).' using errcode = 'P0001'; end if;
  return v;
end $$;

-- ---------- athlete RPCs ----------
create or replace function zt_team_create(p_registration_id uuid, p_name text) returns jsonb language plpgsql security definer set search_path = public as $$
declare r registrations%rowtype; t teams%rowtype; v_name text; v_code text; v_tries int := 0;
begin
  r := zt_team_my_reg(p_registration_id);
  perform 1 from meets where id = r.meet_id for update;
  if r.team_id is not null then raise exception 'You are already on a team in this division. Leave it first.' using errcode = 'P0001'; end if;
  v_name := zt_team_check_name(p_name);
  if exists (select 1 from teams x where x.meet_id = r.meet_id and x.division_id = r.division_id and lower(x.name) = lower(v_name)) then
    raise exception 'A team called "%" is already in this division. Pick another name.', v_name using errcode = 'P0001';
  end if;
  loop
    v_code := zt_team_code(); v_tries := v_tries + 1;
    exit when not exists (select 1 from teams x where x.meet_id = r.meet_id and x.join_code = v_code) or v_tries > 20;
  end loop;
  insert into teams (meet_id, division_id, name, join_code, captain_user_id) values (r.meet_id, r.division_id, v_name, v_code, auth.uid()) returning * into t;
  perform zt_team_attach(r.id, t.id);
  select * into t from teams where id = t.id;
  return zt_team_json(t, true);
end $$;
revoke all on function zt_team_create(uuid, text) from public, anon;
grant execute on function zt_team_create(uuid, text) to authenticated;

create or replace function zt_team_join(p_registration_id uuid, p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare r registrations%rowtype; t teams%rowtype; v_code text;
begin
  r := zt_team_my_reg(p_registration_id);
  perform 1 from meets where id = r.meet_id for update;
  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if r.team_id is not null then raise exception 'You are already on a team in this division. Leave it first.' using errcode = 'P0001'; end if;
  select * into t from teams where meet_id = r.meet_id and join_code = v_code for update;
  if t.id is null then raise exception 'No team has the code %. Check it with your teammate.', coalesce(nullif(v_code, ''), '(blank)') using errcode = 'P0001'; end if;
  if t.division_id <> r.division_id then
    raise exception 'That team is in %, and your entry is in %. Teammates register in the same division.',
      (select name from divisions where meet_id = t.meet_id and id = t.division_id), (select name from divisions where meet_id = r.meet_id and id = r.division_id) using errcode = 'P0001';
  end if;
  if zt_team_active_count(t.id) >= zt_team_size_of(t.meet_id, t.division_id) then
    raise exception '% is full (% of %).', t.name, zt_team_active_count(t.id), zt_team_size_of(t.meet_id, t.division_id) using errcode = 'P0001';
  end if;
  perform zt_team_attach(r.id, t.id);
  select * into t from teams where id = t.id;
  return zt_team_json(t, true);
end $$;
revoke all on function zt_team_join(uuid, text) from public, anon;
grant execute on function zt_team_join(uuid, text) to authenticated;

-- Leaving is for entries that are not on the roster yet; an accepted teammate asks the promoter (the shared row
-- may hold results, and the lot order is set).
create or replace function zt_team_leave(p_registration_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare r registrations%rowtype; t teams%rowtype;
begin
  r := zt_team_my_reg(p_registration_id);
  perform 1 from meets where id = r.meet_id for update;
  if r.team_id is null then return jsonb_build_object('left', false); end if;
  if r.status = 'accepted' then raise exception 'Your entry is already on the roster with this team. Ask the promoter to move you.' using errcode = 'P0001'; end if;
  select * into t from teams where id = r.team_id for update;
  update registrations set team_id = null, updated_at = now() where id = r.id;
  if zt_team_active_count(t.id) = 0 then
    if t.athlete_id is null then delete from teams where id = t.id; end if;
  elsif t.captain_user_id = auth.uid() then
    update teams set captain_user_id = (select x.user_id from registrations x where x.team_id = t.id and x.status not in ('withdrawn', 'declined') and x.user_id is not null order by x.created_at limit 1) where id = t.id;
  end if;
  return jsonb_build_object('left', true);
end $$;
revoke all on function zt_team_leave(uuid) from public, anon;
grant execute on function zt_team_leave(uuid) to authenticated;

-- captain or meet staff; renames the roster row too
create or replace function zt_team_rename(p_team_id uuid, p_name text) returns jsonb language plpgsql security definer set search_path = public as $$
declare t teams%rowtype; v_name text;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  select * into t from teams where id = p_team_id for update;
  if t.id is null then raise exception 'No such team.' using errcode = 'P0001'; end if;
  if not (t.captain_user_id = auth.uid() or zt_is_owner_or_member(t.meet_id)) then raise exception 'Only the team captain or the promoter can rename a team.' using errcode = 'P0001'; end if;
  v_name := zt_team_check_name(p_name);
  if exists (select 1 from teams x where x.meet_id = t.meet_id and x.division_id = t.division_id and x.id <> t.id and lower(x.name) = lower(v_name)) then
    raise exception 'A team called "%" is already in this division.', v_name using errcode = 'P0001';
  end if;
  update teams set name = v_name where id = t.id;
  if t.athlete_id is not null then update athletes set name = v_name where meet_id = t.meet_id and id = t.athlete_id; update meets set updated_at = now() where id = t.meet_id; end if;
  select * into t from teams where id = t.id;
  return zt_team_json(t, true);
end $$;
revoke all on function zt_team_rename(uuid, text) from public, anon;
grant execute on function zt_team_rename(uuid, text) to authenticated;

create or replace function zt_set_partner_flag(p_registration_id uuid, p_flag boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare r registrations%rowtype;
begin
  r := zt_team_my_reg(p_registration_id);
  update registrations set looking_for_partner = coalesce(p_flag, false), updated_at = now() where id = r.id;
  return jsonb_build_object('lookingForPartner', coalesce(p_flag, false));
end $$;
revoke all on function zt_set_partner_flag(uuid, boolean) from public, anon;
grant execute on function zt_set_partner_flag(uuid, boolean) to authenticated;

-- Two opted-in athletes in the same division team up without a code. Opting in is the consent: anyone on the board
-- may team up with you. Priority: my team with space, else theirs with space, else a new team named after both.
create or replace function zt_team_up(p_registration_id uuid, p_other_registration_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare r registrations%rowtype; o registrations%rowtype; t teams%rowtype; v_size int; v_code text; v_tries int := 0; v_name text;
begin
  r := zt_team_my_reg(p_registration_id);
  perform 1 from meets where id = r.meet_id for update;
  select * into o from registrations where id = p_other_registration_id for update;
  if o.id is null or o.meet_id <> r.meet_id or o.division_id <> r.division_id or o.status in ('withdrawn', 'declined') then
    raise exception 'That athlete is not on the partner board for your division any more.' using errcode = 'P0001';
  end if;
  if o.id = r.id then raise exception 'That is your own entry.' using errcode = 'P0001'; end if;
  if not r.looking_for_partner then raise exception 'Turn on "Find me a partner" on your own entry first.' using errcode = 'P0001'; end if;
  if not o.looking_for_partner then raise exception '% is not looking for a partner any more.', zt_short_name(o.name) using errcode = 'P0001'; end if;
  v_size := zt_team_size_of(r.meet_id, r.division_id);
  if r.team_id is not null and o.team_id is not null then
    raise exception 'You are both already on teams. One of you leaves theirs first.' using errcode = 'P0001';
  end if;
  if r.team_id is not null then
    select * into t from teams where id = r.team_id for update;
    if zt_team_active_count(t.id) >= v_size then raise exception 'Your team is already full.' using errcode = 'P0001'; end if;
    perform zt_team_attach(o.id, t.id);
  elsif o.team_id is not null then
    select * into t from teams where id = o.team_id for update;
    if zt_team_active_count(t.id) >= v_size then raise exception '% is already on a full team.', zt_short_name(o.name) using errcode = 'P0001'; end if;
    perform zt_team_attach(r.id, t.id);
  else
    v_name := left(split_part(trim(r.name), ' ', 1) || ' & ' || split_part(trim(o.name), ' ', 1), 60);
    if exists (select 1 from teams x where x.meet_id = r.meet_id and x.division_id = r.division_id and lower(x.name) = lower(v_name)) then
      v_name := left(v_name, 50) || ' ' || to_char(now(), 'HH24MI');
    end if;
    loop
      v_code := zt_team_code(); v_tries := v_tries + 1;
      exit when not exists (select 1 from teams x where x.meet_id = r.meet_id and x.join_code = v_code) or v_tries > 20;
    end loop;
    insert into teams (meet_id, division_id, name, join_code, captain_user_id) values (r.meet_id, r.division_id, v_name, v_code, auth.uid()) returning * into t;
    perform zt_team_attach(r.id, t.id);
    perform zt_team_attach(o.id, t.id);
  end if;
  select * into t from teams where id = t.id;
  return zt_team_json(t, true);
end $$;
revoke all on function zt_team_up(uuid, uuid) from public, anon;
grant execute on function zt_team_up(uuid, uuid) to authenticated;

-- The athlete's own live entry for a meet (the /register page on a return visit and right after submitting), with the
-- team they are on and the partner board for their division. Null when they have no live entry.
create or replace function zt_my_registration(p_slug text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m meets%rowtype; r registrations%rowtype; t teams%rowtype; v_size int; v_board jsonb;
begin
  if auth.uid() is null then return null; end if;
  select * into m from meets where lower(slug) = lower(trim(coalesce(p_slug, ''))) and is_demo = false limit 1;
  if m.id is null then return null; end if;
  -- the team-division entry wins when the athlete also holds an individual entry in the same show; newest otherwise
  select * into r from registrations where meet_id = m.id and user_id = auth.uid() and status not in ('withdrawn', 'declined')
    order by (zt_team_size_of(m.id, division_id) > 1) desc, created_at desc limit 1;
  if r.id is null then return null; end if;
  v_size := zt_team_size_of(m.id, r.division_id);
  if r.team_id is not null then select * into t from teams where id = r.team_id; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'registrationId', x.id,
      'name', zt_short_name(x.name),
      'teamName', tt.name,
      'spotsOpen', case when tt.id is null then v_size - 1 else v_size - zt_team_active_count(tt.id) end
    ) order by x.created_at), '[]'::jsonb)
  into v_board
  from registrations x left join teams tt on tt.id = x.team_id
  where x.meet_id = m.id and x.division_id = r.division_id and x.id <> r.id
    and x.status not in ('withdrawn', 'declined') and x.looking_for_partner
    and (tt.id is null or zt_team_active_count(tt.id) < v_size);
  return jsonb_build_object(
    'registrationId', r.id,
    'status', case when r.status = 'waitlist' then 'pending' else r.status end,
    'waitlisted', (r.waitlisted or r.status = 'waitlist'),
    'divisionId', r.division_id,
    'divisionName', (select name from divisions where meet_id = m.id and id = r.division_id),
    'teamSize', v_size,
    'lookingForPartner', r.looking_for_partner,
    'team', case when t.id is null then null else zt_team_json(t, true) end,
    'board', case when v_size > 1 then v_board else '[]'::jsonb end
  );
end $$;
revoke all on function zt_my_registration(text) from public, anon;
grant execute on function zt_my_registration(text) to authenticated;

-- ---------- zt_submit_registration_body: 034 body + teamCode / lookingForPartner + shared team row on auto-accept ----------
create or replace function zt_submit_registration_body(p_slug text, p_input jsonb)
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
  v_dob_text text;
  v_dob date;
  v_age_years int;
  v_guardian jsonb;
  v_g_name text;
  v_g_contact text;
  v_ath_id text;
  v_next_lot int;
  v_team teams%rowtype;
  v_team_code text;
  v_team_size int;
  v_partner boolean;
begin
  v_ip := zt_client_ip();
  if v_ip <> '' then perform zt_rate_check('submit:ip:' || v_ip, 10, interval '10 minutes'); end if;

  v_clean_slug := lower(trim(coalesce(p_slug, p_input->>'slug', '')));
  if char_length(v_clean_slug) > 120 then
    raise exception 'No competition found at "%".', left(coalesce(p_slug, ''), 40) using errcode = 'P0001';
  end if;
  select * into m from meets where lower(slug) = v_clean_slug and is_demo = false for update;
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

  -- 009: date of birth, judged on the meet date (today when the meet has none). Under 12 refused (Strongman Corp
  -- minimum); under 18 registered by a parent or legal guardian (legal/WAIVER.md section 7) who signs at check-in.
  -- Messages match lib/promoter/rules.ts validateAthleteAge. All three columns are owner-only.
  v_dob_text := trim(coalesce(p_input->>'dateOfBirth', ''));
  if v_dob_text !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Enter the athlete date of birth.' using errcode = 'P0001';
  end if;
  begin
    v_dob := v_dob_text::date;
  exception when others then
    raise exception 'Enter the athlete date of birth.' using errcode = 'P0001';
  end;
  if v_dob > current_date then
    raise exception 'Date of birth cannot be in the future.' using errcode = 'P0001';
  end if;
  v_age_years := extract(year from age(coalesce(m.date, current_date)::timestamp, v_dob::timestamp))::int;
  if v_age_years > 100 then
    raise exception 'Check the date of birth.' using errcode = 'P0001';
  end if;
  if v_age_years < 12 then
    raise exception 'Athletes must be at least 12 on competition day. Contact the promoter about younger athletes.' using errcode = 'P0001';
  end if;
  if v_age_years < 18 then
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

  -- 055: team divisions. teamCode joins an existing team at submit (same division, space left); lookingForPartner
  -- puts the athlete on the division's partner board. Both are ignored for individual divisions.
  v_team_size := zt_team_size_of(m.id, v_div_id);
  v_team_code := upper(regexp_replace(coalesce(p_input->>'teamCode', ''), '[^A-Za-z0-9]', '', 'g'));
  v_partner := false;
  if v_team_size > 1 then
    v_partner := coalesce((p_input->>'lookingForPartner')::boolean, false);
    if v_team_code <> '' then
      select * into v_team from teams t where t.meet_id = m.id and t.join_code = v_team_code for update;
      if v_team.id is null then
        raise exception 'No team has the code %. Check it with your teammate, or leave it blank and join after registering.', v_team_code using errcode = 'P0001';
      end if;
      if v_team.division_id <> v_div_id then
        raise exception 'That team is in %. Teammates register in the same division.', (select name from divisions where meet_id = m.id and id = v_team.division_id) using errcode = 'P0001';
      end if;
      if zt_team_active_count(v_team.id) >= v_team_size then
        raise exception '% is full (% of %).', v_team.name, zt_team_active_count(v_team.id), v_team_size using errcode = 'P0001';
      end if;
    end if;
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
    -- 034 (Astra AA-01, Kurt 10/29): an open meet at its cap takes the entry onto the waitlist instead of refusing it.
    -- Under the meet lock, so two late entries racing for the last seat get one pending (or accepted) and one waitlist.
    if m.athlete_cap is not null and v_accepted_count >= m.athlete_cap then
      v_outcome := 'waitlist';
      v_waitlisted := true;
    else
      v_outcome := 'pending';
      v_waitlisted := false;
    end if;
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
      emergency_contact, status, waitlisted, paid, waiver_accepted_at, waiver_version,
      date_of_birth, guardian_name, guardian_contact, team_id, looking_for_partner
    )
    values (
      m.id, auth.uid(), null, v_div_id, v_name, v_email, v_bodyweight,
      v_emergency, 'pending', v_waitlisted, false, now(), v_waiver_version,
      v_dob, v_g_name, v_g_contact, v_team.id, v_partner
    )
    returning id into v_reg_id;
  exception when unique_violation then
    -- two submissions raced past the select above; the partial unique index settles it
    raise exception 'An active or pending registration already exists for this email in the selected division.'
      using errcode = 'P0001';
  end;

  -- 032: accept on the spot when the promoter asked for it. Same steps as zt_set_registration_status 'accepted':
  -- roster row with the next lot number in the division, then the registration points at it (023's trigger links the
  -- account). The cap was checked above under the row lock, so this cannot overfill the roster.
  if v_outcome = 'pending' and m.auto_accept then
    -- 055: a teammate joining a team that already holds a roster row shares it (no new athlete, no cap use)
    if v_team.id is not null and v_team.athlete_id is not null
       and exists (select 1 from athletes a where a.meet_id = m.id and a.id = v_team.athlete_id) then
      v_ath_id := v_team.athlete_id;
    else
      v_ath_id := case when v_team.id is not null then 'team-' || left(v_team.id::text, 8) else 'reg-ath-' || left(v_reg_id::text, 8) end;
      select coalesce(max(lot_number), 0) + 1 into v_next_lot
        from athletes a where a.meet_id = m.id and a.division_id = v_div_id;
      insert into athletes (id, meet_id, division_id, name, bodyweight, lot_number, status, rack_heights)
      values (v_ath_id, m.id, v_div_id, case when v_team.id is not null then v_team.name else v_name end,
              case when v_team.id is not null then null else v_bodyweight end, v_next_lot, 'active', '{}'::jsonb);
      if v_team.id is not null then update teams set athlete_id = v_ath_id where id = v_team.id; end if;
    end if;
    update registrations set status = 'accepted', athlete_id = v_ath_id, updated_at = now() where id = v_reg_id;
    update meets set updated_at = now() where id = m.id;
    v_outcome := 'accepted';
  end if;

  return jsonb_build_object('id', v_reg_id, 'status', v_outcome);
end $$;

-- ---------- zt_set_registration_status: 007 body + shared team row ----------
create or replace function zt_set_registration_status(p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  r registrations%rowtype;
  m meets%rowtype;
  v_ath_id text;
  v_next_lot int;
  v_event_names text;
  v_verb text;
  t teams%rowtype;
  v_others int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sign in required to update registration status.' using errcode = 'P0001';
  end if;

  if p_status not in ('pending', 'accepted', 'declined', 'withdrawn') then
    raise exception 'Invalid registration status "%".', coalesce(p_status, '') using errcode = 'P0001';
  end if;

  select * into r from registrations where id = p_id for update;
  if not found then
    raise exception 'No registration found with id "%".', p_id using errcode = 'P0001';
  end if;

  select * into m from meets where id = r.meet_id for update;
  if not found then
    raise exception 'Associated meet no longer exists.' using errcode = 'P0001';
  end if;

  if not zt_is_owner_or_member(r.meet_id) then
    raise exception 'You do not have permission to update registrations for this meet.' using errcode = 'P0001';
  end if;

  if r.status = p_status then
    return row_to_json(r)::jsonb;
  end if;

  if p_status = 'accepted' then
    if not exists (select 1 from divisions d where d.meet_id = r.meet_id and d.id = r.division_id) then
      raise exception '% registered for a division that no longer exists on %. Decline the request or restore the division before accepting.',
        r.name, m.name using errcode = 'P0001';
    end if;

    -- 055: a teammate shares the team's roster row; the first accepted member creates it under the team name
    if r.team_id is not null then select * into t from teams where id = r.team_id for update; end if;
    if t.id is not null and t.athlete_id is not null and exists (select 1 from athletes a where a.meet_id = r.meet_id and a.id = t.athlete_id) then
      v_ath_id := t.athlete_id;
    else
      if m.athlete_cap is not null and (select count(*) from athletes a where a.meet_id = r.meet_id) >= m.athlete_cap then
        raise exception '% is at its athlete cap (%). Raise the cap in Listing before accepting %.',
          m.name, m.athlete_cap, r.name using errcode = 'P0001';
      end if;
      v_ath_id := coalesce(r.athlete_id, case when t.id is not null then 'team-' || left(t.id::text, 8) else 'reg-ath-' || left(r.id::text, 8) end);
      if not exists (select 1 from athletes a where a.meet_id = r.meet_id and a.id = v_ath_id) then
        select coalesce(max(lot_number), 0) + 1 into v_next_lot
        from athletes a where a.meet_id = r.meet_id and a.division_id = r.division_id;
        insert into athletes (id, meet_id, division_id, name, bodyweight, lot_number, status, rack_heights)
        values (v_ath_id, r.meet_id, r.division_id, case when t.id is not null then t.name else r.name end,
                case when t.id is not null then null else r.bodyweight end, v_next_lot, 'active', '{}'::jsonb);
      end if;
      if t.id is not null then update teams set athlete_id = v_ath_id where id = t.id; end if;
    end if;

    update registrations
    set status = 'accepted', athlete_id = v_ath_id, updated_at = now()
    where id = r.id
    returning * into r;
  else
    if r.athlete_id is not null then
      select string_agg(coalesce(e.name, res.event_id), ', ' order by e.event_number nulls last)
      into v_event_names
      from results res
      left join events e on e.meet_id = res.meet_id and e.id = res.event_id
      where res.meet_id = r.meet_id and res.athlete_id = r.athlete_id;

      if v_event_names is not null then
        v_verb := case
          when p_status = 'declined' then 'declined'
          when p_status = 'withdrawn' then 'withdrawn'
          else 'reopened'
        end;
        raise exception '% has recorded results (%), so the request cannot be %. Results are read-only here; mark the athlete withdrawn on meet day instead.',
          r.name, v_event_names, v_verb using errcode = 'P0001';
      end if;

      v_ath_id := r.athlete_id;
      -- Unlink first (the FK's SET NULL would do it too, but this does not depend on the constraint's shape).
      -- 055: a declined / withdrawn teammate frees their spot; the team's shared row stays while another active
      -- member still points at it, and goes when the last one leaves.
      update registrations set status = p_status, athlete_id = null, team_id = case when p_status = 'pending' then team_id else null end, updated_at = now() where id = r.id returning * into r;
      select count(*)::int into v_others from registrations x where x.meet_id = r.meet_id and x.athlete_id = v_ath_id and x.id <> r.id and x.status = 'accepted';
      if v_others = 0 then
        update teams set athlete_id = null where meet_id = r.meet_id and athlete_id = v_ath_id;
        delete from athletes where meet_id = r.meet_id and id = v_ath_id;
      end if;
    else
      update registrations set status = p_status, team_id = case when p_status = 'pending' then team_id else null end, updated_at = now() where id = r.id returning * into r;
    end if;
  end if;

  update meets set updated_at = now() where id = r.meet_id;

  return row_to_json(r)::jsonb;
end $$;
grant execute on function zt_set_registration_status(uuid, text) to authenticated;

-- ---------- zt_list_meet_registrations: 009 body + team columns ----------
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
      to_char(date_of_birth, 'YYYY-MM-DD') as date_of_birth, guardian_name, guardian_contact,
      team_id, looking_for_partner, (select t.name from teams t where t.id = registrations.team_id) as team_name
    from registrations
    where meet_id = p_meet_id
  ) r;

  return v_out;
end $$;
grant execute on function zt_list_meet_registrations(uuid) to authenticated;

-- ---------- zt_publish_meet: 054 body + team_size ----------
create or replace function zt_publish_meet(
  p_meet jsonb,
  p_divisions jsonb default '[]', p_events jsonb default '[]', p_athletes jsonb default '[]', p_results jsonb default '[]'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text; m meets%rowtype; v_uid uuid; v_owner uuid; v_linked_name text; v_pin text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'sign in to your ZeroTacky account to publish this meet' using errcode = '42501';
  end if;

  select * into m from jsonb_populate_record(null::meets, p_meet);
  -- same slug = same meet: a phone that left and re-publishes, or a second admin phone, updates in place
  v_id := coalesce((select id from meets where slug = m.slug), m.id, gen_random_uuid());

  -- Existing meet: the caller must be a member (owner/admin). 024: with the publish key gone there is no claim path for
  -- strangers; an ownerless meet goes to a remaining member or stays put.
  select owner_id into v_owner from meets where id = v_id;
  if found then
    if not exists (select 1 from meet_members where meet_id = v_id and user_id = v_uid) then
      if v_owner is null then
        raise exception 'this meet has no owner on file and your account is not one of its admins; contact ZeroTacky to recover it' using errcode = '42501';
      end if;
      raise exception 'this meet belongs to another promoter' using errcode = '42501';
    end if;
  end if;

  -- 008 (R2): an athlete on the roster through an accepted registration leaves through the registration, never
  -- through a publish that no longer lists them (a stale admin phone, or a deliberate delete on the phone).
  select r.name into v_linked_name
  from registrations r
  where r.meet_id = v_id and r.status = 'accepted' and r.athlete_id is not null
    and r.athlete_id not in (select a.id from jsonb_populate_recordset(null::athletes, coalesce(p_athletes, '[]'::jsonb)) a)
  limit 1;
  if v_linked_name is not null then
    raise exception '% is on the roster through an accepted registration. Decline or withdraw that registration in the promoter dashboard instead of deleting the athlete.',
      v_linked_name using errcode = 'P0001';
  end if;

  -- 010: the phone publishes is_demo from the preset flag. A new meet takes it as sent; an existing meet can be flipped
  -- demo -> real by any publisher (the promoter toggling "this is a real meet" on the phone) but never real -> demo,
  -- so a stale device still carrying the preset flag cannot pull a live meet off /shows or put DEMO on its scoreboard.
  -- G2-H1 (Astra gate 2): the PIN decision is made here, on the nullable input, not in the ON CONFLICT clause. There
  -- `excluded.admin_pin` is the VALUES expression, which had already been defaulted to '1050', so a null from a
  -- joined phone reset the real PIN to 1050 (reproduced live by Astra). New row: payload PIN or '1050'. Existing
  -- row: payload PIN when present, else the server's.
  v_pin := nullif(trim(m.admin_pin), '');
  insert into meets (id, slug, name, date, owner_id, admin_pin, run_order_method, tiebreaker_rule,
                     available_plates, collar_weight_per_pair, stations, is_demo, division_format)
  values (v_id, m.slug, m.name, m.date, v_uid, coalesce(v_pin, '1050'),
          coalesce(m.run_order_method, 'reverse_overall'), coalesce(m.tiebreaker_rule, 'event_wins'),
          coalesce(m.available_plates, '{100,55,45,35,25,15,10,5,2.5}'), coalesce(m.collar_weight_per_pair, 0),
          coalesce(m.stations, '[{"id":"A","label":"Station 1"},{"id":"B","label":"Station 2"}]'), coalesce(m.is_demo, false), m.division_format)
  on conflict (id) do update set
    slug = excluded.slug, name = excluded.name, date = excluded.date,
    admin_pin = coalesce(v_pin, meets.admin_pin, '1050'),   -- 008 (R1, G2-H1): null keeps the server's PIN
    run_order_method = excluded.run_order_method, tiebreaker_rule = excluded.tiebreaker_rule,
    available_plates = excluded.available_plates, collar_weight_per_pair = excluded.collar_weight_per_pair,
    stations = excluded.stations,
    division_format = coalesce(excluded.division_format, meets.division_format),   -- 054: a phone that sends none keeps the server's choice
    is_demo = (meets.is_demo and excluded.is_demo),   -- 010: a real meet stays real; only a demo can be re-published as demo
    updated_at = now(),
    owner_id = coalesce(meets.owner_id, excluded.owner_id)
  returning id, join_code into v_id, v_code;
  -- 006 (Astra A1/A2), 024: membership is written only when this call made the caller the owner (new meet, or a
  -- remaining member taking over an ownerless meet). A member publishing an owned meet gains nothing.
  if v_uid is not null and (select owner_id from meets where id = v_id) = v_uid then
    insert into meet_members (meet_id, user_id, role) values (v_id, v_uid, 'owner') on conflict do nothing;
  end if;

  insert into divisions (id, meet_id, name, flight, sort_order, weight_cap_kg, team_size)
  select d.id, v_id, d.name, coalesce(d.flight, 'A'), coalesce(d.sort_order, 0), d.weight_cap_kg, coalesce(d.team_size, 1)
  from jsonb_populate_recordset(null::divisions, p_divisions) d
  on conflict (meet_id, id) do update set name = excluded.name, flight = excluded.flight, sort_order = excluded.sort_order,
    weight_cap_kg = coalesce(excluded.weight_cap_kg, divisions.weight_cap_kg),   -- 054: a phone without caps keeps the desk's
    team_size = coalesce((select x.team_size from jsonb_populate_recordset(null::divisions, p_divisions) x where x.id = excluded.id), divisions.team_size);   -- 055: same rule

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

  -- stale children (removed on the admin phone) go away; 004 refuses scored rows, the R2 check above refused
  -- accepted registrants before anything was written
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
revoke execute on function zt_publish_meet(jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function zt_publish_meet(jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;


-- ---------- zt_save_meet_config: 054 body + team_size (+ shrink guard) ----------
create or replace function zt_save_meet_config(
  p_meet_id uuid,
  p_meet jsonb,
  p_divisions jsonb default '[]'::jsonb,
  p_events jsonb default '[]'::jsonb,
  p_athletes jsonb default '[]'::jsonb,
  p_expected_updated_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  cur meets%rowtype;
  inc meets%rowtype;
  v_name text;
  v_slug text;
  v_orphan_ath_name text;
  v_orphan_ev_name text;
  v_linked_name text;
  v_roster_count int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sign in required to save meet changes.' using errcode = 'P0001';
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

  -- M9: an accepted registration's roster row is removed through the registration, not the roster
  select r.name into v_linked_name
  from registrations r
  where r.meet_id = p_meet_id and r.status = 'accepted' and r.athlete_id is not null
    and r.athlete_id not in (select id from jsonb_populate_recordset(null::athletes, coalesce(p_athletes, '[]'::jsonb)))
  limit 1;
  if v_linked_name is not null then
    raise exception '% is on the roster through an accepted registration. Decline or withdraw that registration instead of deleting the athlete.',
      v_linked_name using errcode = 'P0001';
  end if;

  -- Division (M9 gate, revised 10/17 night, Astra gate 2 G2-M1): the registration keeps the division the athlete
  -- SUBMITTED (evidence); the roster row is the division they COMPETE in. Meet day moves athletes on the floor
  -- (weigh-in) through the athletes upsert, which has no such check, so refusing the same move here only left the
  -- dashboard unable to save anything afterwards. The Registrations table shows "competing in X" when they differ.

  -- Cap (C4 gate, revised 10/17 night, G2-M1): the cap is an intake limit (zt_submit_registration, accept). A roster
  -- that is already over it (floor walk-ons) saves fine; what is refused is this save ADDING athletes beyond the cap.
  select count(*)::int into v_roster_count from jsonb_populate_recordset(null::athletes, coalesce(p_athletes, '[]'::jsonb));
  if cur.athlete_cap is not null and v_roster_count > cur.athlete_cap
     and v_roster_count > (select count(*) from athletes a where a.meet_id = p_meet_id) then
    raise exception 'The roster has % athletes but the listing cap is %. Raise the cap in Listing or remove athletes before saving.',
      v_roster_count, cur.athlete_cap using errcode = 'P0001';
  end if;

  -- 055: shrinking a division's team size under an existing team's active members would strand that team
  select format('%s has %s active members; set the team size to at least that, or ask them to leave first.', t.name, zt_team_active_count(t.id))
  into v_orphan_ev_name
  from teams t join jsonb_populate_recordset(null::divisions, coalesce(p_divisions, '[]'::jsonb)) d on d.id = t.division_id
  where t.meet_id = p_meet_id and coalesce(d.team_size, 1) < zt_team_active_count(t.id)
  limit 1;
  if v_orphan_ev_name is not null then raise exception '%', v_orphan_ev_name using errcode = 'P0001'; end if;

  select * into inc from jsonb_populate_record(null::meets, p_meet);

  v_name := trim(coalesce(inc.name, ''));
  if v_name = '' then
    raise exception 'Meet name cannot be empty.' using errcode = 'P0001';
  end if;

  v_slug := lower(trim(coalesce(inc.slug, '')));
  if v_slug = '' then
    v_slug := regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g');
    v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
    if v_slug = '' then v_slug := 'meet'; end if;
  end if;

  if exists (select 1 from meets where id <> p_meet_id and lower(slug) = v_slug) then
    raise exception 'Another meet already uses the slug "%". Pick a unique slug.', v_slug using errcode = 'P0001';
  end if;

  if cur.registration_deadline is not null and inc.date is not null and inc.date < cur.registration_deadline then
    raise exception 'Meet date (%) is earlier than the registration deadline (%). Move the deadline first.',
      to_char(inc.date, 'YYYY-MM-DD'), to_char(cur.registration_deadline, 'YYYY-MM-DD') using errcode = 'P0001';
  end if;

  select coalesce(a.name, r.athlete_id), coalesce(e.name, r.event_id)
  into v_orphan_ath_name, v_orphan_ev_name
  from results r
  left join athletes a on a.meet_id = r.meet_id and a.id = r.athlete_id
  left join events e on e.meet_id = r.meet_id and e.id = r.event_id
  where r.meet_id = p_meet_id
    and (
      r.athlete_id not in (select id from jsonb_populate_recordset(null::athletes, coalesce(p_athletes, '[]'::jsonb)))
      or coalesce(a.division_id, '') not in (select id from jsonb_populate_recordset(null::divisions, coalesce(p_divisions, '[]'::jsonb)))
    )
  limit 1;
  if v_orphan_ath_name is not null then
    raise exception '% has a recorded result in "%" and cannot be removed from the roster. Mark the athlete withdrawn on meet day instead.',
      v_orphan_ath_name, v_orphan_ev_name using errcode = 'P0001';
  end if;

  select coalesce(e.name, r.event_id) into v_orphan_ev_name
  from results r
  left join events e on e.meet_id = r.meet_id and e.id = r.event_id
  where r.meet_id = p_meet_id
    and r.event_id not in (select id from jsonb_populate_recordset(null::events, coalesce(p_events, '[]'::jsonb)))
  limit 1;
  if v_orphan_ev_name is not null then
    raise exception 'Event "%" has recorded results and cannot be removed.', v_orphan_ev_name using errcode = 'P0001';
  end if;

  update meets set
    slug = v_slug,
    name = v_name,
    date = inc.date,
    admin_pin = coalesce(nullif(trim(inc.admin_pin), ''), cur.admin_pin, '1050'),
    run_order_method = coalesce(inc.run_order_method, cur.run_order_method, 'reverse_overall'),
    tiebreaker_rule = coalesce(inc.tiebreaker_rule, cur.tiebreaker_rule, 'event_wins'),
    available_plates = coalesce(inc.available_plates, cur.available_plates, '{100,55,45,35,25,15,10,5,2.5}'),
    collar_weight_per_pair = coalesce(inc.collar_weight_per_pair, cur.collar_weight_per_pair, 0),
    stations = coalesce(inc.stations, cur.stations, '[{"id":"A","label":"Station 1"},{"id":"B","label":"Station 2"}]'::jsonb),
    division_format = coalesce(inc.division_format, cur.division_format),   -- 054: promoter's choice; once set it stays set
    is_demo = false,
    updated_at = now()
  where id = p_meet_id;

  insert into divisions (id, meet_id, name, flight, sort_order, weight_cap_kg, team_size)
  select d.id, p_meet_id, d.name, coalesce(d.flight, 'A'), coalesce(d.sort_order, 0), d.weight_cap_kg, coalesce(d.team_size, 1)
  from jsonb_populate_recordset(null::divisions, coalesce(p_divisions, '[]'::jsonb)) d
  on conflict (meet_id, id) do update set
    name = excluded.name, flight = excluded.flight, sort_order = excluded.sort_order,
    weight_cap_kg = excluded.weight_cap_kg,   -- 054: the dashboard is authoritative for caps (null clears)
    team_size = excluded.team_size;   -- 055: the dashboard is authoritative for team size too

  insert into events (id, meet_id, event_number, name, scoring_type, time_cap_seconds, lanes, loading_points,
                      weight_entry_mode, implement_empty_weight, config)
  select e.id, p_meet_id, e.event_number, e.name, e.scoring_type, coalesce(e.time_cap_seconds, 60), coalesce(e.lanes, 1),
         coalesce(e.loading_points, 0), coalesce(e.weight_entry_mode, 'total'), coalesce(e.implement_empty_weight, 0),
         coalesce(e.config, '{}'::jsonb)
  from jsonb_populate_recordset(null::events, coalesce(p_events, '[]'::jsonb)) e
  on conflict (meet_id, id) do update set
    event_number = excluded.event_number, name = excluded.name, scoring_type = excluded.scoring_type,
    time_cap_seconds = excluded.time_cap_seconds, lanes = excluded.lanes, loading_points = excluded.loading_points,
    weight_entry_mode = excluded.weight_entry_mode, implement_empty_weight = excluded.implement_empty_weight,
    config = excluded.config;

  insert into athletes (id, meet_id, division_id, name, bodyweight, lot_number, status, rack_heights)
  select a.id, p_meet_id, a.division_id, a.name, a.bodyweight, coalesce(a.lot_number, 0), coalesce(a.status, 'active'),
         coalesce(a.rack_heights, '{}'::jsonb)
  from jsonb_populate_recordset(null::athletes, coalesce(p_athletes, '[]'::jsonb)) a
  on conflict (meet_id, id) do update set
    division_id = excluded.division_id, name = excluded.name, bodyweight = excluded.bodyweight,
    lot_number = excluded.lot_number, status = excluded.status, rack_heights = excluded.rack_heights;

  delete from athletes
  where meet_id = p_meet_id
    and id not in (select id from jsonb_populate_recordset(null::athletes, coalesce(p_athletes, '[]'::jsonb)));
  delete from events
  where meet_id = p_meet_id
    and id not in (select id from jsonb_populate_recordset(null::events, coalesce(p_events, '[]'::jsonb)));
  delete from divisions
  where meet_id = p_meet_id
    and id not in (select id from jsonb_populate_recordset(null::divisions, coalesce(p_divisions, '[]'::jsonb)));

  return jsonb_build_object('id', p_meet_id);
end $$;
grant execute on function zt_save_meet_config(uuid, jsonb, jsonb, jsonb, jsonb, timestamptz) to authenticated;

