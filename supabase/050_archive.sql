-- 050: results archive import (#11, 11/9). Day-one history from strongmanresults.com (CC BY 4.0; original scoring
-- published on Iron Podium) and, later, openstrongman.org (CC0). Facts only: who placed where, scores as published.
-- Tables are public-read; the loader (~/.aki/tmp/zt/archive/load_sr.py) writes through the Management API as postgres,
-- so no authenticated write path exists. Athletes attach an archive name to their account through an admin-approved
-- link (archive_links), the same shape as the #9 result claim but with zt_admins in the promoter's seat.

create table if not exists archive_sources (
  key text primary key,                       -- 'sr' | 'os'
  name text not null,
  url text not null,
  license text not null,                      -- 'CC BY 4.0'
  license_url text not null,
  attribution text not null,                  -- the credit line the license asks for
  data_url text not null,
  last_source_update date,
  fetched_at timestamptz,
  competitions int not null default 0,
  placements int not null default 0,
  results int not null default 0
);

create table if not exists archive_competitions (
  id bigint generated always as identity primary key,
  source text not null references archive_sources(key) on delete cascade,
  slug text not null unique,                  -- source:date:slug(name), stable across weekly rebuilds
  name text not null,
  date date not null,
  sanction text,                              -- 'sc' | 'uss' | 'psl' as published
  city text,
  state text
);
create index if not exists archive_competitions_date_idx on archive_competitions (date desc);

create table if not exists archive_placements (
  id bigint generated always as identity primary key,
  competition_id bigint not null references archive_competitions(id) on delete cascade,
  athlete text not null,
  athlete_key text not null,
  division text not null,
  sex text,
  class_kind text,
  weight_class text,
  place int,
  points numeric
);
create index if not exists archive_placements_key_idx on archive_placements (athlete_key);
create index if not exists archive_placements_comp_idx on archive_placements (competition_id, division);

create table if not exists archive_results (
  id bigint generated always as identity primary key,
  competition_id bigint not null references archive_competitions(id) on delete cascade,
  athlete text not null,
  athlete_key text not null,
  division text not null,
  event_num int,
  event text not null,
  event_type text,
  canonical_lift text,
  unit text,
  raw_value text,
  value numeric,
  points numeric
);
create index if not exists archive_results_key_idx on archive_results (athlete_key);
create index if not exists archive_results_comp_idx on archive_results (competition_id, athlete_key);

create table if not exists archive_links (
  id uuid primary key default gen_random_uuid(),
  athlete_key text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);
create unique index if not exists archive_links_one_owner on archive_links (athlete_key) where status = 'approved';
create unique index if not exists archive_links_one_ask on archive_links (athlete_key, user_id) where status = 'pending';
create index if not exists archive_links_user_idx on archive_links (user_id);

alter table archive_sources enable row level security;
alter table archive_competitions enable row level security;
alter table archive_placements enable row level security;
alter table archive_results enable row level security;
alter table archive_links enable row level security;
drop policy if exists archive_sources_read on archive_sources;
create policy archive_sources_read on archive_sources for select to anon, authenticated using (true);
drop policy if exists archive_competitions_read on archive_competitions;
create policy archive_competitions_read on archive_competitions for select to anon, authenticated using (true);
drop policy if exists archive_placements_read on archive_placements;
create policy archive_placements_read on archive_placements for select to anon, authenticated using (true);
drop policy if exists archive_results_read on archive_results;
create policy archive_results_read on archive_results for select to anon, authenticated using (true);
drop policy if exists archive_links_own on archive_links;
create policy archive_links_own on archive_links for select to authenticated using (user_id = auth.uid());
grant select on archive_sources, archive_competitions, archive_placements, archive_results to anon, authenticated;
grant select on archive_links to authenticated;

-- Name key: lower, letters and digits only, single spaces. Mirrored in lib/website/archive.ts (normalizeArchiveKey).
create or replace function zt_archive_norm(p text) returns text language sql immutable as $$
  select trim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', ' ', 'g'))
$$;

-- One competition for one athlete key, with that athlete's event rows and the size of their division.
create or replace function zt_archive_competitions_json(p_key text) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'name', c.name, 'date', c.date, 'sanction', c.sanction, 'city', c.city, 'state', c.state,
      'division', p.division, 'place', p.place, 'points', p.points, 'weightClass', p.weight_class, 'classKind', p.class_kind,
      'enteredAs', p.athlete,
      'fieldSize', (select count(*) from archive_placements q where q.competition_id = p.competition_id and q.division = p.division),
      'events', (select coalesce(jsonb_agg(jsonb_build_object('num', r.event_num, 'event', r.event, 'type', r.event_type,
                   'lift', r.canonical_lift, 'unit', r.unit, 'raw', r.raw_value, 'value', r.value, 'points', r.points) order by r.event_num), '[]'::jsonb)
                 from archive_results r where r.competition_id = p.competition_id and r.athlete_key = p.athlete_key and r.division = p.division)
    ) order by c.date desc, c.name), '[]'::jsonb)
  from archive_placements p join archive_competitions c on c.id = p.competition_id
  where p.athlete_key = p_key
$$;

-- Public: the archive record behind one name key. Zero rows -> empty competitions, never an error.
create or replace function zt_archive_athlete(p_key text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'key', zt_archive_norm(p_key),
    'name', (select p.athlete from archive_placements p where p.athlete_key = zt_archive_norm(p_key) group by p.athlete order by count(*) desc, p.athlete limit 1),
    'linked', exists (select 1 from archive_links l where l.athlete_key = zt_archive_norm(p_key) and l.status = 'approved'),
    'competitions', zt_archive_competitions_json(zt_archive_norm(p_key)))
$$;
grant execute on function zt_archive_athlete(text) to anon, authenticated;

-- Public: the archive record attached to a profile (every approved link), used by the athlete page.
create or replace function zt_archive_for_username(p_username text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid; v_keys text[]; v_out jsonb := '[]'::jsonb; k text;
begin
  select id into v_uid from profiles where lower(username) = lower(p_username) and coalesce(is_public, false);
  if v_uid is null then return jsonb_build_object('keys', '[]'::jsonb, 'competitions', '[]'::jsonb); end if;
  select coalesce(array_agg(athlete_key order by athlete_key), '{}') into v_keys from archive_links where user_id = v_uid and status = 'approved';
  foreach k in array v_keys loop v_out := v_out || zt_archive_competitions_json(k); end loop;
  return jsonb_build_object('keys', to_jsonb(v_keys), 'competitions', v_out);
end $$;
grant execute on function zt_archive_for_username(text) to anon, authenticated;

-- One row per archive name: the loader refreshes this after every load (search reads 22k rows, not 60k joins).
drop materialized view if exists archive_athletes;
create materialized view archive_athletes as
  select p.athlete_key as key,
    (array_agg(p.athlete order by p.athlete))[1] as name,
    count(*)::int as competitions, min(c.date) as first_date, max(c.date) as last_date,
    coalesce(array_agg(distinct c.state) filter (where c.state is not null), '{}') as states
  from archive_placements p join archive_competitions c on c.id = p.competition_id
  group by p.athlete_key;
create unique index archive_athletes_key on archive_athletes (key);
grant select on archive_athletes to anon, authenticated;

-- Public: find archive names. Every word of the query must appear in the key; 20 names, most competitions first.
create or replace function zt_archive_search(p_name text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_words text[]; v_pat text;
begin
  v_words := regexp_split_to_array(zt_archive_norm(p_name), ' ');
  if coalesce(array_length(v_words, 1), 0) = 0 or char_length(zt_archive_norm(p_name)) < 3 then return '[]'::jsonb; end if;
  v_pat := '(?=.*\m' || array_to_string(v_words, '\M)(?=.*\m') || '\M)';
  return coalesce((select jsonb_agg(row_to_json(t)) from (
    select a.key, a.name, a.competitions, a.first_date as "firstDate", a.last_date as "lastDate", a.states,
      exists (select 1 from archive_links l where l.athlete_key = a.key and l.status = 'approved') as linked
    from archive_athletes a where a.key ~ v_pat
    order by a.competitions desc, a.key limit 20) t), '[]'::jsonb);
end $$;
grant execute on function zt_archive_search(text) to anon, authenticated;

create or replace function zt_archive_link_json(l archive_links) returns jsonb language sql stable as $$
  select jsonb_build_object('id', l.id, 'key', l.athlete_key, 'status', l.status, 'note', l.note, 'createdAt', l.created_at, 'decidedAt', l.decided_at,
    'name', (select p.athlete from archive_placements p where p.athlete_key = l.athlete_key group by p.athlete order by count(*) desc, p.athlete limit 1),
    'competitions', (select count(*) from archive_placements p where p.athlete_key = l.athlete_key))
$$;

-- Signed in: ask to attach an archive name to this account. Admins decide.
create or replace function zt_archive_claim(p_key text, p_note text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_key text := zt_archive_norm(p_key); v_note text; l archive_links;
begin
  if v_uid is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  if not exists (select 1 from archive_placements where athlete_key = v_key) then raise exception 'That name is not in the archive.' using errcode = 'P0001'; end if;
  if exists (select 1 from archive_links where athlete_key = v_key and status = 'approved') then
    raise exception 'That archive name is already attached to an account. If it is yours, email privacy@zerotacky.com.' using errcode = 'P0001';
  end if;
  if exists (select 1 from archive_links where athlete_key = v_key and user_id = v_uid and status = 'pending') then
    raise exception 'You already asked for that name; it is waiting on review.' using errcode = 'P0001';
  end if;
  if (select count(*) from archive_links where user_id = v_uid and status = 'pending') >= 3 then
    raise exception 'Three names are already waiting on review for your account.' using errcode = 'P0001';
  end if;
  v_note := nullif(trim(both from coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 200 then raise exception 'Keep the note to 200 characters.' using errcode = 'P0001'; end if;
  insert into archive_links (athlete_key, user_id, note) values (v_key, v_uid, v_note) returning * into l;
  return zt_archive_link_json(l);
end $$;
revoke all on function zt_archive_claim(text, text) from public, anon;
grant execute on function zt_archive_claim(text, text) to authenticated;

create or replace function zt_archive_withdraw(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); l archive_links;
begin
  if v_uid is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  delete from archive_links where id = p_id and user_id = v_uid and status = 'pending' returning * into l;
  if l.id is null then raise exception 'That request is no longer pending.' using errcode = 'P0001'; end if;
  return jsonb_build_object('id', l.id, 'withdrawn', true);
end $$;
revoke all on function zt_archive_withdraw(uuid) from public, anon;
grant execute on function zt_archive_withdraw(uuid) to authenticated;

create or replace function zt_my_archive_links() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(zt_archive_link_json(l) order by l.created_at desc), '[]'::jsonb) from archive_links l where l.user_id = auth.uid()
$$;
revoke all on function zt_my_archive_links() from public, anon;
grant execute on function zt_my_archive_links() to authenticated;

-- Admin queue: pending links with the account beside the archive name (display name, username, location, email)
-- so the reviewer can see whether the person and the record line up.
create or replace function zt_list_archive_links() returns jsonb language sql stable security definer set search_path = public as $$
  select case when zt_is_admin() then coalesce(jsonb_agg(
    zt_archive_link_json(l) || jsonb_build_object(
      'username', pr.username, 'displayName', pr.display_name, 'location', pr.location, 'email', u.email,
      'states', (select coalesce(array_agg(distinct c.state) filter (where c.state is not null), '{}') from archive_placements p join archive_competitions c on c.id = p.competition_id where p.athlete_key = l.athlete_key),
      'lastDate', (select max(c.date) from archive_placements p join archive_competitions c on c.id = p.competition_id where p.athlete_key = l.athlete_key))
    order by l.created_at), '[]'::jsonb) else '[]'::jsonb end
  from archive_links l join profiles pr on pr.id = l.user_id join auth.users u on u.id = l.user_id
  where l.status = 'pending'
$$;
revoke all on function zt_list_archive_links() from public, anon;
grant execute on function zt_list_archive_links() to authenticated;

create or replace function zt_decide_archive_link(p_id uuid, p_approve boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare l archive_links;
begin
  perform zt_require_admin();
  update archive_links set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now(), decided_by = auth.uid()
    where id = p_id and status = 'pending' returning * into l;
  if l.id is null then raise exception 'That request is no longer pending.' using errcode = 'P0001'; end if;
  if p_approve then
    -- one owner per name: other pending asks for it close as rejected
    update archive_links set status = 'rejected', decided_at = now(), decided_by = auth.uid() where athlete_key = l.athlete_key and status = 'pending';
  end if;
  return zt_archive_link_json(l);
end $$;
revoke all on function zt_decide_archive_link(uuid, boolean) from public, anon;
grant execute on function zt_decide_archive_link(uuid, boolean) to authenticated;

insert into archive_sources (key, name, url, license, license_url, attribution, data_url) values
  ('sr', 'Strongman Results', 'https://strongmanresults.com', 'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/',
   'Archive results via strongmanresults.com (CC BY 4.0); original scoring published on Iron Podium. ZeroTacky is not affiliated with either.',
   'https://strongmanresults.com/downloads/'),
  ('os', 'OpenStrongman', 'https://openstrongman.org', 'CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/',
   'Archive results via openstrongman.org (CC0 1.0, public domain).', 'https://openstrongman.org/data')
on conflict (key) do update set name = excluded.name, url = excluded.url, license = excluded.license, license_url = excluded.license_url,
  attribution = excluded.attribution, data_url = excluded.data_url;
