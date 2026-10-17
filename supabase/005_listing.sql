-- 005_listing.sql (v2 M3, 2026-10-17; Argon draft, Slate edits marked [Slate]): public directory listing columns on `meets`, `registrations` table,
-- RLS policies, and security-definer RPCs for the promoter dashboard and public athlete registration.
-- Safe to re-run (idempotent). Numbering: 004 is the result guard (applied to prod too); 006 is the ownership fixes.
--
-- ============================================================================
-- ASSUMPTIONS ABOUT 001_schema.sql AND 003_auth.sql
-- ============================================================================
-- 1. `001_schema.sql` created:
--    - `meets (id uuid pk, slug text unique, name text, date date, owner_id uuid, join_code text unique,
--       admin_pin text, run_order_method text, tiebreaker_rule text, available_plates numeric[],
--       collar_weight_per_pair numeric, stations jsonb, is_demo boolean, created_at timestamptz, updated_at timestamptz)`
--    - `meet_members (meet_id uuid, user_id uuid, role text, pk(meet_id, user_id))`
--    - `divisions (id text, meet_id uuid, name text, flight text, sort_order int, pk(meet_id, id))`
--    - `events`, `athletes (pk(meet_id, id))`, `results (pk(meet_id, id))`, `live_state`
--    - `gen_join_code() returns text`, `zt_is_member(m uuid) returns boolean`
--    - `meets_add_owner_t` trigger that inserts `(new.id, new.owner_id, 'owner')` into `meet_members`
--    - Column-level `grant select (...) on meets to anon, authenticated` (with `join_code`, `admin_pin`, `owner_id` omitted)
-- 2. `003_auth.sql` created:
--    - `profiles (id uuid pk, email text, display_name text, is_athlete boolean, is_promoter boolean,
--       is_gym_owner boolean, created_at timestamptz, updated_at timestamptz)`
--    - `profiles_touch()` trigger function that sets `new.updated_at := now()`
--    - `zt_publish_meet` (left untouched by this migration so meet-day phones keep their exact behaviour)
--
-- ============================================================================
-- STAGING VERIFICATION CHECKLIST FOR SLATE (run one SELECT per item after applying)
-- ============================================================================
-- 1. Verify `meets` listing columns & defaults (existing meets must be unlisted and closed):
--    select slug, competition_status, registration_status, results_status, is_public_listed, athlete_cap
--    from meets limit 5;
-- 2. Verify `zt_public_meets` view only exposes listed, non-demo meets and never exposes join_code/admin_pin/owner_id:
--    select column_name from information_schema.columns where table_schema = 'public' and table_name = 'zt_public_meets';
-- 3. Verify `registrations` table columns and constraints:
--    select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'registrations' order by ordinal_position;
-- 4. Verify `registrations` RLS policies:
--    select policyname, cmd, roles, qual, with_check from pg_policies
--    where schemaname = 'public' and tablename = 'registrations';
-- 5. Verify `emergency_contact` is not granted for direct table SELECT to `anon` or `authenticated`:
--    select grantee, column_name, privilege_type from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'registrations' order by grantee, column_name;
-- 6. Verify all M3 RPCs exist and are security definer:
--    select proname, prosecdef, proconfig from pg_proc
--    where proname in (
--      'zt_submit_registration', 'zt_set_registration_status', 'zt_save_meet_config',
--      'zt_rotate_join_code', 'zt_create_meet', 'zt_my_meets', 'zt_get_my_meet',
--      'zt_list_meet_registrations', 'zt_public_meet_by_slug'
--    );

-- ---------- 1. Listing columns on `meets` ----------
alter table meets
  add column if not exists competition_status text not null default 'upcoming',
  add column if not exists registration_status text not null default 'closed',
  add column if not exists results_status text not null default 'not_started',
  add column if not exists is_public_listed boolean not null default false,
  add column if not exists venue jsonb,
  add column if not exists federation text,
  add column if not exists entry_fee_display text,
  add column if not exists registration_deadline date,
  add column if not exists athlete_cap integer,
  add column if not exists promoter_contact text;

do $$ begin
  alter table meets drop constraint if exists meets_competition_status_check;
  alter table meets add constraint meets_competition_status_check
    check (competition_status in ('upcoming', 'live', 'completed', 'postponed', 'cancelled'));

  alter table meets drop constraint if exists meets_registration_status_check;
  alter table meets add constraint meets_registration_status_check
    check (registration_status in ('open', 'closed', 'waitlist', 'day_of_only', 'not_applicable', 'not_provided'));

  alter table meets drop constraint if exists meets_results_status_check;
  alter table meets add constraint meets_results_status_check
    check (results_status in ('not_started', 'in_progress', 'provisional', 'final'));

  alter table meets drop constraint if exists meets_athlete_cap_check;
  alter table meets add constraint meets_athlete_cap_check
    check (athlete_cap is null or athlete_cap > 0);
end $$;

-- Ensure any demo meet is never publicly listed
update meets set is_public_listed = false where is_demo = true and is_public_listed = true;

-- Helper: true if caller is meet owner (`meets.owner_id = auth.uid()`) or in `meet_members`
create or replace function zt_is_owner_or_member(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from meets where id = m and owner_id = auth.uid()
  ) or exists (
    select 1 from meet_members where meet_id = m and user_id = auth.uid()
  );
$$;

-- ---------- 2. Public read of listings ----------
-- Extend the column-level SELECT grant on `meets` so `/m/<slug>`, `/shows`, and `/register/<slug>` can read
-- the public listing columns while `join_code`, `admin_pin`, and `owner_id` remain ungranted.
revoke select on meets from anon, authenticated;
grant select (
  id, slug, name, date, run_order_method, tiebreaker_rule, available_plates, collar_weight_per_pair,
  stations, is_demo, created_at, updated_at,
  competition_status, registration_status, results_status, is_public_listed,
  venue, federation, entry_fee_display, registration_deadline, athlete_cap, promoter_contact
) on meets to anon, authenticated;

-- Allow owners/members to update listing columns on `meets`
drop policy if exists meets_update on meets;
create policy meets_update on meets for update
  using (zt_is_owner_or_member(id))
  with check (zt_is_owner_or_member(id));

-- Convenience view for `/shows`: only publicly listed, non-demo meets (or the caller's own meets),
-- exposing only the public columns.
create or replace view zt_public_meets with (security_invoker = true) as
  select
    id, slug, name, date, run_order_method, tiebreaker_rule, available_plates, collar_weight_per_pair,
    stations, is_demo, created_at, updated_at,
    competition_status, registration_status, results_status, is_public_listed,
    venue, federation, entry_fee_display, registration_deadline, athlete_cap, promoter_contact
  from meets
  where (is_public_listed = true and is_demo = false)
     or zt_is_owner_or_member(id);

grant select on zt_public_meets to anon, authenticated;

-- ---------- 3. `registrations` table ----------
create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  meet_id uuid not null references meets(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  athlete_id text null,
  division_id text not null,
  name text not null,
  email text not null,
  bodyweight numeric null,
  emergency_contact text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'waitlist')),
  waitlisted boolean not null default false,
  paid boolean not null default false,
  waiver_accepted_at timestamptz null,
  waiver_version text null,  -- [Slate] C6: first 12 hex of sha-256 of the waiver text the athlete saw
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registrations_athlete_fk
    foreign key (meet_id, athlete_id) references athletes(meet_id, id) on delete set null
);

-- [Slate] C6: staging already had the table before this column existed.
alter table registrations add column if not exists waiver_version text null;

create index if not exists registrations_meet_created_idx on registrations (meet_id, created_at desc);
create index if not exists registrations_user_idx on registrations (user_id) where user_id is not null;

drop trigger if exists registrations_touch on registrations;
create trigger registrations_touch before update on registrations
  for each row execute function profiles_touch();

alter table registrations enable row level security;

-- Anon and authenticated can NEVER insert or delete directly; all inserts go through `zt_submit_registration`
-- and status transitions go through `zt_set_registration_status`.
revoke all on registrations from anon, authenticated;

-- Column-level SELECT grant for `authenticated`: omits `emergency_contact` so a signed-in athlete
-- selecting their own registration row can never read `emergency_contact` through PostgREST, and even if
-- a policy were misconfigured, `emergency_contact` is unreadable via table SELECT. Promoters read full
-- rows (including `emergency_contact`) via the owner/member RPC `zt_list_meet_registrations` below,
-- AND we also grant `emergency_contact` only through that security-definer RPC.
grant select (
  id, meet_id, user_id, athlete_id, division_id, name, email, bodyweight,
  status, waitlisted, paid, waiver_accepted_at, waiver_version, created_at, updated_at
) on registrations to authenticated;

-- [Slate] no direct UPDATE grant: a PATCH to status=accepted would skip the athlete creation in
-- zt_set_registration_status (Astra C2). Every transition goes through the RPC.
revoke update on registrations from anon, authenticated;

drop policy if exists registrations_select_owner_or_self on registrations;
create policy registrations_select_owner_or_self on registrations
  for select to authenticated
  using (zt_is_owner_or_member(meet_id) or user_id = auth.uid());

drop policy if exists registrations_update_owner on registrations;  -- [Slate] removed with the grant above

-- ---------- 4. Security-definer RPCs ----------

-- 4a. Owner/member meet list & single-meet fetch (includes join_code and admin_pin, plus registration counts).
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
grant execute on function zt_my_meets() to authenticated;

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
      (select count(*)::int from divisions d where d.meet_id = m.id) as division_count,
      (select count(*)::int from athletes a where a.meet_id = m.id) as athlete_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status in ('pending', 'waitlist')) as pending_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status = 'accepted') as registration_count
    from meets m
    where m.id = p_meet_id
  ) q;

  return v_out;
end $$;
grant execute on function zt_get_my_meet(uuid) to authenticated;

-- Owner/member registration list (returns emergency_contact only to the meet owner or member).
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
      emergency_contact, status, waitlisted, paid, waiver_accepted_at, waiver_version, created_at, updated_at
    from registrations
    where meet_id = p_meet_id
  ) r;

  return v_out;
end $$;
grant execute on function zt_list_meet_registrations(uuid) to authenticated;

-- Public registration lookup by slug: returns meet listing columns, promoter display name (from `profiles`),
-- divisions, events, and current roster count (`accepted_count`), never leaking join_code, admin_pin, owner_id,
-- emails, emergency_contact, or results.
create or replace function zt_public_meet_by_slug(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_clean text;
  m meets%rowtype;
  v_promoter_name text;
  v_divisions jsonb;
  v_events jsonb;
  v_accepted_count int;
begin
  v_clean := lower(trim(coalesce(p_slug, '')));
  if v_clean = '' then
    return null;
  end if;

  select * into m from meets where lower(slug) = v_clean and is_demo = false limit 1;
  if not found then
    return null;
  end if;

  if m.owner_id is not null then
    select coalesce(nullif(trim(p.display_name), ''), split_part(coalesce(p.email, ''), '@', 1))
    into v_promoter_name
    from profiles p where p.id = m.owner_id;
  end if;
  v_promoter_name := coalesce(nullif(trim(v_promoter_name), ''), 'Promoter');

  select coalesce(jsonb_agg(row_to_json(d)::jsonb order by d.sort_order asc), '[]'::jsonb)
  into v_divisions
  from divisions d where d.meet_id = m.id;

  select coalesce(jsonb_agg(row_to_json(e)::jsonb order by e.event_number asc), '[]'::jsonb)
  into v_events
  from events e where e.meet_id = m.id;

  select count(*)::int into v_accepted_count from athletes a where a.meet_id = m.id;

  return jsonb_build_object(
    'meet', jsonb_build_object(
      'id', m.id,
      'slug', m.slug,
      'name', m.name,
      'date', m.date,
      'run_order_method', m.run_order_method,
      'tiebreaker_rule', m.tiebreaker_rule,
      'available_plates', m.available_plates,
      'collar_weight_per_pair', m.collar_weight_per_pair,
      'stations', m.stations,
      'is_demo', m.is_demo,
      'competition_status', m.competition_status,
      'registration_status', m.registration_status,
      'results_status', m.results_status,
      'is_public_listed', m.is_public_listed,
      'venue', m.venue,
      'federation', m.federation,
      'entry_fee_display', m.entry_fee_display,
      'registration_deadline', m.registration_deadline,
      'athlete_cap', m.athlete_cap,
      'promoter_contact', m.promoter_contact,
      'updated_at', m.updated_at
    ),
    'promoter_display_name', v_promoter_name,
    'divisions', v_divisions,
    'events', v_events,
    'accepted_count', v_accepted_count
  );
end $$;
grant execute on function zt_public_meet_by_slug(text) to anon, authenticated;

-- 4b. `zt_submit_registration(p_slug text, p_input jsonb) returns jsonb` -> `{id, status}`
create or replace function zt_submit_registration(p_slug text, p_input jsonb)
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
  v_waiver_version text;  -- [Slate] C6
  v_digits int;
  v_letters int;
  v_accepted_count int;
  v_outcome text;
  v_waitlisted boolean;
  v_reg_id uuid;
begin
  v_clean_slug := lower(trim(coalesce(p_slug, p_input->>'slug', '')));
  select * into m from meets where lower(slug) = v_clean_slug and is_demo = false for share;
  if not found then
    raise exception 'No competition found at "%".', coalesce(p_slug, '') using errcode = 'P0001';
  end if;

  if m.registration_status not in ('open', 'waitlist') then
    raise exception 'Registration for % is currently closed (%).',
      m.name, replace(m.registration_status, '_', ' ') using errcode = 'P0001';
  end if;

  v_name := trim(coalesce(p_input->>'athleteName', p_input->>'name', ''));
  if char_length(v_name) < 2 then
    raise exception 'Please enter the athlete full name.' using errcode = 'P0001';
  end if;

  v_email := lower(trim(coalesce(p_input->>'email', '')));
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Please enter a valid email address.' using errcode = 'P0001';
  end if;

  v_emergency := trim(coalesce(p_input->>'emergencyContact', p_input->>'emergency_contact', ''));
  v_digits := char_length(regexp_replace(v_emergency, '[^0-9]', '', 'g'));
  v_letters := char_length(regexp_replace(v_emergency, '[^A-Za-z]', '', 'g'));
  if v_digits < 7 or v_letters < 2 then
    raise exception 'Emergency contact needs a name and a phone number with at least 7 digits (for example "Sam Lee 717-555-0100").'
      using errcode = 'P0001';
  end if;

  v_div_id := trim(coalesce(p_input->>'divisionId', p_input->>'division_id', ''));
  if not exists (select 1 from divisions d where d.meet_id = m.id and d.id = v_div_id) then
    raise exception 'Please select a valid division for this meet.' using errcode = 'P0001';
  end if;

  v_waiver := coalesce((p_input->>'waiverAccepted')::boolean, false);
  if not v_waiver then
    raise exception 'You must read and accept the competition waiver before submitting.' using errcode = 'P0001';
  end if;
  -- [Slate] C6: the client sends the version of the waiver text it rendered; a submission without it is refused
  -- (the page only submits when the waiver loaded, so a missing version means a stale or hand-built client).
  v_waiver_version := trim(coalesce(p_input->>'waiverVersion', ''));
  if v_waiver_version = '' then
    raise exception 'The waiver version is missing. Reload the page and try again.' using errcode = 'P0001';
  end if;

  -- Decide outcome (`decideRegistrationOutcome` in `fixtureApi.ts`)
  select count(*)::int into v_accepted_count from athletes a where a.meet_id = m.id;

  if m.registration_status = 'waitlist' then
    v_outcome := 'waitlist';
    v_waitlisted := true;
  else
    if m.registration_deadline is not null and current_date > m.registration_deadline then
      raise exception 'Registration for % closed on %. Contact the promoter about late entries.',
        m.name, to_char(m.registration_deadline, 'YYYY-MM-DD') using errcode = 'P0001';
    end if;
    if m.athlete_cap is not null and v_accepted_count >= m.athlete_cap then
      raise exception '% is full (% of % spots taken). Contact the promoter to ask about a waitlist.',
        m.name, v_accepted_count, m.athlete_cap using errcode = 'P0001';
    end if;
    v_outcome := 'pending';
    v_waitlisted := false;
  end if;

  -- Duplicate check for same meet, division, and email
  if exists (
    select 1 from registrations r
    where r.meet_id = m.id
      and r.division_id = v_div_id
      and lower(trim(r.email)) = v_email
      and r.status not in ('withdrawn', 'declined')
  ) then
    raise exception 'An active or pending registration already exists for this email in the selected division.'
      using errcode = 'P0001';
  end if;

  if p_input ? 'bodyweight' and p_input->>'bodyweight' is not null and trim(p_input->>'bodyweight') <> '' then
    v_bodyweight := (p_input->>'bodyweight')::numeric;
  else
    v_bodyweight := null;
  end if;

  insert into registrations (
    meet_id, user_id, athlete_id, division_id, name, email, bodyweight,
    emergency_contact, status, waitlisted, paid, waiver_accepted_at, waiver_version
  )
  values (
    m.id, auth.uid(), null, v_div_id, v_name, v_email, v_bodyweight,
    v_emergency, 'pending', v_waitlisted, false, now(), v_waiver_version
  )
  returning id into v_reg_id;

  -- [Slate] no `meets.updated_at` bump here: a pending request changes no config or roster, and bumping would make
  -- every open dashboard editor's next save fail the C3 check for nothing. Counts are computed, not stored.

  return jsonb_build_object('id', v_reg_id, 'status', v_outcome);
end $$;
grant execute on function zt_submit_registration(text, jsonb) to anon, authenticated;

-- 4c. `zt_set_registration_status(p_id uuid, p_status text) returns jsonb` (owner/member only)
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

  select * into m from meets where id = r.meet_id;
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

    -- [Slate] Astra C4: accepting past the cap is refused; the promoter raises the cap first (explicit, not silent)
    if m.athlete_cap is not null and (select count(*) from athletes a where a.meet_id = r.meet_id) >= m.athlete_cap then
      raise exception '% is at its athlete cap (%). Raise the cap in Listing before accepting %.',
        m.name, m.athlete_cap, r.name using errcode = 'P0001';
    end if;

    v_ath_id := coalesce(r.athlete_id, 'reg-ath-' || left(r.id::text, 8));

    if not exists (select 1 from athletes a where a.meet_id = r.meet_id and a.id = v_ath_id) then
      select coalesce(max(lot_number), 0) + 1 into v_next_lot
      from athletes a where a.meet_id = r.meet_id and a.division_id = r.division_id;

      insert into athletes (id, meet_id, division_id, name, bodyweight, lot_number, status, rack_heights)
      values (v_ath_id, r.meet_id, r.division_id, r.name, r.bodyweight, v_next_lot, 'active', '{}'::jsonb);
    end if;

    update registrations
    set status = 'accepted', athlete_id = v_ath_id, updated_at = now()
    where id = r.id
    returning * into r;
  else
    -- Transitioning to pending / declined / withdrawn: remove the linked athlete row if present,
    -- unless that athlete already has recorded results (H3 rule).
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

      delete from athletes where meet_id = r.meet_id and id = r.athlete_id;
    end if;

    update registrations
    set status = p_status, athlete_id = null, updated_at = now()
    where id = r.id
    returning * into r;
  end if;

  update meets set updated_at = now() where id = r.meet_id;

  return row_to_json(r)::jsonb;
end $$;
grant execute on function zt_set_registration_status(uuid, text) to authenticated;

-- 4d. `zt_save_meet_config(p_meet_id uuid, p_meet jsonb, p_divisions jsonb, p_events jsonb, p_athletes jsonb,
--      p_expected_updated_at timestamptz default null) returns jsonb`
-- Same upsert logic as `zt_publish_meet` for config and roster, but raises instead of cascading when a removed
-- athlete, event or division owns rows in `results` (server-side H3 guard). Never touches `results`.
-- [Slate] Astra C3/M9: `p_expected_updated_at` is the `meets.updated_at` the editor loaded; a mismatch means someone
-- saved in between and the call is refused. An athlete linked to an accepted registration leaves only through that
-- registration (decline/withdraw), never through a roster save.
drop function if exists zt_save_meet_config(uuid, jsonb, jsonb, jsonb, jsonb);  -- [Slate] old arity would be ambiguous for PostgREST
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

  -- [Slate] C3: optimistic concurrency
  if p_expected_updated_at is not null and cur.updated_at <> p_expected_updated_at then
    raise exception 'This meet changed since you opened it (saved %). Reload to see the latest version, then redo your edits.',
      to_char(cur.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') using errcode = 'P0001';
  end if;

  -- [Slate] M9: an accepted registration's roster row is removed through the registration, not the roster
  select r.name into v_linked_name
  from registrations r
  where r.meet_id = p_meet_id and r.status = 'accepted' and r.athlete_id is not null
    and r.athlete_id not in (select id from jsonb_populate_recordset(null::athletes, coalesce(p_athletes, '[]'::jsonb)))
  limit 1;
  if v_linked_name is not null then
    raise exception '% is on the roster through an accepted registration. Decline or withdraw that registration instead of deleting the athlete.',
      v_linked_name using errcode = 'P0001';
  end if;

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

  -- H3 Guard 1: check if any stored result points at an athlete absent from `p_athletes`
  -- (or whose division is absent from `p_divisions`)
  select
    coalesce(a.name, r.athlete_id),
    coalesce(e.name, r.event_id)
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

  -- H3 Guard 2: check if any stored result points at an event absent from `p_events`
  select coalesce(e.name, r.event_id)
  into v_orphan_ev_name
  from results r
  left join events e on e.meet_id = r.meet_id and e.id = r.event_id
  where r.meet_id = p_meet_id
    and r.event_id not in (select id from jsonb_populate_recordset(null::events, coalesce(p_events, '[]'::jsonb)))
  limit 1;

  if v_orphan_ev_name is not null then
    raise exception 'Event "%" has recorded results and cannot be removed.', v_orphan_ev_name using errcode = 'P0001';
  end if;

  -- Update meet row (preserving owner_id, join_code, and listing columns)
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
    is_demo = false,
    updated_at = now()
  where id = p_meet_id;

  -- Upsert divisions, events, athletes
  insert into divisions (id, meet_id, name, flight, sort_order)
  select d.id, p_meet_id, d.name, coalesce(d.flight, 'A'), coalesce(d.sort_order, 0)
  from jsonb_populate_recordset(null::divisions, coalesce(p_divisions, '[]'::jsonb)) d
  on conflict (meet_id, id) do update set
    name = excluded.name, flight = excluded.flight, sort_order = excluded.sort_order;

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

  -- Delete stale children (safe because H3 guard above verified none of them have results)
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

-- 4e. `zt_rotate_join_code(p_meet_id uuid) returns jsonb` -> `{joinCode}`
create or replace function zt_rotate_join_code(p_meet_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_old_code text;
  v_new_code text;
  v_attempt int := 0;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sign in required to rotate join code.' using errcode = 'P0001';
  end if;

  select join_code into v_old_code from meets where id = p_meet_id for update;
  if not found then
    raise exception 'No meet found with serverId "%".', p_meet_id using errcode = 'P0001';
  end if;

  if not zt_is_owner_or_member(p_meet_id) then
    raise exception 'You do not have permission to rotate the join code for this meet.' using errcode = 'P0001';
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_new_code := gen_join_code();
    if v_new_code <> coalesce(v_old_code, '') then
      begin
        update meets set join_code = v_new_code, updated_at = now() where id = p_meet_id;
        exit;
      exception when unique_violation then
        if v_attempt >= 20 then
          raise exception 'Could not generate a unique join code after 20 attempts.' using errcode = 'P0001';
        end if;
      end;
    end if;
    if v_attempt >= 20 then
      raise exception 'Could not generate a new join code.' using errcode = 'P0001';
    end if;
  end loop;

  return jsonb_build_object('joinCode', v_new_code);
end $$;
grant execute on function zt_rotate_join_code(uuid) to authenticated;

-- 4f. `zt_create_meet(p_name text, p_date date, p_slug text) returns jsonb` (authenticated only)
create or replace function zt_create_meet(p_name text, p_date date, p_slug text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_name text;
  v_slug text;
  v_meet meets%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sign in required to create a meet.' using errcode = 'P0001';
  end if;

  v_name := trim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'Meet name is required.' using errcode = 'P0001';
  end if;

  if p_date is null then
    raise exception 'Meet date is required (YYYY-MM-DD).' using errcode = 'P0001';
  end if;

  v_slug := lower(trim(coalesce(nullif(trim(p_slug), ''), v_name)));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
  v_slug := left(v_slug, 60);
  v_slug := regexp_replace(v_slug, '-+$', '', 'g');
  if v_slug = '' then v_slug := 'meet'; end if;

  if exists (select 1 from meets where lower(slug) = v_slug) then
    raise exception 'A meet with the URL slug "%" already exists. Choose a different slug.', v_slug
      using errcode = 'P0001';
  end if;

  -- `registration_status` starts as 'not_provided' for newly created meets to match `emptyListing()` in contract.ts,
  -- while `004_listing.sql` column default on existing rows is 'closed'.
  insert into meets (
    slug, name, date, owner_id, is_demo,
    competition_status, registration_status, results_status, is_public_listed
  )
  values (
    v_slug, v_name, p_date, v_uid, false,
    'upcoming', 'not_provided', 'not_started', false
  )
  returning * into v_meet;

  insert into meet_members (meet_id, user_id, role)
  values (v_meet.id, v_uid, 'owner')
  on conflict do nothing;

  return (
    select zt_get_my_meet(v_meet.id)
  );
end $$;
grant execute on function zt_create_meet(text, date, text) to authenticated;
